/* Relationship manager desk. The server enforces the boundary: this client
   offers grant, penalty and one scoped recovery control — a generated temporary
   password for an approved trainer. It never offers revoke, a chosen or
   replaced credential, a founder-set base-rate editor or a salary field. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEYS = ['mathify.classroom.token.relationship_manager', 'mathify.rm.token'];
  var LOGIN_PAGE = '/login.html?role=rm';

  function byId(id) { return document.getElementById(id); }

  function token() {
    for (var i = 0; i < TOKEN_KEYS.length; i += 1) {
      try {
        var value = window.localStorage.getItem(TOKEN_KEYS[i]);
        if (value) return value;
      } catch (error) { /* private mode */ }
    }
    return null;
  }

  function logout() {
    TOKEN_KEYS.forEach(function (key) {
      try { window.localStorage.removeItem(key); } catch (error) { /* private mode */ }
    });
    window.location.replace(LOGIN_PAGE);
  }

  function requireLogin() {
    var next = window.location.pathname + window.location.search;
    window.location.replace(LOGIN_PAGE + '&next=' + encodeURIComponent(next));
    throw new Error('SIGN_IN_REQUIRED');
  }

  function request(path, body, method) {
    var headers = { Accept: 'application/json' };
    var value = token();
    if (value) headers.Authorization = 'Bearer ' + value;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(BASE + path, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.status === 401 || response.status === 403) {
          if (response.status === 401) requireLogin();
          var problem = new Error((data && data.message) || 'This action is not available to your account.');
          problem.code = data && data.error;
          throw problem;
        }
        if (!response.ok) {
          var failure = new Error((data && data.message) || 'Request failed.');
          failure.code = data && data.error;
          throw failure;
        }
        return data;
      });
    });
  }

  function say(node, message, tone) {
    if (!node) return;
    node.textContent = message || '';
    if (tone) node.setAttribute('data-tone', tone);
    else node.removeAttribute('data-tone');
  }

  function node(tag, className, text) {
    var item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined && text !== null) item.textContent = String(text);
    return item;
  }

  function fillSelect(select, rows, placeholder, labelFor, valueFor) {
    if (!select) return;
    select.innerHTML = '';
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);
    rows.forEach(function (row) {
      var option = document.createElement('option');
      option.value = valueFor(row);
      option.textContent = labelFor(row);
      select.appendChild(option);
    });
  }

  function renderFacts(target, pairs) {
    if (!target) return;
    target.innerHTML = '';
    var list = node('dl', 'detail-list');
    pairs.forEach(function (pair) {
      var row = node('div');
      row.appendChild(node('b', null, pair[0] + ': '));
      row.appendChild(document.createTextNode(pair[1] === null || pair[1] === undefined || pair[1] === '' ? '—' : String(pair[1])));
      list.appendChild(row);
    });
    target.appendChild(list);
  }

  function disableForm(form, disabled) {
    if (!form) return;
    Array.prototype.forEach.call(form.querySelectorAll('input, button, select, textarea'), function (field) {
      field.disabled = disabled;
    });
  }

  /* A trainer whose desk was opened by the founder needs no further manager
     work: the handover, batch, rate and penalty decisions are already owned.
     The scoped temporary-password recovery stays available. */
  function founderManaged(person) {
    if (person.status !== 'active' || !person.accessGrantedAt) return false;
    if (person.accessGrantedByRole) return person.accessGrantedByRole !== 'relationship_manager';
    return /^(usr_founder|founder)/.test(String(person.accessGrantedBy || ''));
  }

  function clearHandover() {
    ['rmHandoverEmail', 'rmHandoverPassword'].forEach(function (id) {
      var field = byId(id);
      if (field) field.textContent = '';
    });
  }

  function showHandover(email, password) {
    var emailField = byId('rmHandoverEmail');
    var passwordField = byId('rmHandoverPassword');
    if (emailField) emailField.textContent = email || '';
    if (passwordField) passwordField.textContent = password || '';
  }

  var state = { trainers: [], students: [], batches: [], penalties: [], trainer: null, student: null };

  function loadDashboard() {
    return request('/rm/dashboard').then(function (data) {
      var view = data.dashboard || {};
      var profile = byId('profileName');
      if (profile) profile.textContent = view.name || 'Relationship manager';
      var stats = byId('rmStats');
      if (stats) {
        stats.innerHTML = '';
        if (view.locked) {
          var note = node('div', 'locked-note');
          note.appendChild(node('strong', null, 'Founder approval pending'));
          note.appendChild(document.createTextNode(
            (data.access && data.access.reason) || 'Your KYC is under review. The founder will grant the desk after validation.'
          ));
          stats.appendChild(note);
          say(byId('rmDashboardStatus'), 'Account created. Complete KYC above and wait for founder approval.', 'error');
        } else {
          Object.keys(view.counts || {}).forEach(function (key) {
            var card = node('div', 'stat');
            card.appendChild(node('b', null, view.counts[key]));
            card.appendChild(node('span', null,
              key === 'trainersNeedingAction' ? 'trainers awaiting manager action' : key));
            stats.appendChild(card);
          });
          if (view.monthlySalary) {
            var salary = node('div', 'stat');
            salary.appendChild(node('b', null, '₹' + Number(view.monthlySalary).toLocaleString('en-IN')));
            salary.appendChild(node('span', null, 'monthly salary'));
            stats.appendChild(salary);
          }
          say(byId('rmDashboardStatus'), 'Desk active · founder-authorised support access', 'success');
        }
      }
    }).catch(function (error) {
      say(byId('rmDashboardStatus'), error.message || 'Desk could not be loaded.', 'error');
    });
  }

  function loadPeople() {
    return Promise.all([
      request('/admin/people/trainer'),
      request('/admin/people/student'),
      request('/admin/batches'),
      request('/admin/trainer-onboarding?reveal=false')
    ]).then(function (results) {
      state.trainers = (results[0] && results[0].people) || [];
      state.students = (results[1] && results[1].people) || [];
      state.batches = (results[2] && results[2].batches) || [];
      fillSelect(byId('rmTrainerSelect'), state.trainers, 'Choose a trainer…',
        function (row) { return row.name + ' · ' + row.status; },
        function (row) { return row.id; });
      fillSelect(byId('rmStudentSelect'), state.students, 'Choose a student…',
        function (row) { return row.name + ' · ' + row.status; },
        function (row) { return row.id; });
      fillSelect(byId('rmBatchSelect'), state.batches, 'Choose a batch…',
        function (row) { return row.title || row.id; },
        function (row) { return row.id; });
      say(byId('rmTrainerStatus'), state.trainers.length + ' trainer accounts available.');
      say(byId('rmStudentStatus'), state.students.length + ' student accounts available.');
      return loadAllPenalties();
    }).then(function () {
      return loadClassOverview();
    }).catch(function (error) {
      say(byId('rmTrainerStatus'), error.message || 'Trainer records could not be loaded.', 'error');
    });
  }

  function loadAllPenalties() {
    var target = byId('rmPenaltyList');
    return Promise.all(state.trainers.map(function (trainer) {
      return request('/admin/people/' + encodeURIComponent(trainer.id) + '/penalties')
        .then(function (data) { return (data && data.penalties) || []; })
        .catch(function () { return []; });
    })).then(function (groups) {
      state.penalties = groups.reduce(function (all, group) { return all.concat(group); }, []);
      if (!target) return;
      target.innerHTML = '';
      if (!state.penalties.length) {
        target.appendChild(node('p', 'admin-hint', 'No penalties recorded yet.'));
        return;
      }
      state.penalties.forEach(function (penalty) {
        var row = node('div', 'penalty-row');
        var label = penalty.trainerName + ' · ₹' + penalty.amount + ' · ' + penalty.reason +
          ' · ' + penalty.status;
        row.appendChild(node('span', null, label));
        if (penalty.status !== 'revoked') {
          var button = node('button', 'btn btn-ghost btn-sm', 'Revoke');
          button.type = 'button';
          button.addEventListener('click', function () {
            request('/admin/penalties/' + encodeURIComponent(penalty.id) + '/revoke', {}, 'PATCH')
              .then(function () { return loadAllPenalties(); })
              .catch(function (error) { say(byId('rmTrainerStatus'), error.message, 'error'); });
          });
          row.appendChild(button);
        }
        target.appendChild(row);
      });
    });
  }

  function loadClassOverview() {
    var target = byId('rmClassOverview');
    if (!target) return Promise.resolve();
    return request('/admin/batches').then(function (data) {
      var batches = (data && data.batches) || [];
      target.innerHTML = '';
      if (!batches.length) {
        var empty = node('tr');
        var cell = node('td', null, 'No enrolled batches yet.');
        cell.colSpan = 4;
        empty.appendChild(cell);
        target.appendChild(empty);
        return;
      }
      batches.forEach(function (batch) {
        var row = node('tr');
        [batch.title || batch.id, batch.studentName || batch.studentId || '—',
          batch.trainerName || batch.trainerId || 'Unassigned', batch.status || 'planned'
        ].forEach(function (value) { row.appendChild(node('td', null, value)); });
        target.appendChild(row);
      });
    });
  }

  function loadTrainerDetail(id) {
    return request('/admin/people/trainer/' + encodeURIComponent(id)).then(function (data) {
      state.trainer = data;
      var person = data.person || {};
      renderFacts(byId('rmTrainerDetail'), [
        ['Name', person.name], ['Email', person.email], ['Status', person.status],
        ['Base rate (founder set)', person.payPerSession ? '₹' + person.payPerSession + ' / session' : 'Not set'],
        ['Access granted', person.accessGrantedAt], ['Sessions', (data.sessions || []).length],
        ['Batches', (data.batches || []).length],
        ['KYC', data.onboarding ? data.onboarding.status : 'Not submitted']
      ]);
      var summary = byId('rmTrainerSummary');
      if (summary) summary.textContent = person.name + ' · ' + person.status;
      var rate = byId('rmBaseRate');
      if (rate && person.payPerSession) rate.value = String(person.payPerSession);
      var handled = founderManaged(person);
      var rateLocked = handled || person.status !== 'pending' ||
        Boolean(person.rateLockedAt) || person.rateSetByRole === 'founder';
      disableForm(byId('rmRateForm'), rateLocked);
      var grant = byId('rmGrantTrainer');
      if (grant) grant.disabled = handled;
      var assign = byId('rmAssignBatch');
      if (assign) assign.disabled = handled;
      disableForm(byId('rmPenaltyForm'), handled);
      if (handled) {
        clearHandover();
        say(byId('rmTrainerStatus'),
          "Founder has completed this trainer's onboarding. No manager action remains; base pay is locked. " +
          'You may still issue a temporary trainer password if needed.',
          'success');
        return;
      }
      if (rateLocked) {
        say(byId('rmTrainerStatus'),
          person.name + ' is past onboarding. The base rate is locked to the founder decision.', 'error');
      } else if (person.status === 'pending') {
        say(byId('rmTrainerStatus'),
          person.name + ' record loaded. Grant, onboarding rate and penalty controls are enabled.', 'success');
      }
    }).catch(function (error) {
      say(byId('rmTrainerStatus'), error.message || 'Trainer detail could not be loaded.', 'error');
    });
  }

  function loadStudentDetail(id) {
    return request('/admin/people/student/' + encodeURIComponent(id)).then(function (data) {
      state.student = data;
      var person = data.person || {};
      renderFacts(byId('rmStudentDetail'), [
        ['Name', person.name], ['Email', person.email], ['Status', person.status],
        ['Grade', person.grade], ['Mastery', person.mastery],
        ['Sessions remaining', person.sessionsRemaining],
        ['Enrolled batch', data.batch ? (data.batch.title || data.batch.id) : 'None'],
        ['Sessions', (data.sessions || []).length]
      ]);
      var summary = byId('rmStudentSummary');
      if (summary) summary.textContent = person.name + ' · ' + person.status;
      say(byId('rmStudentStatus'), person.name + ' record loaded.', 'success');
    }).catch(function (error) {
      say(byId('rmStudentStatus'), error.message || 'Student detail could not be loaded.', 'error');
    });
  }

  function copyText(value, button) {
    if (!value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        if (button) button.textContent = 'Copied';
      });
    } else {
      if (button) button.textContent = 'Copy manually';
    }
  }

  function bind() {
    var profileButton = byId('profileBtn');
    var profilePanel = byId('profilePanel');
    if (profileButton && profilePanel) {
      profileButton.addEventListener('click', function () {
        var open = profilePanel.hidden;
        profilePanel.hidden = !open;
        profileButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    var logoutButton = byId('logoutBtn');
    if (logoutButton) logoutButton.addEventListener('click', logout);

    var trainerSelect = byId('rmTrainerSelect');
    if (trainerSelect) trainerSelect.addEventListener('change', function () {
      if (trainerSelect.value) loadTrainerDetail(trainerSelect.value);
    });
    var studentSelect = byId('rmStudentSelect');
    if (studentSelect) studentSelect.addEventListener('change', function () {
      if (studentSelect.value) loadStudentDetail(studentSelect.value);
    });

    var grantTrainer = byId('rmGrantTrainer');
    if (grantTrainer) grantTrainer.addEventListener('click', function () {
      var id = trainerSelect && trainerSelect.value;
      if (!id) return;
      grantTrainer.disabled = true;
      request('/admin/people/' + encodeURIComponent(id) + '/grant', {}, 'POST').then(function (data) {
        showHandover(data.email || (data.person && data.person.email), data.password);
        say(byId('rmTrainerStatus'), 'Access granted. Copy the email and first password before handing them over.', 'success');
        return loadPeople().then(function () { return loadTrainerDetail(id); });
      }).catch(function (error) {
        say(byId('rmTrainerStatus'), error.message || 'Access could not be granted.', 'error');
      }).then(function () { grantTrainer.disabled = false; });
    });

    var issueTrainerPassword = byId('rmIssueTrainerPassword');
    if (issueTrainerPassword) issueTrainerPassword.addEventListener('click', function () {
      var id = trainerSelect && trainerSelect.value;
      if (!id) return;
      issueTrainerPassword.disabled = true;
      /* No password field: the server generates firstname@mathify123 and
         refuses a manager-chosen value. */
      request('/admin/people/' + encodeURIComponent(id) + '/password', { generated: true }, 'PATCH')
        .then(function (data) {
          showHandover(data.email || (data.person && data.person.email), data.temporaryPassword);
          say(byId('rmTrainerStatus'),
            'Temporary trainer password issued and logged. Copy the email and one-time password now.', 'success');
        })
        .catch(function (error) {
          say(byId('rmTrainerStatus'), error.message || 'A temporary password could not be issued.', 'error');
        })
        .then(function () { issueTrainerPassword.disabled = false; });
    });

    var assign = byId('rmAssignBatch');
    if (assign) assign.addEventListener('click', function () {
      var trainerId = trainerSelect && trainerSelect.value;
      var batchId = byId('rmBatchSelect') && byId('rmBatchSelect').value;
      var startsAt = byId('rmBatchStart') && byId('rmBatchStart').value;
      if (!trainerId || !batchId) return;
      assign.disabled = true;
      var body = { trainerId: trainerId, slots: [] };
      if (startsAt) body.slots = [{ startsAt: new Date(startsAt).toISOString() }];
      request('/admin/batches/' + encodeURIComponent(batchId) + '/allot', body, 'POST')
        .then(function () {
          say(byId('rmTrainerStatus'), 'Batch assigned to the trainer.', 'success');
          return loadClassOverview();
        })
        .catch(function (error) {
          say(byId('rmTrainerStatus'), error.message || 'Batch could not be assigned.', 'error');
        })
        .then(function () { assign.disabled = false; });
    });

    var rateForm = byId('rmRateForm');
    if (rateForm) rateForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var id = trainerSelect && trainerSelect.value;
      if (!id) return;
      request('/admin/people/' + encodeURIComponent(id) + '/base-rate',
        { rate: byId('rmBaseRate').value }, 'PATCH')
        .then(function (data) {
          say(byId('rmTrainerStatus'), data.person.bandWarning ||
            'Onboarding base rate set once and logged for the founder.', 'success');
          return loadTrainerDetail(id);
        })
        .catch(function (error) {
          say(byId('rmTrainerStatus'), error.message || 'Rate could not be set.', 'error');
        });
    });

    var penaltyForm = byId('rmPenaltyForm');
    if (penaltyForm) penaltyForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var id = trainerSelect && trainerSelect.value;
      if (!id) return;
      request('/admin/people/' + encodeURIComponent(id) + '/penalties', {
        amount: byId('rmPenaltyAmount').value,
        reason: byId('rmPenaltyReason').value
      }, 'POST').then(function () {
        byId('rmPenaltyAmount').value = '';
        byId('rmPenaltyReason').value = '';
        say(byId('rmTrainerStatus'), 'Penalty recorded and audited.', 'success');
        return loadAllPenalties();
      }).catch(function (error) {
        say(byId('rmTrainerStatus'), error.message || 'Penalty could not be recorded.', 'error');
      });
    });

    var grantStudent = byId('rmGrantStudent');
    if (grantStudent) grantStudent.addEventListener('click', function () {
      var id = studentSelect && studentSelect.value;
      if (!id) return;
      grantStudent.disabled = true;
      request('/admin/people/' + encodeURIComponent(id) + '/access', { status: 'active' }, 'PATCH')
        .then(function () {
          say(byId('rmStudentStatus'), 'Student access granted.', 'success');
          return loadPeople();
        })
        .catch(function (error) {
          say(byId('rmStudentStatus'), error.message || 'Student access could not be granted.', 'error');
        })
        .then(function () { grantStudent.disabled = false; });
    });

    var copyEmail = byId('rmCopyEmail');
    if (copyEmail) copyEmail.addEventListener('click', function () {
      copyText(byId('rmHandoverEmail') && byId('rmHandoverEmail').textContent, copyEmail);
    });
    var copyPassword = byId('rmCopyPassword');
    if (copyPassword) copyPassword.addEventListener('click', function () {
      copyText(byId('rmHandoverPassword') && byId('rmHandoverPassword').textContent, copyPassword);
    });
  }

  function loadDemoRequests() {
    return request('/admin/demos').then(function (data) {
      var body = byId('rmDemoRows');
      if (!body) return;
      body.textContent = '';
      var rows = (data && data.demos) || [];
      if (!rows.length) {
        var empty = node('tr', null, null);
        empty.appendChild(node('td', null, 'No demo requests yet.')).colSpan = 5;
        body.appendChild(empty);
        return;
      }
      rows.forEach(function (demo) {
        var row = node('tr', null, null);
        [demo.demoId, demo.childName, (demo.curriculum || '—') + ' · ' + (demo.grade || '—'),
          demo.trainerName || 'Pending assignment'
        ].forEach(function (value) { row.appendChild(node('td', null, value)); });
        row.appendChild(node('td', null, demo.credentialsIssued
          ? 'Sent at booking · family-owned' : 'Pending booking'));
        body.appendChild(row);
      });
    }).catch(function (error) {
      say(byId('rmDemoStatus'), error.message || 'Demo requests could not be loaded.', 'error');
    });
  }

  if (!token()) requireLogin();
  bind();
  loadDashboard().then(loadPeople);
  loadDemoRequests();
}());
