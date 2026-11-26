/* Trainer KYC onboarding form. Identity and document fields lock after the
   first submission; personal and bank fields remain editable by the trainer. */
(function () {
  'use strict';

  var api = window.mathifyTrainerApi;
  var form = document.getElementById('onboardingForm');
  if (!api || !form) return;

  function el(id) { return document.getElementById(id); }
  function value(id) { var node = el(id); return node ? String(node.value || '').trim() : ''; }
  function setValue(id, text) { var node = el(id); if (node) node.value = text || ''; }
  function status(message, tone) {
    var node = el('onboardingStatus');
    if (!node) return;
    node.textContent = message || '';
    if (tone) node.setAttribute('data-tone', tone);
    else node.removeAttribute('data-tone');
  }

  function isLocked(record) {
    return Boolean(record && record.status && record.status !== 'draft');
  }

  function setLocked(record) {
    var locked = isLocked(record);
    ['kycFullName', 'kycDob', 'kycAadhaarNumber', 'kycAadhaarImage',
      'kycPanNumber', 'kycPanImage', 'kycSignatureImage', 'kycBankProofImage',
      'kycOtherLabel', 'kycOtherNumber', 'kycOtherImage'].forEach(function (id) {
      var node = el(id);
      if (node) node.disabled = locked;
    });
    el('onboardingSubmit').textContent = locked ? 'Save personal details' : 'Submit KYC';
    el('onboardingState').textContent = locked
      ? 'KYC locked · ' + record.status
      : 'Not submitted';
  }

  function fill(record) {
    if (!record) {
      setLocked(null);
      return;
    }
    var identity = record.identity || {};
    var personal = record.personal || {};
    var bank = record.bank || {};
    var docs = record.documents || {};
    var aadhaar = docs.aadhaar || {};
    var pan = docs.pan || {};
    var signature = docs.signature || {};
    var bankProof = docs.bankProof || {};
    var additional = (docs.additionalDocuments || [])[0] || {};

    setValue('kycFullName', identity.fullName);
    setValue('kycDob', identity.dateOfBirth);
    setValue('kycAadhaarNumber', aadhaar.number);
    setValue('kycPanNumber', pan.number);
    setValue('kycContact', personal.contactNumber);
    setValue('kycAlternateContact', personal.alternateContactNumber);
    setValue('kycEmail', personal.emailId);
    setValue('kycFather', personal.fatherName);
    setValue('kycMother', personal.motherName);
    setValue('kycSpouse', personal.spouseName);
    setValue('kycAddress', personal.address);
    setValue('kycAccountHolder', bank.accountHolderName);
    setValue('kycAccountNumber', bank.accountNumber);
    setValue('kycIfsc', bank.ifscCode);
    setValue('kycBankName', bank.bankName);
    setValue('kycBranch', bank.branch);
    setValue('kycOtherLabel', additional.label === 'Additional document' ? '' : additional.label);
    setValue('kycOtherNumber', additional.number);
    setLocked(record);
  }

  function readFile(input) {
    if (!input || !input.files || !input.files[0]) return Promise.resolve(null);
    var file = input.files[0];
    if (file.size > 4 * 1024 * 1024) {
      return Promise.reject(new Error('Each document image must be under 4 MB.'));
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('Could not read ' + file.name + '.')); };
      reader.readAsDataURL(file);
    });
  }

  function upload(kind, input) {
    return readFile(input).then(function (data) {
      if (!data) return null;
      var file = input.files[0];
      return api.uploadDocument({
        kind: kind,
        fileName: file.name,
        mimeType: file.type || 'image/png',
        data: data
      });
    });
  }

  function documentData(numberId, imageId, kind, existing) {
    return upload(kind, el(imageId)).then(function (uploaded) {
      return { number: value(numberId), image: uploaded || (existing && existing.image) || null };
    });
  }

  function personalBody() {
    return {
      personal: {
        contactNumber: value('kycContact'),
        alternateContactNumber: value('kycAlternateContact'),
        emailId: value('kycEmail'),
        fatherName: value('kycFather'),
        motherName: value('kycMother'),
        spouseName: value('kycSpouse'),
        address: value('kycAddress')
      },
      bank: {
        accountHolderName: value('kycAccountHolder'),
        accountNumber: value('kycAccountNumber'),
        ifscCode: value('kycIfsc'),
        bankName: value('kycBankName'),
        branch: value('kycBranch')
      }
    };
  }

  function submit(event) {
    event.preventDefault();
    status('Saving…');
    var button = el('onboardingSubmit');
    if (button) button.disabled = true;

    var request = isLocked(state)
      ? api.updatePersonal(personalBody())
      : Promise.all([
        upload('aadhaar', el('kycAadhaarImage')),
        upload('pan', el('kycPanImage')),
        upload('signature', el('kycSignatureImage')),
        upload('bankProof', el('kycBankProofImage')),
        upload('other', el('kycOtherImage'))
      ]).then(function (files) {
        var body = personalBody();
        body.identity = {
          fullName: value('kycFullName'),
          dateOfBirth: value('kycDob')
        };
        body.documents = {
          aadhaar: { number: value('kycAadhaarNumber'), image: files[0] },
          pan: { number: value('kycPanNumber'), image: files[1] },
          signature: { image: files[2] },
          bankProof: { image: files[3] }
        };
        if (files[4] || value('kycOtherLabel') || value('kycOtherNumber')) {
          body.documents.additionalDocuments = [{
            label: value('kycOtherLabel') || 'Additional document',
            number: value('kycOtherNumber'),
            image: files[4]
          }];
        }
        return api.submitOnboarding(body);
      });

    return request.then(function (record) {
      state = record;
      fill(record);
      status('Saved. KYC identity and documents are now locked.', 'ok');
    }).catch(function (error) {
      status(error && error.message ? error.message : 'Could not save onboarding.', 'error');
    }).then(function () {
      if (button) button.disabled = false;
    });
  }

  form.addEventListener('submit', submit);
  api.getOnboarding().then(function (record) {
    state = record;
    fill(record);
  }).catch(function (error) {
    status(error && error.message ? error.message : 'Could not load onboarding.', 'error');
  });
})();
