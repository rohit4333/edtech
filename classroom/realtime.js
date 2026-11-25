/* ==========================================================================
   MATHIFY — browser session bridge

   Two transports:
     1. Supabase Realtime for Wacom/whiteboard strokes (when configured).
     2. The server's browser-safe event stream for quiz/session state. This is
        the authoritative fallback and carries no correctness or answer keys.
   Only the publishable key is fetched from /api/public/config. The server
   secret key is never sent to a browser.
   ========================================================================== */
(function () {
  'use strict';

  var link = null;

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(String(value || ''));
  }

  /* Polls /api/sessions/:id/events. Events are key-free and idempotent: the
     cursor advances only for events the caller has been handed. */
  function startEventPolling(sessionId, options) {
    var since = Number(options && options.since) || 0;
    var stopped = false;
    var inFlight = false;

    function tick() {
      if (stopped || inFlight || !window.mathifyClassroomApi) return;
      inFlight = true;
      window.mathifyClassroomApi.getSessionEvents(sessionId, since)
        .then(function (events) {
          (events || []).forEach(function (event) {
            if (!event || typeof event.seq !== 'number' || event.seq <= since) return;
            since = event.seq;
            if (options && options.onEvent) options.onEvent(event);
          });
        })
        .catch(function () { /* offline: retry on the next tick */ })
        .then(function () { inFlight = false; }, function () { inFlight = false; });
    }

    var timer = setInterval(tick, 1200);
    tick();
    return {
      stop: function () { stopped = true; clearInterval(timer); },
      since: function () { return since; }
    };
  }

  function disabled(sessionId, options) {
    var polling = sessionId ? startEventPolling(sessionId, options) : null;
    return {
      enabled: false,
      send: function () { return Promise.resolve(false); },
      close: function () { if (polling) polling.stop(); }
    };
  }

  async function connect(options) {
    if (link) return link;

    var sessionId = options && options.sessionId;
    var accessToken = options && options.accessToken;
    if (!sessionId) return disabled(null, options);

    /* Mock sessions are not UUIDs. They still need the event stream. */
    if (!isUuid(sessionId) || !accessToken || !window.mathifyClassroomApi) {
      link = disabled(sessionId, options);
      return link;
    }

    try {
      var response = await fetch('/api/public/config', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      if (!response.ok) {
        link = disabled(sessionId, options);
        return link;
      }

      var config = await response.json();
      if (!config.supabase || !config.supabase.realtimeEnabled) {
        link = disabled(sessionId, options);
        return link;
      }

      var supabaseJs = await import('https://esm.sh/@supabase/supabase-js@2');
      var createClient = supabaseJs.createClient;
      if (typeof createClient !== 'function') {
        link = disabled(sessionId, options);
        return link;
      }

      var client = createClient(config.supabase.url, config.supabase.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: 'Bearer ' + accessToken } },
        realtime: { params: { accessToken: accessToken }, eventsPerSecond: 20 }
      });

      var polling = startEventPolling(sessionId, options);
      var channel = client.channel('mathify:session:' + sessionId);
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quiz_canvas_strokes',
          filter: 'session_id=eq.' + sessionId
        },
        function (payload) {
          if (options.onStroke) options.onStroke(payload.new);
        }
      );
      channel.subscribe(function (status) {
        if (status === 'SUBSCRIBED' && options.onStatus) options.onStatus('live');
      });

      var seq = 0;
      link = {
        enabled: true,
        send: function (stroke) {
          seq += 1;
          return client.from('quiz_canvas_strokes').insert(Object.assign({}, stroke, {
            session_id: sessionId,
            seq: seq,
            surface: 'quiz-wacom'
          })).then(function (result) {
            if (result.error) throw result.error;
            return true;
          });
        },
        close: function () {
          polling.stop();
          channel.unsubscribe();
          link = null;
        }
      };
      return link;
    } catch (error) {
      console.warn('[mathify-realtime] Supabase Realtime unavailable:', error.message);
      link = disabled(sessionId, options);
      return link;
    }
  }

  window.classroomRealtime = { connect: connect, isUuid: isUuid };
})();
