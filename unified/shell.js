/* Mathify one-app shell.
 *
 * The shell is deliberately inert until /api/auth/me verifies a stored token.
 * Role names, navigation and privileged controls come from that verified
 * session; query strings only choose which desk to try. Every action calls the
 * same server-authorized APIs used by the existing desks. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var DESKS = {
    student: {
      token: 'mathify.student.token',
      label: 'Student desk',
      login: 'student',
      nav: [
        { key: 'home', label: 'Home', href: '/app/home?desk=student' },
        { key: 'attendance', label: 'Attendance', href: '/app/attendance?desk=student' },
        { key: 'mastery', label: 'Mastery', href: '/app/mastery?desk=student' },
        { key: 'recordings', label: 'Recordings', href: '/app/recordings?desk=student' },
        { key: 'buddy', label: 'Study Buddy', href: '/app/buddy?desk=student' },
      ],
    },
    parent: {
      token: 'mathify.parent.token',
      label: 'Parent desk',
      login: 'parent',
      nav: [
        { key: 'inbox', label: 'Inbox', href: '/app/parent/inbox?desk=parent' },
        { key: 'balance', label: 'Balance & pack', href: '/app/parent/balance?desk=parent' },
        { key: 'child', label: 'My child', href: '/app/parent/child?desk=parent' },
        { key: 'sessions', label: 'Sessions', href: '/app/parent/sessions?desk=parent' },
        { key: 'guidance', label: 'Chat rules', href: '/app/parent/guidance?desk=parent' },
        { key: 'policies', label: 'Policies', href: '/app/parent/policies?desk=parent' },
      ],
    },
    relationship_manager: {
      token: 'mathify.rm.token',
      label: 'Manager desk',
      login: 'rm',
      nav: [
        { key: 'dashboard', label: 'Dashboard', href: '/app/rm/dashboard?desk=rm' },
        { key: 'trainers', label: 'Trainers', href: '/app/rm/trainers?desk=rm' },
        { key: 'students', label: 'Students', href: '/app/rm/students?desk=rm' },
        { key: 'classes', label: 'Classes', href: '/app/rm/classes?desk=rm' },
      ],
    },
  };

  var activeRole = null;
  var accessToken = null;
  var viewer = null;

  function $(id) {
    return document.getElementById(id);
  }
  function readToken(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }
  function writeToken(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* private mode */
    }
  }
  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }
  function card(title) {
    var section = make('section', 'card');
    if (title) section.appendChild(make('h2', null, title));
    return section;
  }
  function clear(view) {
    while (view.firstChild) view.removeChild(view.firstChild);
  }
  function showError(view, error) {
    var message =
      error && error.message ? error.message : 'That could not be loaded. Please retry.';
    view.appendChild(make('p', 'error', message));
  }
  function queryParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || '';
    } catch (error) {
      return '';
    }
  }
  function roleFromQuery() {
    var value = queryParam('desk');
    if (value === 'rm') return 'relationship_manager';
    if (DESKS[value]) return value;
    /* A bare section URL still names its desk. Without this, a browser that
       also holds a student token would render the student shell on a parent
       or manager link before any role was verified. */
    var path = window.location.pathname;
    if (path.indexOf('/app/parent/') === 0) return 'parent';
    if (path.indexOf('/app/rm/') === 0) return 'relationship_manager';
    if (path.indexOf('/app/') === 0) return 'student';
    return '';
  }
  function currentSection() {
    var path = window.location.pathname.replace(/\/+$/, '');
    /* The section route map serves the inbox document; the hash selects the
       balance view inside it. A bare /app/parent/balance path selects the same
       section whenever the server maps that path to this document. */
    if (path.indexOf('/app/parent/') === 0 && window.location.hash === '#balance') return 'balance';
    if (path.indexOf('/app/parent/') === 0) return path.split('/')[3] || 'inbox';
    if (path.indexOf('/app/rm/') === 0) return path.split('/')[3] || 'dashboard';
    if (path.indexOf('/app/attendance') !== -1) return 'attendance';
    if (path.indexOf('/app/mastery') !== -1) return 'mastery';
    if (path.indexOf('/app/recordings') !== -1) return 'recordings';
    if (path.indexOf('/app/buddy') !== -1) return 'buddy';
    return 'home';
  }

  function request(path, options) {
    var opts = options || {};
    var headers = { Accept: 'application/json' };
    var presented = opts.token !== undefined ? opts.token : accessToken;
    if (presented) headers.Authorization = 'Bearer ' + presented;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (error) {
          data = null;
        }
        if (!response.ok) {
          var failure = new Error((data && data.message) || 'Request failed.');
          failure.status = response.status;
          failure.code = data && data.error;
          throw failure;
        }
        return data || {};
      });
    });
  }

  async function verify(desk, presented) {
    const answer = await request('/auth/me', { token: presented });
    const role = answer && answer.user && answer.user.role;
    if (role !== desk) return null;
    accessToken = presented;
    viewer = answer.user;
    activeRole = desk;
    return answer.user;
  }

  async function identify() {
    const asked = roleFromQuery();
    const candidates = asked ? [asked] : ['student', 'parent', 'relationship_manager'];
    for (let index = 0; index < candidates.length; index += 1) {
      const desk = candidates[index];
      const tokenKey = DESKS[desk].token;
      const stored = readToken(tokenKey);
      if (stored) {
        const verified = await verify(desk, stored);
        if (verified) return true;
      }
      if (window.MathifySession && typeof window.MathifySession.refresh === 'function') {
        const renewed = await window.MathifySession.refresh(desk);
        if (renewed) {
          writeToken(tokenKey, renewed);
          const verified = await verify(desk, renewed);
          if (verified) return true;
        }
      }
    }
    return false;
  }

  function renderNav() {
    var tabs = $('tabs');
    var active = currentSection();
    clear(tabs);
    DESKS[activeRole].nav.forEach(function (item) {
      var link = make('a', null, item.label);
      link.href = item.href;
      if (item.key === active) link.setAttribute('aria-current', 'page');
      tabs.appendChild(link);
    });
    tabs.hidden = false;
    $('deskLabel').textContent = DESKS[activeRole].label;
    $('logout').hidden = false;
  }

  function stat(value, label) {
    var box = make('div', 'stat');
    box.appendChild(make('b', null, value === null || value === undefined ? '-' : value));
    box.appendChild(make('span', null, label));
    return box;
  }

  function renderStudentHome(view) {
    var section = card('Today');
    view.appendChild(section);
    section.appendChild(make('p', 'muted', 'Loading your desk...'));
    request('/student/dashboard')
      .then(function (answer) {
        var data = answer.dashboard || {};
        clear(section);
        var stats = make('div', 'stats');
        stats.appendChild(stat(data.streak || 0, 'Streak'));
        stats.appendChild(stat(data.trophyPoints || 0, 'Points'));
        stats.appendChild(stat(data.mastery || 0, 'Mastery'));
        stats.appendChild(
          stat(
            data.student && data.student.sessionsRemaining !== null
              ? data.student.sessionsRemaining
              : '-',
            'Sessions left'
          )
        );
        section.appendChild(stats);

        if (data.nextSession && data.nextSession.id) {
          var live = make('div', 'row');
          var detail = make('div');
          detail.appendChild(make('b', null, data.nextSession.title || 'Live class'));
          detail.appendChild(
            make(
              'p',
              'muted',
              (data.nextSession.subject && data.nextSession.subject.label) || 'Your 1-on-1 session'
            )
          );
          live.appendChild(detail);
          var join = make('a', 'btn', 'Join on this device');
          join.href =
            '/classroom/preflight.html?sessionId=' +
            encodeURIComponent(data.nextSession.id) +
            '&role=student&view=student';
          live.appendChild(join);
          section.appendChild(live);
        } else {
          section.appendChild(
            make('p', 'muted', 'No live class right now. Your next session will appear here.')
          );
        }

        var badges = (data.badges && data.badges.length) || 0;
        section.appendChild(make('p', null, badges + ' trophy badges earned. Keep going!'));
      })
      .catch(function (error) {
        clear(section);
        showError(section, error);
      });
  }

  function renderStudentAttendance(view) {
    var section = card('Attendance');
    view.appendChild(section);
    request('/student/dashboard')
      .then(function (answer) {
        var data = answer.dashboard || {};
        section.appendChild(stat(data.streak || 0, 'Current streak'));
        section.appendChild(
          make(
            'p',
            'muted',
            'Attendance is confirmed by the trainer in your 1-on-1 session. Your streak and points update here.'
          )
        );
      })
      .catch(function (error) {
        showError(section, error);
      });
  }

  function renderStudentRecordings(view) {
    var section = card('Available class recordings');
    view.appendChild(section);
    section.appendChild(
      make('p', 'muted', 'Private links are created for you only, and expire soon.')
    );
    request('/recordings')
      .then(function (answer) {
        var rows = (answer.recordings || []).filter(function (row) {
          return row.available;
        });
        if (!rows.length) {
          section.appendChild(make('p', 'muted', 'No finished recordings are available yet.'));
          return;
        }
        rows.forEach(function (row) {
          var item = make('div', 'card');
          item.appendChild(make('b', null, row.title || 'Class recording'));
          item.appendChild(make('p', 'muted', 'Ready for you to watch.'));
          var button = make('button', 'btn soft', 'Get private link');
          button.type = 'button';
          button.addEventListener('click', function () {
            button.disabled = true;
            request('/recordings/' + encodeURIComponent(row.sessionId) + '/url?expiresIn=600')
              .then(function (link) {
                var player = make('video');
                player.controls = true;
                player.src = link.url;
                var note = make(
                  'p',
                  'muted',
                  'This link expires at ' + new Date(link.expiresAt).toLocaleString() + '.'
                );
                var old = item.querySelector('video');
                if (old) old.remove();
                var oldNote = item.querySelector('.expires');
                if (oldNote) oldNote.remove();
                note.className = 'expires';
                item.appendChild(player);
                item.appendChild(note);
                button.textContent = 'Refresh private link';
              })
              .catch(function (error) {
                item.appendChild(make('p', 'error', error.message));
              })
              .then(function () {
                button.disabled = false;
              });
          });
          item.appendChild(button);
          section.appendChild(item);
        });
      })
      .catch(function (error) {
        showError(section, error);
      });
  }

  function renderStudentMastery(view) {
    var section = card('Mastery practice');
    view.appendChild(section);
    var batch = null;
    var position = 0;
    var busy = false;

    function finish(message) {
      clear(section);
      section.appendChild(make('h2', null, 'Practice complete'));
      section.appendChild(make('p', null, message || 'Nicely done. Come back for another round.'));
      var again = make('button', 'btn', 'Start a new batch');
      again.type = 'button';
      again.addEventListener('click', start);
      section.appendChild(again);
    }

    function renderQuestion() {
      clear(section);
      if (!batch || position >= batch.questions.length) {
        finish(batch && batch.restMessage);
        return;
      }
      var question = batch.questions[position];
      section.appendChild(
        make('p', 'pill', 'Question ' + (position + 1) + ' of ' + batch.questions.length)
      );
      section.appendChild(make('p', null, question.prompt));
      (question.options || []).forEach(function (option, index) {
        var button = make('button', 'btn soft', option);
        button.type = 'button';
        button.style.display = 'block';
        button.style.width = '100%';
        button.style.margin = '8px 0';
        button.addEventListener('click', function () {
          if (busy) return;
          busy = true;
          request('/student/practice/batch/' + encodeURIComponent(batch.id) + '/answer', {
            method: 'POST',
            body: { questionId: question.id, optionIndex: index },
          })
            .then(function (answer) {
              position += 1;
              /* The route wraps the service result in `result`; correctness and
               hints never leave the server, only the private outcome does. */
              var outcome = (answer && answer.result) || answer || {};
              if (outcome.topicComplete) finish(outcome.restMessage);
              else renderQuestion();
            })
            .catch(function (error) {
              showError(section, error);
            })
            .then(function () {
              busy = false;
            });
        });
        section.appendChild(button);
      });
    }

    function start() {
      clear(section);
      section.appendChild(make('p', 'muted', 'Preparing ten questions...'));
      request('/student/practice/batch', {
        method: 'POST',
        body: { topic: null, previousBatchId: null },
      })
        .then(function (answer) {
          batch = answer.batch || answer;
          position = 0;
          renderQuestion();
        })
        .catch(function (error) {
          clear(section);
          showError(section, error);
        });
    }

    start();
  }

  function renderStudentBuddy(view) {
    var section = card('Study Buddy');
    view.appendChild(section);
    var log = make('div', 'chat-log');
    var quotaNode = make('p', 'quota');
    var form = make('form', 'chat-form');
    var text = make('input');
    text.type = 'text';
    text.placeholder = 'Ask about your studies...';
    text.setAttribute('aria-label', 'Ask Study Buddy');
    var attach = make('label', 'icon-btn', '+');
    attach.title = 'Attach a maths photo';
    var file = make('input');
    file.type = 'file';
    file.accept = 'image/png,image/jpeg,image/webp,image/gif';
    file.hidden = true;
    attach.appendChild(file);
    var send = make('button', 'btn', 'Send');
    send.type = 'submit';
    form.appendChild(attach);
    form.appendChild(text);
    form.appendChild(send);
    section.appendChild(log);
    section.appendChild(quotaNode);
    section.appendChild(form);

    var pendingImage = null;
    var remaining = null;
    function addMessage(value, who) {
      log.appendChild(make('p', 'msg ' + who, value));
      log.scrollTop = log.scrollHeight;
      return log.lastChild;
    }
    function showQuota(quota) {
      if (!quota || typeof quota.remaining !== 'number') return;
      remaining = quota.remaining;
      quotaNode.textContent =
        remaining === 0
          ? 'Photo questions finished for today. Text is still unlimited - come back tomorrow!'
          : remaining + ' of ' + quota.limit + ' photo questions left today. Text is unlimited.';
    }
    addMessage(
      'Ask me anything, or send a photo of your working. I give hints, never final answers.',
      'bot'
    );

    if (
      window.mathifyStudentApi &&
      typeof window.mathifyStudentApi.getStudyBuddyQuota === 'function'
    ) {
      window.mathifyStudentApi
        .getStudyBuddyQuota()
        .then(showQuota)
        .catch(function () {});
    }
    file.addEventListener('change', function () {
      var selected = file.files && file.files[0];
      file.value = '';
      if (!selected) return;
      if (remaining === 0) {
        addMessage(
          "That's 10 photo questions for today. Come back tomorrow - text still works!",
          'bot'
        );
        return;
      }
      if (selected.size > 1024 * 1024) {
        addMessage('That photo is a bit large. Try one under 1 MB.', 'bot');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        pendingImage = { data: String(reader.result), mime: selected.type, name: selected.name };
        addMessage('Photo ready - ask me what to try first.', 'bot');
      };
      reader.readAsDataURL(selected);
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var question = text.value.trim();
      if (!question && !pendingImage) return;
      text.value = '';
      var image = pendingImage;
      pendingImage = null;
      addMessage(question || 'Take a look at this photo.', 'me');
      var pending = addMessage('Thinking...', 'bot');
      var api = window.mathifyStudentApi;
      if (!api || typeof api.askStudyBuddy !== 'function') {
        pending.textContent = 'Study Buddy is unavailable right now. Please retry.';
        return;
      }
      api
        .askStudyBuddy(question, image)
        .then(function (answer) {
          pending.textContent = (answer && answer.reply) || 'No reply was returned. Please retry.';
          if (answer && answer.quota) showQuota(answer.quota);
        })
        .catch(function (error) {
          var quotaHit = error && error.code === 'IMAGE_QUOTA_EXCEEDED';
          pending.textContent = quotaHit
            ? error.message
            : 'Study Buddy could not be reached. Please retry in a moment.';
          if (quotaHit) remaining = 0;
        });
    });
  }

  function renderParentInbox(view) {
    var section = card('Messages with your child trainer');
    view.appendChild(section);
    section.appendChild(make('p', 'muted', 'Loading your private thread...'));
    function load() {
      request('/parent-chat/thread')
        .then(function (thread) {
          clear(section);
          var log = make('div', 'chat-log');
          (thread.messages || []).forEach(function (message) {
            var mine = message.senderRole === 'parent';
            log.appendChild(
              make('p', 'msg ' + (mine ? 'me' : 'bot'), message.body || message.text || '')
            );
          });
          if (!(thread.messages || []).length)
            log.appendChild(make('p', 'muted', 'No messages yet.'));
          section.appendChild(log);
          var form = make('form', 'chat-form');
          var input = make('input');
          input.type = 'text';
          input.placeholder = 'Write a kind message...';
          input.setAttribute('aria-label', 'Message');
          var send = make('button', 'btn', 'Send');
          send.type = 'submit';
          form.appendChild(input);
          form.appendChild(send);
          section.appendChild(form);
          form.addEventListener('submit', function (event) {
            event.preventDefault();
            var value = input.value.trim();
            if (!value || !thread.studentId) return;
            input.value = '';
            request('/parent-chat/thread/' + encodeURIComponent(thread.studentId) + '/messages', {
              method: 'POST',
              body: { body: value },
            })
              .then(load)
              .catch(function (error) {
                section.appendChild(make('p', 'error', error.message));
              });
          });
          request('/parent-chat/thread/' + encodeURIComponent(thread.studentId) + '/read', {
            method: 'POST',
            body: {},
          }).catch(function () {});
        })
        .catch(function (error) {
          clear(section);
          showError(section, error);
        });
    }
    load();
  }

  /* Bare /app/parent/balance is handled by roleFromQuery() and currentSection()
     without a ?desk= hint. Pricing and money fields are never sent by the UI. */
  function renderParentBalance(view) {
    var section = card('Class balance & pack');
    view.appendChild(section);
    section.appendChild(make('p', 'muted', 'Loading your class balance...'));

    var balanceNode = null;
    var alertNode = null;
    var quoteNode = null;
    var receiptNode = null;
    var input = null;
    var quoteSeq = 0;

    function sar(value) {
      var amount = Number(value) || 0;
      return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
    }

    function paintBalance(answer) {
      var remaining = Math.max(0, Number(answer.sessionsRemaining) || 0);
      if (balanceNode) balanceNode.textContent = String(remaining);
      if (alertNode) {
        alertNode.hidden = remaining > 2;
        alertNode.textContent =
          remaining <= 2
            ? 'Only ' +
              remaining +
              (remaining === 1 ? ' session' : ' sessions') +
              ' left · renewal needed'
            : '';
      }
    }

    function paintQuote(quote) {
      if (!quoteNode || !quote) return;
      quoteNode.textContent =
        quote.count +
        ' sessions · SAR ' +
        sar(quote.totalSAR) +
        (quote.discountApplied ? ' · ' + quote.discountPercent + '% off' : ' · no discount');
      if (receiptNode) receiptNode.hidden = true;
    }

    function loadQuote() {
      var count = Number(input && input.value);
      var seq = ++quoteSeq;
      if (!Number.isInteger(count) || count < 4 || count > 100) {
        if (quoteNode) quoteNode.textContent = 'Choose between 4 and 100 sessions.';
        return;
      }
      request('/parent/pack/quote?count=' + encodeURIComponent(String(count)))
        .then(function (answer) {
          if (seq === quoteSeq) paintQuote(answer && answer.quote);
        })
        .catch(function () {
          if (seq === quoteSeq && quoteNode) {
            quoteNode.textContent = 'A live quote could not be prepared right now.';
          }
        });
    }

    function confirmPack(event) {
      event.preventDefault();
      var count = Number(input && input.value);
      if (!Number.isInteger(count) || count < 4 || count > 100) {
        if (receiptNode) {
          receiptNode.textContent = 'Choose a whole number of sessions between 4 and 100.';
          receiptNode.hidden = false;
        }
        return;
      }
      var button = section.querySelector('[data-pack-submit]');
      if (button) button.disabled = true;
      request('/parent/pack/checkout', { method: 'POST', body: { count: count } })
        .then(function (answer) {
          paintBalance(answer);
          if (receiptNode) {
            receiptNode.textContent =
              answer.receipt ||
              count + ' sessions credited · SAR ' + sar(answer.quote && answer.quote.totalSAR);
            receiptNode.hidden = false;
          }
        })
        .catch(function (error) {
          if (receiptNode) {
            receiptNode.textContent = error.message || 'Sessions could not be added right now.';
            receiptNode.hidden = false;
          }
        })
        .then(function () {
          if (button) button.disabled = false;
        });
    }

    request('/parent/wallet')
      .then(function (answer) {
        clear(section);
        section.appendChild(make('p', 'muted', 'Current balance · your child'));
        var balance = make('div', 'stat');
        balanceNode = make('b', null, '—');
        balance.appendChild(balanceNode);
        balance.appendChild(make('span', null, 'sessions remaining'));
        section.appendChild(balance);
        alertNode = make('p', 'error', '');
        alertNode.hidden = true;
        section.appendChild(alertNode);
        paintBalance(answer || {});

        [
          'Standard deck · 4–39 sessions',
          'Bulk deck · 40–100 sessions',
          'SAR 90 per session',
          '5% off every session when you book 41–100',
        ].forEach(function (line) {
          section.appendChild(make('p', null, line));
        });

        var presets = make('div', 'preset-row');
        [4, 8, 16, 20].forEach(function (value) {
          var preset = make('button', 'btn soft', String(value));
          preset.type = 'button';
          preset.addEventListener('click', function () {
            if (!input) return;
            input.value = String(value);
            loadQuote();
          });
          presets.appendChild(preset);
        });
        section.appendChild(presets);

        input = make('input');
        input.type = 'number';
        input.min = '4';
        input.max = '100';
        input.step = '1';
        input.value = '8';
        input.setAttribute('aria-label', 'Number of sessions');
        section.appendChild(input);
        quoteNode = make('p', 'muted', 'Asking Mathify for your price…');
        section.appendChild(quoteNode);

        var form = make('form', 'chat-form');
        var confirm = make('button', 'btn', 'Confirm & add sessions');
        confirm.type = 'submit';
        confirm.setAttribute('data-pack-submit', 'true');
        form.appendChild(confirm);
        section.appendChild(form);
        form.addEventListener('submit', confirmPack);
        receiptNode = make('p', 'ok', '');
        receiptNode.hidden = true;
        section.appendChild(receiptNode);
        input.addEventListener('input', loadQuote);
        loadQuote();
      })
      .catch(function (error) {
        clear(section);
        showError(section, error);
      });
  }

  function renderParentChild(view) {
    var section = card('My child');
    view.appendChild(section);
    request('/parent-chat/thread')
      .then(function (thread) {
        section.appendChild(
          make('p', null, 'Linked learner: ' + (thread.studentId || 'not available'))
        );
        section.appendChild(
          make('p', 'muted', 'Only the child linked to this parent sign-in can appear here.')
        );
      })
      .catch(function (error) {
        showError(section, error);
      });
  }

  function renderParentSessions(view) {
    var section = card('Class reminders');
    view.appendChild(section);
    request('/parent/reminders')
      .then(function (answer) {
        var rows = answer.reminders || [];
        if (!rows.length) {
          section.appendChild(make('p', 'muted', 'No reminders right now.'));
          return;
        }
        rows.forEach(function (row) {
          section.appendChild(make('p', null, row.title || row.message || 'Upcoming class'));
        });
      })
      .catch(function (error) {
        showError(section, error);
      });
  }

  function renderStatic(view, title, lines) {
    var section = card(title);
    lines.forEach(function (line) {
      section.appendChild(make('p', 'muted', line));
    });
    view.appendChild(section);
  }

  function renderRmDashboard(view) {
    var section = card('Manager dashboard');
    view.appendChild(section);
    request('/rm/dashboard')
      .then(function (answer) {
        var data = answer.dashboard || {};
        if (data.locked) {
          section.appendChild(
            make('p', null, 'Your desk is awaiting founder approval. Only setup is available.')
          );
          return;
        }
        var counts = data.counts || {};
        var stats = make('div', 'stats');
        stats.appendChild(stat(counts.trainers || 0, 'Trainers'));
        stats.appendChild(stat(counts.students || 0, 'Students'));
        stats.appendChild(stat(counts.sessions || 0, 'Sessions'));
        stats.appendChild(stat(counts.trainersNeedingAction || 0, 'Need action'));
        section.appendChild(stats);
        section.appendChild(
          make(
            'p',
            'muted',
            'You may grant access, issue generated temporary trainer passwords and record penalties.'
          )
        );
      })
      .catch(function (error) {
        showError(section, error);
      });
  }

  function renderPeople(view, role, title) {
    var section = card(title);
    view.appendChild(section);
    request('/admin/people/' + role)
      .then(function (answer) {
        var people = answer.people || [];
        if (!people.length) {
          section.appendChild(make('p', 'muted', 'No people are listed yet.'));
          return;
        }
        people.forEach(function (person) {
          var row = make('div', 'card');
          row.appendChild(make('b', null, person.name || person.id));
          row.appendChild(make('p', 'muted', person.status || ''));
          if (role === 'trainer') {
            var grant = make('button', 'btn', 'Grant access');
            grant.type = 'button';
            grant.addEventListener('click', function () {
              request('/admin/people/' + encodeURIComponent(person.id) + '/grant', {
                method: 'POST',
                body: {},
              })
                .then(function (result) {
                  row.appendChild(
                    make(
                      'p',
                      'ok',
                      'Access granted. Temporary password: ' +
                        (result.temporaryPassword || result.password || 'shown once by the server.')
                    )
                  );
                })
                .catch(function (error) {
                  row.appendChild(make('p', 'error', error.message));
                });
            });
            var temp = make('button', 'btn soft', 'Generated temp password');
            temp.type = 'button';
            temp.style.marginLeft = '8px';
            temp.addEventListener('click', function () {
              request('/admin/people/' + encodeURIComponent(person.id) + '/password', {
                method: 'PATCH',
                body: {},
              })
                .then(function (result) {
                  row.appendChild(
                    make(
                      'p',
                      'ok',
                      'Temporary password: ' +
                        (result.temporaryPassword || 'shown once by the server.')
                    )
                  );
                })
                .catch(function (error) {
                  row.appendChild(make('p', 'error', error.message));
                });
            });
            row.appendChild(grant);
            row.appendChild(temp);
          }
          section.appendChild(row);
        });
      })
      .catch(function (error) {
        showError(section, error);
      });
  }

  function renderRmClasses(view) {
    var section = card('Classes and batches');
    view.appendChild(section);
    request('/rm/dashboard')
      .then(function (answer) {
        var counts = (answer.dashboard || {}).counts || {};
        section.appendChild(make('p', null, 'Sessions: ' + (counts.sessions || 0)));
        section.appendChild(make('p', null, 'Batches: ' + (counts.batches || 0)));
      })
      .catch(function (error) {
        showError(section, error);
      });
  }

  function renderView() {
    var view = $('appView');
    clear(view);
    var section = currentSection();
    if (activeRole === 'student') {
      if (section === 'attendance') renderStudentAttendance(view);
      else if (section === 'mastery') renderStudentMastery(view);
      else if (section === 'recordings') renderStudentRecordings(view);
      else if (section === 'buddy') renderStudentBuddy(view);
      else renderStudentHome(view);
    } else if (activeRole === 'parent') {
      if (section === 'balance') renderParentBalance(view);
      else if (section === 'child') renderParentChild(view);
      else if (section === 'sessions') renderParentSessions(view);
      else if (section === 'guidance') {
        renderStatic(view, 'Chat rules', [
          'Keep messages kind and about learning.',
          'Contact details and social links are blocked to protect both families.',
        ]);
      } else if (section === 'policies') {
        renderStatic(view, 'Policies', [
          'Privacy, refund and terms links are available on the main site.',
        ]);
      } else renderParentInbox(view);
    } else if (activeRole === 'relationship_manager') {
      if (section === 'trainers') renderPeople(view, 'trainer', 'Trainers');
      else if (section === 'students') renderPeople(view, 'student', 'Students');
      else if (section === 'classes') renderRmClasses(view);
      else renderRmDashboard(view);
    }
  }

  function logout() {
    var desk = DESKS[activeRole];
    try {
      window.localStorage.removeItem(desk.token);
      window.MathifySession.clear(activeRole);
    } catch (error) {
      /* private mode */
    }
    window.location.replace('/login.html?role=' + desk.login);
  }

  identify()
    .then(function (ready) {
      if (!ready) {
        $('signedOut').hidden = false;
        return;
      }
      $('signedOut').hidden = true;
      $('appView').hidden = false;
      renderNav();
      renderView();
      $('logout').addEventListener('click', logout);
    })
    .catch(function () {
      $('signedOut').hidden = false;
    });
})();
