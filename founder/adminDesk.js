/* Founder people administration.
 *
 * Every control here maps to a founder-only server route. A relationship
 * manager uses the same routes for grant and penalty actions, but the server
 * refuses revoke, credential replacement and base-rate edits for that role. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEY = 'mathify.classroom.token.founder';

  function byId(id) { return document.getElementById(id); }

  function token() {
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (error) { return null; }
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
          var problem = new Error((data && data.message) || 'Founder access is required.');
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

  function fillSelect(select, rows, placeholder) {
    if (!select) return;
    select.innerHTML = '';
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.appendChild(empty);
    rows.forEach(function (row) {
      var option = document.createElement('option');
      option.value = row.id;
      option.textContent = row.name + ' · ' + (row.status || 'active');
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
      row.appendChild(document.createTextNode(
        pair[1] === null || pair[1] === undefined || pair[1] === '' ? '—' : String(pair[1])
      ));
      list.appendChild(row);
    });
    target.appendChild(list);
  }

  var state = { trainers: [], students: [], batches: [], trainer: null, student: null };

  function loadOverview() {
    var target = byId('trainerClassOverview');
    var studentTarget = byId('studentClassOverview');
    return request('/admin/batches').then(function (data) {
      state.batches = (data && data.batches) || [];
      fillSelect(byId('adminBatchSelect'), state.batches, 'Choose a batch…');
      [target, studentTarget].forEach(function (table) {
        if (!table) return;
        table.innerHTML = '';
        if (!state.batches.length) {
          var empty = node('tr');
          var cell = node('td', null, 'No enrolled batches yet.');
          cell.colSpan = 4;
          empty.appendChild(cell);
          table.appendChild(empty);
          return;
        }
        state.batches.forEach(function (batch) {
          var row = node('tr');
          [batch.title || batch.id, batch.studentName || batch.studentId || '—',
            batch.trainerName || batch.trainerId || 'Unassigned', batch.status || 'planned'
          ].forEach(function (value) { row.appendChild(node('td', null, value)); });
          table.appendChild(row);
        });
      });
    });
  }

  function loadAuditLog() {
    var rows = byId('auditLogRows');
    return request('/admin/audit?role=relationship_manager').then(function (data) {
      var entries = (data && data.entries) || [];
      if (!rows) return entries;
      rows.innerHTML = '';
      if (!entries.length) {
        var empty = node('tr');
        var cell = node('td', null, 'No manager activity has been recorded yet.');
        cell.colSpan = 5;
        empty.appendChild(cell);
        rows.appendChild(empty);
      } else {
        entries.forEach(function (entry) {
          var detail = Object.keys(entry.detail || {}).map(function (key) {
            return key + ': ' + entry.detail[key];
          }).join(' · ');
          var row = node('tr');
          [entry.at, entry.actorName || entry.actorRole || 'Unknown',
            entry.action,
            entry.targetName || entry.targetId || '—',
            detail || '—'
          ].forEach(function (value) { row.appendChild(node('td', null, value)); });
          rows.appendChild(row);
        });
      }
      say(byId('auditLogStatus'), entries.length
        ? entries.length + ' manager actions recorded · ' + (data.logFile || 'server/logs/admin-actions.jsonl')
        : 'No manager actions recorded yet · ' + (data.logFile || 'server/logs/admin-actions.jsonl'));
      return entries;
    }).catch(function (error) {
      say(byId('auditLogStatus'), error.message || 'Manager activity could not be loaded.', 'error');
      if (rows) {
        rows.innerHTML = '';
        var empty = node('tr');
        var cell = node('td', null, 'Manager activity could not be loaded.');
        cell.colSpan = 5;
        empty.appendChild(cell);
        rows.appendChild(empty);
      }
      return [];
    });
  }

  function loadPeople() {
    return Promise.all([
      request('/admin/people/trainer'),
      request('/admin/people/student'),
      request('/admin/trainer-onboarding?reveal=true')
    ]).then(function (results) {
      state.trainers = (results[0] && results[0].people) || [];
      state.students = (results[1] && results[1].people) || [];
      fillSelect(byId('trainerAdminSelect'), state.trainers, 'Choose a trainer…');
      fillSelect(byId('studentAdminSelect'), state.students, 'Choose a student…');
      say(byId('trainerAdminStatus'), state.trainers.length + ' trainer accounts · founder controls active');
      say(byId('studentAdminStatus'), state.students.length + ' student accounts · founder controls active');
      return loadOverview();
    }).catch(function (error) {
      say(byId('trainerAdminStatus'), error.message || 'Trainer accounts could not be loaded.', 'error');
      say(byId('studentAdminStatus'), error.message || 'Student accounts could not be loaded.', 'error');
    });
  }

  function loadTrainerDetail(id) {
    return request('/admin/people/trainer/' + encodeURIComponent(id)).then(function (data) {
      state.trainer = data;
      var person = data.person || {};
      renderFacts(byId('trainerDetailData'), [
        ['Name', person.name], ['Email', person.email], ['Status', person.status],
        ['Base rate', person.payPerSession ? '₹' + person.payPerSession + ' / session' : 'Not set'],
        ['Access granted', person.accessGrantedAt], ['Sessions', (data.sessions || []).length],
        ['Batches', (data.batches || []).length],
        ['KYC', data.onboarding ? data.onboarding.status : 'Not submitted']
      ]);
      var summary = byId('trainerAdminSummary');
      if (summary) summary.textContent = person.name + ' · ' + person.status;
      var rate = byId('trainerBaseRate');
      if (rate && person.payPerSession) rate.value = String(person.payPerSession);
      var list = byId('trainerBatchList');
      if (list) {
        list.innerHTML = '';
        (data.batches || []).forEach(function (batch) {
          list.appendChild(node('p', 'admin-hint', batch.title || batch.id));
        });
        if (!(data.batches || []).length) list.appendChild(node('p', 'admin-hint', 'No batches assigned.'));
      }
      return loadPenalties(id, person.name);
    }).catch(function (error) {
      say(byId('trainerAdminStatus'), error.message || 'Trainer detail could not be loaded.', 'error');
    });
  }

  function loadStudentDetail(id) {
    return request('/admin/people/student/' + encodeURIComponent(id)).then(function (data) {
      state.student = data;
      var person = data.person || {};
      renderFacts(byId('studentDetailData'), [
        ['Name', person.name], ['Email', person.email], ['Status', person.status],
        ['Grade', person.grade], ['Mastery', person.mastery],
        ['Sessions remaining', person.sessionsRemaining],
        ['Enrolled batch', data.batch ? (data.batch.title || data.batch.id) : 'None'],
        ['Practice batches', (data.practiceBatches || []).length],
        ['Sessions', (data.sessions || []).length]
      ]);
      var summary = byId('studentAdminSummary');
      if (summary) summary.textContent = person.name + ' · ' + person.status;
    }).catch(function (error) {
      say(byId('studentAdminStatus'), error.message || 'Student detail could not be loaded.', 'error');
    });
  }

  function loadPenalties(id, name) {
    var target = byId('trainerPenaltyList');
    if (!target) return Promise.resolve();
    return request('/admin/people/' + encodeURIComponent(id) + '/penalties').then(function (data) {
      var rows = (data && data.penalties) || [];
      target.innerHTML = '';
      if (!rows.length) {
        target.appendChild(node('p', 'admin-hint', 'No penalties recorded for ' + name + '.'));
        return;
      }
      rows.forEach(function (penalty) {
        var row = node('div', 'penalty-row');
        row.appendChild(node('span', null,
          '₹' + penalty.amount + ' · ' + penalty.reason + ' · ' + penalty.status));
        if (penalty.status !== 'revoked') {
          var button = node('button', 'btn btn-ghost btn-sm', 'Revoke');
          button.type = 'button';
          button.addEventListener('click', function () {
            request('/admin/penalties/' + encodeURIComponent(penalty.id) + '/revoke', {}, 'PATCH')
              .then(function () { return loadPenalties(id, name); })
              .catch(function (error) { say(byId('trainerAdminStatus'), error.message, 'error'); });
          });
          row.appendChild(button);
        }
        target.appendChild(row);
      });
    });
  }

  function copyText(value, button) {
    if (!value) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () { button.textContent = 'Copied'; });
    } else {
      button.textContent = 'Copy manually';
    }
  }

  function showHandover(prefix, email, passwordValue) {
    var emailNode = byId(prefix + 'HandoverEmail');
    var passwordNode = byId(prefix + 'HandoverPassword');
    var box = byId(prefix + 'Handover');
    if (emailNode) emailNode.textContent = email || '';
    if (passwordNode) passwordNode.textContent = passwordValue || '';
    if (box) box.hidden = false;
  }

  function bind() {
    var trainerSelect = byId('trainerAdminSelect');
    if (trainerSelect) trainerSelect.addEventListener('change', function () {
      if (trainerSelect.value) loadTrainerDetail(trainerSelect.value);
    });
    var studentSelect = byId('studentAdminSelect');
    if (studentSelect) studentSelect.addEventListener('change', function () {
      if (studentSelect.value) loadStudentDetail(studentSelect.value);
    });

    var addTrainer = byId('addTrainerForm');
    if (addTrainer) addTrainer.addEventListener('submit', function (event) {
      event.preventDefault();
      request('/admin/people', {
        role: 'trainer',
        name: byId('newTrainerName').value,
        email: byId('newTrainerEmail').value,
        password: byId('newTrainerPassword').value
      }, 'POST').then(function (data) {
        showHandover('trainer', data.person.email, data.temporaryPassword);
        say(byId('trainerAdminStatus'), 'Trainer created. Complete KYC, then validate and grant access.', 'success');
        return loadPeople();
      }).catch(function (error) {
        say(byId('trainerAdminStatus'), error.message || 'Trainer could not be created.', 'error');
      });
    });

    var addStudent = byId('addStudentForm');
    if (addStudent) addStudent.addEventListener('submit', function (event) {
      event.preventDefault();
      request('/admin/people', {
        role: 'student',
        name: byId('newStudentName').value,
        email: byId('newStudentEmail').value,
        grade: byId('newStudentGrade').value,
        password: byId('newStudentPassword').value
      }, 'POST').then(function (data) {
        showHandover('student', data.person.email, data.temporaryPassword);
        say(byId('studentAdminStatus'), 'Student created with a one-time password.', 'success');
        return loadPeople();
      }).catch(function (error) {
        say(byId('studentAdminStatus'), error.message || 'Student could not be created.', 'error');
      });
    });

    var grantTrainer = byId('grantTrainerAccessBtn');
    if (grantTrainer) grantTrainer.addEventListener('click', function () {
      var id = trainerSelect && trainerSelect.value;
      if (!id) return;
      request('/admin/people/' + encodeURIComponent(id) + '/grant', {}, 'POST').then(function (data) {
        showHandover('trainer', data.email, data.password);
        say(byId('trainerAdminStatus'), 'KYC validated and desk access granted. Copy the handover details.', 'success');
        return loadTrainerDetail(id);
      }).catch(function (error) {
        say(byId('trainerAdminStatus'), error.message || 'Access could not be granted.', 'error');
      });
    });

    var revokeTrainer = byId('revokeTrainerAccessBtn');
    if (revokeTrainer) revokeTrainer.addEventListener('click', function () {
      var id = trainerSelect && trainerSelect.value;
      if (!id) return;
      request('/admin/people/' + encodeURIComponent(id) + '/access', { status: 'suspended' }, 'PATCH')
        .then(function () {
          say(byId('trainerAdminStatus'), 'Trainer access revoked and logged.', 'success');
          return loadTrainerDetail(id);
        })
        .catch(function (error) {
          say(byId('trainerAdminStatus'), error.message || 'Access could not be revoked.', 'error');
        });
    });

    var grantStudent = byId('grantStudentAccessBtn');
    if (grantStudent) grantStudent.addEventListener('click', function () {
      var id = studentSelect && studentSelect.value;
      if (!id) return;
      request('/admin/people/' + encodeURIComponent(id) + '/access', { status: 'active' }, 'PATCH')
        .then(function () {
          say(byId('studentAdminStatus'), 'Student access granted.', 'success');
          return loadStudentDetail(id);
        })
        .catch(function (error) {
          say(byId('studentAdminStatus'), error.message || 'Access could not be granted.', 'error');
        });
    });

    var revokeStudent = byId('revokeStudentAccessBtn');
    if (revokeStudent) revokeStudent.addEventListener('click', function () {
      var id = studentSelect && studentSelect.value;
      if (!id) return;
      request('/admin/people/' + encodeURIComponent(id) + '/access', { status: 'suspended' }, 'PATCH')
        .then(function () {
          say(byId('studentAdminStatus'), 'Student access revoked and logged.', 'success');
          return loadStudentDetail(id);
        })
        .catch(function (error) {
          say(byId('studentAdminStatus'), error.message || 'Access could not be revoked.', 'error');
        });
    });

    var rateForm = byId('trainerRateForm');
    if (rateForm) rateForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var id = trainerSelect && trainerSelect.value;
      if (!id) return;
      request('/admin/people/' + encodeURIComponent(id) + '/base-rate',
        { rate: byId('trainerBaseRate').value }, 'PATCH')
        .then(function (data) {
          say(byId('trainerAdminStatus'), data.person.bandWarning ||
            'Base rate set from the signed trainer contract.', 'success');
          return loadTrainerDetail(id);
        })
        .catch(function (error) {
          say(byId('trainerAdminStatus'), error.message || 'Rate could not be set.', 'error');
        });
    });

    var passwordForm = byId('trainerPasswordForm');
    if (passwordForm) passwordForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var id = trainerSelect && trainerSelect.value;
      if (!id) return;
      request('/admin/people/' + encodeURIComponent(id) + '/password',
        { password: byId('trainerNewPassword').value }, 'PATCH')
        .then(function (data) {
          showHandover('trainer', data.person.email, data.temporaryPassword);
          say(byId('trainerAdminStatus'), 'New working password granted. It is shown only once.', 'success');
        })
        .catch(function (error) {
          say(byId('trainerAdminStatus'), error.message || 'Password could not be granted.', 'error');
        });
    });

    var studentPasswordForm = byId('studentPasswordForm');
    if (studentPasswordForm) studentPasswordForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var id = studentSelect && studentSelect.value;
      if (!id) return;
      request('/admin/people/' + encodeURIComponent(id) + '/password',
        { password: byId('studentNewPassword').value }, 'PATCH')
        .then(function (data) {
          showHandover('student', data.person.email, data.temporaryPassword);
          say(byId('studentAdminStatus'), 'New working password granted. It is shown only once.', 'success');
        })
        .catch(function (error) {
          say(byId('studentAdminStatus'), error.message || 'Password could not be granted.', 'error');
        });
    });

    var penaltyForm = byId('trainerPenaltyForm');
    if (penaltyForm) penaltyForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var id = trainerSelect && trainerSelect.value;
      if (!id) return;
      request('/admin/people/' + encodeURIComponent(id) + '/penalties', {
        amount: byId('trainerPenaltyAmount').value,
        reason: byId('trainerPenaltyReason').value
      }, 'POST').then(function () {
        byId('trainerPenaltyAmount').value = '';
        byId('trainerPenaltyReason').value = '';
        say(byId('trainerAdminStatus'), 'Penalty recorded and audited.', 'success');
        return loadTrainerDetail(id);
      }).catch(function (error) {
        say(byId('trainerAdminStatus'), error.message || 'Penalty could not be recorded.', 'error');
      });
    });

    var batchForm = byId('batchAssignForm');
    if (batchForm) batchForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var trainerId = trainerSelect && trainerSelect.value;
      var batchId = byId('adminBatchSelect') && byId('adminBatchSelect').value;
      var start = byId('adminBatchStart') && byId('adminBatchStart').value;
      if (!trainerId || !batchId || !start) return;
      request('/admin/batches/' + encodeURIComponent(batchId) + '/allot', {
        trainerId: trainerId,
        slots: [{ startsAt: new Date(start).toISOString(), title: byId('adminBatchTitle').value }]
      }, 'POST').then(function () {
        say(byId('trainerAdminStatus'), 'Batch assigned to the trainer.', 'success');
        return loadTrainerDetail(trainerId);
      }).catch(function (error) {
        say(byId('trainerAdminStatus'), error.message || 'Batch could not be assigned.', 'error');
      });
    });

    [['copyTrainerEmail', 'trainerHandoverEmail'], ['copyTrainerPassword', 'trainerHandoverPassword'],
      ['copyStudentEmail', 'studentHandoverEmail'], ['copyStudentPassword', 'studentHandoverPassword']
    ].forEach(function (pair) {
      var button = byId(pair[0]);
      if (button) button.addEventListener('click', function () {
        var value = byId(pair[1]) && byId(pair[1]).textContent;
        copyText(value, button);
      });
    });
  }

  /* Demo requests are visible to both operating roles. A generated password
     appears here exactly once and is never written back into the DOM table. */
  function loadDemos() {
    return request('/admin/demos').then(function (data) {
      var body = byId('demoAdminRows');
      if (!body) return;
      body.textContent = '';
      var rows = (data && data.demos) || [];
      if (!rows.length) {
        var empty = node('tr', null, null);
        empty.appendChild(node('td', null, 'No demo requests yet.'));
        empty.firstChild.colSpan = 5;
        body.appendChild(empty);
        return;
      }
      rows.forEach(function (demo) {
        var row = node('tr', null, null);
        [demo.demoId, demo.childName, (demo.curriculum || '—') + ' · ' + (demo.grade || '—'),
          demo.trainerName || 'Pending assignment'
        ].forEach(function (value) { row.appendChild(node('td', null, value)); });
        var action = node('td', null, demo.credentialsIssued
          ? 'Sent at booking · family-owned' : 'Pending booking');
        row.appendChild(action);
        body.appendChild(row);
      });
    }).catch(function (error) {
      say(byId('demoAdminStatus'), error.message || 'Demo requests could not be loaded.', 'error');
    });
  }

  bind();
  loadPeople();
  loadAuditLog();
  loadDemos();
}());
