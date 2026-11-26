/* The relationship manager uses the same KYC form and service as a trainer.
   This adapter only points the shared form at the manager's own API family and
   signed-in token; no document or identity field is relaxed. */
(function () {
  'use strict';

  var BASE = window.MATHIFY_API_BASE || '/api';
  var TOKEN_KEY = 'mathify.classroom.token.relationship_manager';

  function token() {
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (error) { return null; }
  }

  function request(path, body, method) {
    var headers = { Accept: 'application/json' };
    var value = token();
    if (value) headers.Authorization = 'Bearer ' + value;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch(BASE + '/rm' + path, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) {
          var error = new Error((data && data.message) || 'Request failed.');
          error.code = data.error;
          throw error;
        }
        return data;
      });
    });
  }

  window.mathifyTrainerApi = {
    getOnboarding: function () {
      return request('/onboarding').then(function (data) { return data.onboarding; });
    },
    submitOnboarding: function (body) {
      return request('/onboarding', body).then(function (data) { return data.onboarding; });
    },
    updatePersonal: function (body) {
      return request('/onboarding/personal', body, 'PATCH').then(function (data) { return data.onboarding; });
    },
    uploadDocument: function (body) {
      return request('/onboarding/documents', body).then(function (data) { return data.document; });
    }
  };
}());
