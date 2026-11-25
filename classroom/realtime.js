/* ==========================================================================
   MATHIFY — browser Supabase Realtime bridge

   Only the publishable key is fetched from /api/public/config. The server
   secret key is never sent to a browser. A signed-in host passes the user's
   Supabase access token and session UUID on window; RLS then permits trainer
   writes and participant reads on public.quiz_canvas_strokes.
   ========================================================================== */
(function () {
  'use strict';

  var link = null;

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(String(value || ''));
  }

  function disabled() {
    return {
      enabled: false,
      send: function () { return Promise.resolve(false); },
      close: function () {}
    };
  }

  async function connect(options) {
    if (link) return link;

    var sessionId = options && options.sessionId;
    var accessToken = options && options.accessToken;
    if (!isUuid(sessionId) || !accessToken) return disabled();

    try {
      var response = await fetch('/api/public/config', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin'
      });
      if (!response.ok) return disabled();

      var config = await response.json();
      if (!config.supabase || !config.supabase.realtimeEnabled) return disabled();

      var supabaseJs = await import('https://esm.sh/@supabase/supabase-js@2');
      var createClient = supabaseJs.createClient;
      if (typeof createClient !== 'function') return disabled();

      var client = createClient(config.supabase.url, config.supabase.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: 'Bearer ' + accessToken } },
        realtime: { params: { accessToken: accessToken }, eventsPerSecond: 20 }
      });

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
          channel.unsubscribe();
          link = null;
        }
      };
      return link;
    } catch (error) {
      console.warn('[mathify-realtime] Supabase Realtime unavailable:', error.message);
      return disabled();
    }
  }

  window.classroomRealtime = { connect: connect, isUuid: isUuid };
})();
