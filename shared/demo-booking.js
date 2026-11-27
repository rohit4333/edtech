/* Mathify shared demo booking frame.
 *
 * The home page and contact page mount the same two-step request card here so
 * validation, draft recovery, curriculum/timezone pickers, submission and the
 * success/credential flow are byte-for-byte the same working experience. No
 * payment fields are collected. The request text stays duration-neutral: it
 * says "book a demo", never a minute count.
 */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var TEMPLATE = `
        <div class="booking-progress">
          <span id="stepLabel">STEP 1 OF 2</span>
          <div class="progress-track"><i id="progressFill"></i></div>
        </div>

        <form id="demoForm" novalidate>
          <div class="form-step" data-step="1">
            <h3>Who is the session for?</h3>
            <label class="field">
              <span>Parent / guardian name</span>
              <input id="demoParent" name="parentName" type="text" autocomplete="name" placeholder="Your name" required>
            </label>
            <label class="field">
              <span>Child's name</span>
              <input id="demoChild" name="childName" type="text" placeholder="Your child's name" required>
            </label>
            <label class="field">
              <span>Child's school curriculum</span>
              <select id="demoCurriculum" name="curriculum" required>
                <option value="">Select a curriculum</option>
              </select>
            </label>
            <label class="field">
              <span>Grade according to that curriculum</span>
              <select id="demoGrade" name="grade" required>
                <option value="">Choose a curriculum first</option>
              </select>
            </label>
          </div>

          <div class="form-step" data-step="2" hidden>
            <h3>Where should we reply?</h3>
            <label class="field">
              <span>Email address</span>
              <input id="demoEmail" name="email" type="email" autocomplete="email" placeholder="you@example.com" required>
            </label>
            <label class="field">
              <span>WhatsApp / mobile number</span>
              <input id="demoPhone" name="phone" type="tel" autocomplete="tel" placeholder="+ country code and number" required>
            </label>
            <label class="field">
              <span>Your timezone</span>
              <select id="demoTimezone" name="timezone" required>
                <option value="">Select your timezone</option>
              </select>
            </label>
            <fieldset class="time-field">
              <legend>Preferred time <small>optional</small></legend>
              <div class="time-chips">
                <button type="button" data-time="Weekday evening">Weekday evening</button>
                <button type="button" data-time="Weekend morning">Weekend morning</button>
                <button type="button" data-time="Weekend evening">Weekend evening</button>
                <button type="button" data-time="Any time">Any time</button>
              </div>
            </fieldset>
            <label class="field review-field">
              <span>Your request <small>you can edit this</small></span>
              <textarea id="demoMessage" name="message" rows="3" required></textarea>
            </label>
          </div>

          <p class="form-error" id="demoError" role="alert" hidden></p>

          <div class="form-actions">
            <button class="btn btn-back" type="button" id="demoBack" hidden>Back</button>
            <button class="btn btn-next" type="button" id="demoNext">Continue <span aria-hidden="true">→</span></button>
            <button class="btn btn-send" type="submit" id="demoSend" hidden>Send my request <span aria-hidden="true">→</span></button>
          </div>

          <p class="form-note"><b>No payment is taken here.</b> We contact you to confirm the 1-on-1 demo first.</p>
          <p class="form-status" id="demoStatus" role="status" aria-live="polite"></p>
        </form>

        <div class="booking-success" id="demoSuccess" hidden>
          <div class="success-mark">✓</div>
          <h3>Demo booked. Your login is ready.</h3>
          <p id="successCopy">We'll confirm a real demo slot with you shortly.</p>
          <p class="success-ref" id="successRef"></p>
          <div class="booking-credentials" id="bookingCredentials" hidden>
            <div><span class="mono">Demo ID</span><b id="bookingDemoId">—</b></div>
            <div><span class="mono">Login email</span><b id="bookingEmail">—</b></div>
            <div><span class="mono">Shared password</span><b id="bookingPassword">—</b></div>
            <p class="credential-note">Use this one password for both the child and parent desks. Keep it — it stays your login until you change it yourself in Profile → Password. <b>Check your email for more details.</b></p>
            <div class="credential-links" id="credentialLinks" hidden>
              <a id="childDeskLink" href="/student/home">Open child desk</a>
              <a id="parentDeskLink" href="/parent/index.html">Open parent desk</a>
            </div>
          </div>
          <a class="btn btn-ghost" id="whatsappConfirm" target="_blank" rel="noopener">Message us on WhatsApp</a>
          <button class="text-button" type="button" id="editRequest">Edit my request</button>
        </div>`;

  var mount = document.getElementById('demoBookingMount');
  if (mount && !mount.childElementCount) mount.innerHTML = TEMPLATE;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function openBooking(event) {
    var target = document.getElementById('book-demo');
    if (!target) return;
    if (event) event.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', '#book-demo');
    }
    var first = document.getElementById('demoParent');
    if (first) {
      window.setTimeout(function () {
        if (!form || form.hidden) return;
        first.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 620);
    }
  }

  document.querySelectorAll('[data-book-demo]').forEach(function (link) {
    link.addEventListener('click', openBooking);
  });
  if (window.location.hash === '#book-demo') {
    window.setTimeout(openBooking, reduceMotion ? 0 : 200);
  }

  var form = document.getElementById('demoForm');
  if (!form) return;

  function showBookingCredentials(data, fallbackEmail) {
    var box = document.getElementById('bookingCredentials');
    if (!box) return;
    var credentials = data && data.credentials;
    box.hidden = !(credentials && credentials.password);
    if (box.hidden) return;
    var demoId = document.getElementById('bookingDemoId');
    var emailNode = document.getElementById('bookingEmail');
    var passwordNode = document.getElementById('bookingPassword');
    if (demoId) demoId.textContent = data.demoId || '—';
    if (emailNode) emailNode.textContent = credentials.email || fallbackEmail || '—';
    if (passwordNode) passwordNode.textContent = credentials.password;
    var links = document.getElementById('credentialLinks');
    var child = document.getElementById('childDeskLink');
    var parent = document.getElementById('parentDeskLink');
    if (links && child && parent) {
      links.hidden = !(credentials.studentLink && credentials.parentLink);
      if (credentials.studentLink) child.href = credentials.studentLink;
      if (credentials.parentLink) parent.href = credentials.parentLink;
    }
  }

  var step = 1;
  var selectedTime = '';
  var draftKey = 'mathify.demo.draft.v2';
  var restoredCurriculum = '';
  var restoredGrade = '';

  var parentName = document.getElementById('demoParent');
  var childName = document.getElementById('demoChild');
  var curriculum = document.getElementById('demoCurriculum');
  var grade = document.getElementById('demoGrade');
  var email = document.getElementById('demoEmail');
  var phone = document.getElementById('demoPhone');
  var timezone = document.getElementById('demoTimezone');
  var message = document.getElementById('demoMessage');
  var chips = Array.prototype.slice.call(form.querySelectorAll('.time-chips button'));
  var error = document.getElementById('demoError');
  var status = document.getElementById('demoStatus');
  var stepLabel = document.getElementById('stepLabel');
  var progressFill = document.getElementById('progressFill');
  var back = document.getElementById('demoBack');
  var next = document.getElementById('demoNext');
  var send = document.getElementById('demoSend');
  var success = document.getElementById('demoSuccess');
  var successCopy = document.getElementById('successCopy');
  var successRef = document.getElementById('successRef');
  var whatsapp = document.getElementById('whatsappConfirm');
  var editRequest = document.getElementById('editRequest');
  var progress = form.parentNode.querySelector('.booking-progress');

  function localTimezone() {
    try {
      return (window.Intl && Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
    } catch (errorValue) {
      return '';
    }
  }

  function selectedLabel(select) {
    var option = select && select.selectedOptions && select.selectedOptions[0];
    return (option && option.textContent.trim()) || '';
  }

  var FALLBACK_TIMEZONES = [
    'Africa/Abidjan', 'Africa/Accra', 'Africa/Addis_Ababa', 'Africa/Algiers',
    'Africa/Asmera', 'Africa/Bamako', 'Africa/Bangui', 'Africa/Banjul',
    'Africa/Bissau', 'Africa/Blantyre', 'Africa/Brazzaville', 'Africa/Bujumbura',
    'Africa/Cairo', 'Africa/Casablanca', 'Africa/Ceuta', 'Africa/Conakry',
    'Africa/Dakar', 'Africa/Dar_es_Salaam', 'Africa/Djibouti', 'Africa/Douala',
    'Africa/El_Aaiun', 'Africa/Freetown', 'Africa/Gaborone', 'Africa/Harare',
    'Africa/Johannesburg', 'Africa/Juba', 'Africa/Kampala', 'Africa/Khartoum',
    'Africa/Kigali', 'Africa/Kinshasa', 'Africa/Lagos', 'Africa/Libreville',
    'Africa/Lome', 'Africa/Luanda', 'Africa/Lubumbashi', 'Africa/Lusaka',
    'Africa/Malabo', 'Africa/Maputo', 'Africa/Maseru', 'Africa/Mbabane',
    'Africa/Mogadishu', 'Africa/Monrovia', 'Africa/Nairobi', 'Africa/Ndjamena',
    'Africa/Niamey', 'Africa/Nouakchott', 'Africa/Ouagadougou', 'Africa/Porto-Novo',
    'Africa/Sao_Tome', 'Africa/Tripoli', 'Africa/Tunis', 'Africa/Windhoek',
    'America/Adak', 'America/Anchorage', 'America/Anguilla', 'America/Antigua',
    'America/Araguaina', 'America/Argentina/La_Rioja', 'America/Argentina/Rio_Gallegos', 'America/Argentina/Salta',
    'America/Argentina/San_Juan', 'America/Argentina/San_Luis', 'America/Argentina/Tucuman', 'America/Argentina/Ushuaia',
    'America/Aruba', 'America/Asuncion', 'America/Bahia', 'America/Bahia_Banderas',
    'America/Barbados', 'America/Belem', 'America/Belize', 'America/Blanc-Sablon',
    'America/Boa_Vista', 'America/Bogota', 'America/Boise', 'America/Buenos_Aires',
    'America/Cambridge_Bay', 'America/Campo_Grande', 'America/Cancun', 'America/Caracas',
    'America/Catamarca', 'America/Cayenne', 'America/Cayman', 'America/Chicago',
    'America/Chihuahua', 'America/Ciudad_Juarez', 'America/Coral_Harbour', 'America/Cordoba',
    'America/Costa_Rica', 'America/Creston', 'America/Cuiaba', 'America/Curacao',
    'America/Danmarkshavn', 'America/Dawson', 'America/Dawson_Creek', 'America/Denver',
    'America/Detroit', 'America/Dominica', 'America/El_Salvador', 'America/Eirunepe',
    'America/Fort_Nelson', 'America/Fortaleza', 'America/Glace_Bay',
    'America/Godthab', 'America/Goose_Bay', 'America/Grand_Turk', 'America/Grenada',
    'America/Guadeloupe', 'America/Guatemala', 'America/Guayaquil', 'America/Guyana',
    'America/Halifax', 'America/Havana', 'America/Hermosillo', 'America/Indiana/Knox',
    'America/Indiana/Marengo', 'America/Indiana/Petersburg', 'America/Indiana/Tell_City', 'America/Indiana/Vevay',
    'America/Indiana/Vincennes', 'America/Indiana/Winamac', 'America/Indianapolis', 'America/Inuvik',
    'America/Iqaluit', 'America/Jamaica', 'America/Jujuy', 'America/Juneau',
    'America/Kentucky/Monticello', 'America/Kralendijk', 'America/La_Paz', 'America/Lima',
    'America/Los_Angeles', 'America/Louisville', 'America/Lower_Princes', 'America/Maceio',
    'America/Managua', 'America/Manaus', 'America/Marigot', 'America/Martinique',
    'America/Matamoros', 'America/Mazatlan', 'America/Mendoza', 'America/Menominee',
    'America/Merida', 'America/Metlakatla', 'America/Mexico_City', 'America/Miquelon',
    'America/Moncton', 'America/Monterrey', 'America/Montevideo', 'America/Montserrat',
    'America/Nassau', 'America/New_York', 'America/Nome', 'America/Noronha',
    'America/North_Dakota/Beulah', 'America/North_Dakota/Center', 'America/North_Dakota/New_Salem', 'America/Ojinaga',
    'America/Panama', 'America/Paramaribo', 'America/Phoenix', 'America/Port-au-Prince',
    'America/Port_of_Spain', 'America/Porto_Velho', 'America/Puerto_Rico', 'America/Punta_Arenas',
    'America/Rankin_Inlet', 'America/Recife', 'America/Regina', 'America/Resolute',
    'America/Rio_Branco', 'America/Santarem', 'America/Santiago', 'America/Santo_Domingo',
    'America/Sao_Paulo', 'America/Scoresbysund', 'America/Sitka', 'America/St_Barthelemy',
    'America/St_Johns', 'America/St_Kitts', 'America/St_Lucia', 'America/St_Thomas',
    'America/St_Vincent', 'America/Swift_Current', 'America/Tegucigalpa', 'America/Thule',
    'America/Tijuana', 'America/Toronto', 'America/Tortola', 'America/Vancouver',
    'America/Whitehorse', 'America/Winnipeg', 'America/Yakutat', 'Antarctica/Casey',
    'Antarctica/Davis', 'Antarctica/DumontDUrville', 'Antarctica/Macquarie', 'Antarctica/Mawson',
    'Antarctica/McMurdo', 'Antarctica/Palmer', 'Antarctica/Rothera', 'Antarctica/Syowa',
    'Antarctica/Troll', 'Antarctica/Vostok', 'Arctic/Longyearbyen', 'Asia/Aden',
    'Asia/Almaty', 'Asia/Amman', 'Asia/Anadyr', 'Asia/Aqtau',
    'Asia/Aqtobe', 'Asia/Ashgabat', 'Asia/Atyrau', 'Asia/Baghdad',
    'Asia/Bahrain', 'Asia/Baku', 'Asia/Bangkok', 'Asia/Barnaul',
    'Asia/Beirut', 'Asia/Bishkek', 'Asia/Brunei', 'Asia/Calcutta',
    'Asia/Chita', 'Asia/Colombo', 'Asia/Damascus', 'Asia/Dhaka',
    'Asia/Dili', 'Asia/Dubai', 'Asia/Dushanbe', 'Asia/Famagusta',
    'Asia/Gaza', 'Asia/Hebron', 'Asia/Hong_Kong', 'Asia/Hovd',
    'Asia/Irkutsk', 'Asia/Jakarta', 'Asia/Jayapura', 'Asia/Jerusalem',
    'Asia/Kabul', 'Asia/Kamchatka', 'Asia/Karachi', 'Asia/Katmandu',
    'Asia/Khandyga', 'Asia/Krasnoyarsk', 'Asia/Kuala_Lumpur', 'Asia/Kuching',
    'Asia/Kuwait', 'Asia/Macau', 'Asia/Magadan', 'Asia/Makassar',
    'Asia/Manila', 'Asia/Muscat', 'Asia/Nicosia', 'Asia/Novokuznetsk',
    'Asia/Novosibirsk', 'Asia/Omsk', 'Asia/Oral', 'Asia/Phnom_Penh',
    'Asia/Pontianak', 'Asia/Pyongyang', 'Asia/Qatar', 'Asia/Qostanay',
    'Asia/Qyzylorda', 'Asia/Rangoon', 'Asia/Riyadh', 'Asia/Saigon',
    'Asia/Sakhalin', 'Asia/Samarkand', 'Asia/Seoul', 'Asia/Shanghai',
    'Asia/Singapore', 'Asia/Srednekolymsk', 'Asia/Taipei', 'Asia/Tashkent',
    'Asia/Tbilisi', 'Asia/Tehran', 'Asia/Thimphu', 'Asia/Tokyo',
    'Asia/Tomsk', 'Asia/Ulaanbaatar', 'Asia/Urumqi', 'Asia/Ust-Nera',
    'Asia/Vientiane', 'Asia/Vladivostok', 'Asia/Yakutsk', 'Asia/Yekaterinburg',
    'Asia/Yerevan', 'Atlantic/Azores', 'Atlantic/Bermuda', 'Atlantic/Canary',
    'Atlantic/Cape_Verde', 'Atlantic/Faeroe', 'Atlantic/Madeira', 'Atlantic/Reykjavik',
    'Atlantic/South_Georgia', 'Atlantic/St_Helena', 'Atlantic/Stanley', 'Australia/Adelaide',
    'Australia/Brisbane', 'Australia/Broken_Hill', 'Australia/Darwin', 'Australia/Eucla',
    'Australia/Hobart', 'Australia/Lindeman', 'Australia/Lord_Howe', 'Australia/Melbourne',
    'Australia/Perth', 'Australia/Sydney', 'Europe/Amsterdam', 'Europe/Andorra',
    'Europe/Astrakhan', 'Europe/Athens', 'Europe/Belgrade', 'Europe/Berlin',
    'Europe/Bratislava', 'Europe/Brussels', 'Europe/Bucharest', 'Europe/Budapest',
    'Europe/Busingen', 'Europe/Chisinau', 'Europe/Copenhagen', 'Europe/Dublin',
    'Europe/Gibraltar', 'Europe/Guernsey', 'Europe/Helsinki', 'Europe/Isle_of_Man',
    'Europe/Istanbul', 'Europe/Jersey', 'Europe/Kaliningrad', 'Europe/Kiev',
    'Europe/Kirov', 'Europe/Lisbon', 'Europe/Ljubljana', 'Europe/London',
    'Europe/Luxembourg', 'Europe/Madrid', 'Europe/Malta', 'Europe/Mariehamn',
    'Europe/Minsk', 'Europe/Monaco', 'Europe/Moscow', 'Europe/Oslo',
    'Europe/Paris', 'Europe/Podgorica', 'Europe/Prague', 'Europe/Riga',
    'Europe/Rome', 'Europe/Samara', 'Europe/San_Marino', 'Europe/Sarajevo',
    'Europe/Saratov', 'Europe/Simferopol', 'Europe/Skopje', 'Europe/Sofia',
    'Europe/Stockholm', 'Europe/Tallinn', 'Europe/Tirane', 'Europe/Ulyanovsk',
    'Europe/Vaduz', 'Europe/Vatican', 'Europe/Vienna', 'Europe/Vilnius',
    'Europe/Volgograd', 'Europe/Warsaw', 'Europe/Zagreb', 'Europe/Zurich',
    'Indian/Antananarivo', 'Indian/Chagos', 'Indian/Christmas', 'Indian/Cocos',
    'Indian/Comoro', 'Indian/Kerguelen', 'Indian/Mahe', 'Indian/Maldives',
    'Indian/Mauritius', 'Indian/Mayotte', 'Indian/Reunion', 'Pacific/Apia',
    'Pacific/Auckland', 'Pacific/Bougainville', 'Pacific/Chatham', 'Pacific/Easter',
    'Pacific/Efate', 'Pacific/Enderbury', 'Pacific/Fakaofo', 'Pacific/Fiji',
    'Pacific/Funafuti', 'Pacific/Galapagos', 'Pacific/Gambier', 'Pacific/Guadalcanal',
    'Pacific/Guam', 'Pacific/Honolulu', 'Pacific/Kiritimati', 'Pacific/Kosrae',
    'Pacific/Kwajalein', 'Pacific/Majuro', 'Pacific/Marquesas', 'Pacific/Midway',
    'Pacific/Nauru', 'Pacific/Niue', 'Pacific/Norfolk', 'Pacific/Noumea',
    'Pacific/Pago_Pago', 'Pacific/Palau', 'Pacific/Pitcairn', 'Pacific/Ponape',
    'Pacific/Port_Moresby', 'Pacific/Rarotonga', 'Pacific/Saipan', 'Pacific/Tahiti',
    'Pacific/Tarawa', 'Pacific/Tongatapu', 'Pacific/Truk', 'Pacific/Wake',
    'Pacific/Wallis', 'UTC'
  ];

  function timezoneGroup(zone) {
    return zone.indexOf('/') === -1 ? 'UTC' : zone.split('/')[0];
  }

  function allTimezones() {
    var zones = [];
    try {
      if (window.Intl && typeof Intl.supportedValuesOf === 'function') {
        zones = Intl.supportedValuesOf('timeZone').slice();
      }
    } catch (errorValue) {
      zones = [];
    }
    if (!zones.length) zones = FALLBACK_TIMEZONES.slice();
    if (zones.indexOf('UTC') === -1) zones.push('UTC');
    var local = localTimezone();
    if (local && zones.indexOf(local) === -1) zones.push(local);
    return zones.sort(function (left, right) { return left.localeCompare(right); });
  }

  function ensureTimezoneOption(zone, makeDefault) {
    if (!timezone || !zone) return;
    var option = null;
    Array.prototype.forEach.call(timezone.options, function (item) {
      if (item.value === zone) option = item;
    });
    if (!option) {
      var label = timezoneGroup(zone);
      var group = null;
      Array.prototype.forEach.call(timezone.querySelectorAll('optgroup'), function (item) {
        if (item.label === label) group = item;
      });
      if (!group) {
        group = document.createElement('optgroup');
        group.label = label;
        timezone.appendChild(group);
      }
      option = document.createElement('option');
      option.value = zone;
      option.textContent = zone;
      group.appendChild(option);
    }
    if (makeDefault) option.defaultSelected = true;
    timezone.value = zone;
  }

  function populateTimezones() {
    if (!timezone) return;
    Array.prototype.slice.call(timezone.children).forEach(function (child) {
      if (child.tagName === 'OPTION' && child.value === '') return;
      timezone.removeChild(child);
    });
    var groups = {};
    allTimezones().forEach(function (zone) {
      var label = timezoneGroup(zone);
      if (!groups[label]) {
        groups[label] = document.createElement('optgroup');
        groups[label].label = label;
        timezone.appendChild(groups[label]);
      }
      var option = document.createElement('option');
      option.value = zone;
      option.textContent = zone;
      groups[label].appendChild(option);
    });
    var local = localTimezone();
    if (local) ensureTimezoneOption(local, true);
  }

  function setStatus(text, tone) {
    if (!status) return;
    status.textContent = text || '';
    if (status.dataset) status.dataset.tone = tone || '';
  }

  function setError(text) {
    if (!error) return;
    error.textContent = text || '';
    error.hidden = !text;
  }

  function buildMessage() {
    var zone = (timezone && timezone.value.trim()) || localTimezone() || 'your timezone';
    var when = selectedTime || 'Any time';
    var child = (childName && childName.value.trim()) || 'the child';
    var board = selectedLabel(curriculum) || 'the school curriculum';
    var gradeLabel = selectedLabel(grade) || 'the matching grade';
    var guardian = (parentName && parentName.value.trim()) || 'A parent';
    return 'Hi Mathify — I would like to book a demo for ' +
      child + ' (' + board + ', ' + gradeLabel + '). Parent/guardian: ' + guardian +
      '. Preferred time: ' + when + '. Timezone: ' + zone +
      '. Please confirm a real slot with me.';
  }

  function refreshMessage() {
    if (!message) return;
    if (message.dataset.edited !== 'true') message.value = buildMessage();
  }

  function saveDraft() {
    try {
      window.sessionStorage.setItem(draftKey, JSON.stringify({
        step: step,
        parentName: parentName ? parentName.value : '',
        childName: childName ? childName.value : '',
        curriculum: curriculum ? curriculum.value : '',
        grade: grade ? grade.value : '',
        email: email ? email.value : '',
        phone: phone ? phone.value : '',
        timezone: timezone ? timezone.value : '',
        time: selectedTime,
        message: message ? message.value : '',
        edited: Boolean(message && message.dataset.edited === 'true')
      }));
    } catch (errorValue) { /* storage may be disabled; the form still works */ }
  }

  function clearDraft() {
    try { window.sessionStorage.removeItem(draftKey); } catch (errorValue) { /* ignore */ }
  }

  function loadDraft() {
    var raw = null;
    try { raw = window.sessionStorage.getItem(draftKey); } catch (errorValue) { return; }
    if (!raw) return;
    var draft;
    try { draft = JSON.parse(raw); } catch (errorValue) { return; }
    if (!draft || typeof draft !== 'object') return;

    if (parentName && draft.parentName) parentName.value = draft.parentName;
    if (childName && draft.childName) childName.value = draft.childName;
    restoredCurriculum = draft.curriculum || '';
    restoredGrade = draft.grade || '';
    if (email && draft.email) email.value = draft.email;
    if (phone && draft.phone) phone.value = draft.phone;
    if (timezone && draft.timezone) ensureTimezoneOption(draft.timezone, false);
    if (message && draft.message) {
      message.value = draft.message;
      if (draft.edited) message.dataset.edited = 'true';
    }
    if (draft.time) {
      selectedTime = draft.time;
      chips.forEach(function (chip) {
        chip.setAttribute('aria-pressed', String(chip.dataset.time === selectedTime));
      });
    }
    step = draft.step === 2 ? 2 : 1;
  }

  function setStep(value) {
    step = value === 2 ? 2 : 1;
    form.querySelectorAll('.form-step').forEach(function (panel) {
      panel.hidden = Number(panel.dataset.step) !== step;
    });
    if (stepLabel) stepLabel.textContent = 'STEP ' + step + ' OF 2';
    if (progressFill) progressFill.style.width = step === 2 ? '100%' : '50%';
    if (back) back.hidden = step !== 2;
    if (next) next.hidden = step !== 1;
    if (send) send.hidden = step !== 2;
    if (step === 2) refreshMessage();
    setError('');
    saveDraft();
    if (step === 2 && email) email.focus({ preventScroll: true });
    if (step === 1 && parentName) parentName.focus({ preventScroll: true });
  }

  function validateStep(value) {
    var panel = form.querySelector('.form-step[data-step="' + value + '"]');
    if (!panel) return true;
    var fields = Array.prototype.slice.call(panel.querySelectorAll('input[required], select[required], textarea[required]'));
    for (var index = 0; index < fields.length; index += 1) {
      var field = fields[index];
      if (!field.checkValidity()) {
        var label = panel.querySelector('label[for="' + field.id + '"]');
        var text = label ? label.textContent.trim() : (field.name || 'This field');
        setError(value === 2 && field === email
          ? 'Enter a valid email address so we can reply.'
          : 'Please complete: ' + text + '.');
        field.focus({ preventScroll: true });
        return false;
      }
    }
    setError('');
    return true;
  }

  populateTimezones();
  loadDraft();
  if (window.MathifyCurriculums && window.MathifyCurriculums.populate && curriculum) {
    window.MathifyCurriculums.populate(curriculum, grade, {
      curriculum: restoredCurriculum,
      grade: restoredGrade,
      onChange: function () { refreshMessage(); saveDraft(); },
      onGradeChange: function () { refreshMessage(); saveDraft(); }
    });
  }
  setStep(step);
  refreshMessage();

  next.addEventListener('click', function () {
    if (validateStep(1)) setStep(2);
  });
  back.addEventListener('click', function () { setStep(1); });

  [parentName, childName, email, phone, timezone].forEach(function (field) {
    if (!field) return;
    field.addEventListener('input', function () { refreshMessage(); saveDraft(); });
    field.addEventListener('change', function () { refreshMessage(); saveDraft(); });
  });
  if (message) {
    message.addEventListener('input', function () {
      message.dataset.edited = 'true';
      saveDraft();
    });
  }
  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      selectedTime = chip.dataset.time || '';
      chips.forEach(function (item) {
        item.setAttribute('aria-pressed', String(item === chip));
      });
      refreshMessage();
      saveDraft();
    });
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!validateStep(2)) return;

    var payload = {
      parentName: parentName.value.trim(),
      name: parentName.value.trim(),
      childName: childName ? childName.value.trim() : '',
      curriculum: curriculum ? curriculum.value : '',
      grade: grade ? grade.value : '',
      email: email.value.trim(),
      phone: phone ? phone.value.trim() : '',
      timezone: timezone ? timezone.value : '',
      message: message.value.trim()
    };
    setError('');
    setStatus('Sending your request…', 'pending');
    send.disabled = true;

    try {
      var apiBase = window.MATHIFY_API_BASE || '/api';
      var response = await fetch(apiBase + '/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = {};
      try { data = await response.json(); } catch (errorValue) { data = {}; }
      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'We could not send that request.');
      }

      clearDraft();
      form.hidden = true;
      if (progress) progress.hidden = true;
      success.hidden = false;
      if (successCopy) {
        successCopy.textContent = 'Demo booked for ' + payload.childName + '. We will confirm the slot with ' +
          payload.name + ' on ' + payload.email + '. Check your email for more details.';
      }
      if (successRef) {
        successRef.textContent = data.demoId ? 'Demo ID · ' + data.demoId : '';
      }
      showBookingCredentials(data, payload.email);
      if (whatsapp) {
        whatsapp.href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(
          'Hi Mathify — I just requested a demo' +
          (data.reference ? ' (ref ' + data.reference + ')' : '') +
          '. My email is ' + payload.email + '.'
        );
      }
      if (status) setStatus('', '');
    } catch (errorValue) {
      setStatus((errorValue && errorValue.message ? errorValue.message : 'We could not send that request.') +
        ' Please use WhatsApp or email us.', 'error');
      send.disabled = false;
    }
  });

  editRequest.addEventListener('click', function () {
    success.hidden = true;
    form.hidden = false;
    if (progress) progress.hidden = false;
    setStep(2);
  });
})();
