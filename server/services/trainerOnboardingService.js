/* Trainer onboarding records.
 *
 * Locked KYC: legal name, date of birth and every uploaded document/card number.
 * Editable by trainer: contact, address, family details, email and bank details.
 * Only a founder may correct locked fields, and each correction appends a
 * separate audit row. Student-facing payloads never call this serializer. */
const db = require('../db');

const LOCKED_FIELDS = [
  'fullName',
  'dateOfBirth',
  'aadhaar',
  'pan',
  'signature',
  'bankProof',
  'additionalDocuments'
];
const EDITABLE_FIELDS = ['personal', 'bank'];

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function ref(value) {
  const source = object(value);
  const result = {
    id: text(source.id),
    ref: text(source.ref || source.storagePath || source.path),
    fileName: text(source.fileName || source.name),
    mimeType: text(source.mimeType),
    size: Number(source.size) || 0,
    uploadedAt: text(source.uploadedAt)
  };
  return Object.keys(result).some(function (key) { return result[key]; }) ? result : null;
}

function document(value) {
  const source = object(value);
  const number = text(source.number || source.cardNumber || source.aadhaarNumber || source.panNumber);
  const result = { number: number };
  const front = ref(source.front || source.frontImage || source.frontImageRef);
  const rear = ref(source.rear || source.back || source.rearImage || source.backImage);
  const image = ref(source.image || source.imageRef || source.document || source.card);
  if (front) result.front = front;
  if (rear) result.rear = rear;
  if (image) result.image = image;
  return number || front || rear || image ? result : null;
}

function normalize(input, existing) {
  const body = object(input);
  const base = existing || {};
  const identity = object(body.identity);
  const personal = object(body.personal);
  const bank = object(body.bank);
  const documents = object(body.documents);
  const previousPersonal = object(base.personal);
  const previousBank = object(base.bank);

  const next = {
    fullName: text(identity.fullName || body.fullName || base.fullName),
    dateOfBirth: text(identity.dateOfBirth || body.dateOfBirth || base.dateOfBirth),
    personal: {
      contactNumber: text(personal.contactNumber || previousPersonal.contactNumber),
      address: text(personal.address || previousPersonal.address),
      fatherName: text(personal.fatherName || previousPersonal.fatherName),
      motherName: text(personal.motherName || previousPersonal.motherName),
      spouseName: text(personal.spouseName || previousPersonal.spouseName),
      alternateContactNumber: text(
        personal.alternateContactNumber ||
        personal['AlternateContactNumber'] ||
        previousPersonal.alternateContactNumber
      ),
      emailId: text(personal.emailId || previousPersonal.emailId)
    },
    bank: {
      accountHolderName: text(bank.accountHolderName || previousBank.accountHolderName),
      accountNumber: text(bank.accountNumber || previousBank.accountNumber),
      ifscCode: text(bank.ifscCode || previousBank.ifscCode),
      bankName: text(bank.bankName || previousBank.bankName),
      branch: text(bank.branch || previousBank.branch)
    }
  };

  const entries = {
    aadhaar: documents.aadhaar || documents.aadhaarCard || base.aadhaar,
    pan: documents.pan || documents.panCard || base.pan,
    signature: documents.signature || base.signature,
    bankProof: documents.bankProof || base.bankProof
  };
  Object.keys(entries).forEach(function (key) {
    const value = document(entries[key]);
    if (value) next[key] = value;
  });

  const additional = documents.additionalDocuments || documents.additional || base.additionalDocuments;
  if (Array.isArray(additional)) {
    next.additionalDocuments = additional.slice(0, 5).map(function (item) {
      const source = object(item);
      return {
        label: text(source.label || source.type) || 'Additional document',
        number: text(source.number || source.cardNumber),
        image: ref(source.image || source.imageRef || source.document)
      };
    });
  }
  return next;
}

function validate(record) {
  const missing = [];
  if (!record.fullName) missing.push('identity.fullName');
  if (!record.dateOfBirth) missing.push('identity.dateOfBirth');
  if (!record.aadhaar || !record.aadhaar.number || !record.aadhaar.front || !record.aadhaar.rear) {
    missing.push('documents.aadhaar.number + front image + rear image');
  }
  if (!record.pan || !record.pan.number || !record.pan.front || !record.pan.rear) {
    missing.push('documents.pan.number + front image + rear image');
  }
  if (!record.signature || !record.signature.image) missing.push('documents.signature.image');
  if (missing.length) {
    const error = new Error('Missing required onboarding fields: ' + missing.join(', '));
    error.code = 'KYC_INCOMPLETE';
    error.status = 422;
    throw error;
  }
}

function mask(value) {
  const raw = text(value);
  if (!raw) return null;
  return raw.length <= 4 ? '••••' : '••••' + raw.slice(-4);
}

function visibleDocument(value, reveal) {
  if (!value) return null;
  const result = { number: reveal ? value.number : mask(value.number) };
  if (value.image) result.image = value.image;
  if (value.front) result.front = value.front;
  if (value.rear) result.rear = value.rear;
  return result;
}

function publicView(record, role, options) {
  if (!record) return null;
  const reveal = Boolean(options && options.reveal) ||
    role === 'trainer' || role === 'relationship_manager';
  const result = {
    trainerId: record.trainerId,
    status: record.status || 'submitted',
    locked: LOCKED_FIELDS.reduce(function (all, field) {
      all[field] = Object.prototype.hasOwnProperty.call(record, field) && Boolean(record[field]);
      return all;
    }, {}),
    editable: EDITABLE_FIELDS.slice(),
    masked: role === 'founder' && !reveal,
    personal: Object.assign({}, object(record.personal)),
    bank: Object.assign({}, object(record.bank)),
    identity: {
      fullName: text(record.fullName),
      dateOfBirth: text(record.dateOfBirth)
    },
    documents: {
      aadhaar: visibleDocument(record.aadhaar, reveal),
      pan: visibleDocument(record.pan, reveal),
      signature: visibleDocument(record.signature, reveal),
      bankProof: visibleDocument(record.bankProof, reveal),
      additionalDocuments: Array.isArray(record.additionalDocuments)
        ? record.additionalDocuments.map(function (item) {
          return {
            label: text(item.label),
            number: reveal ? text(item.number) : mask(item.number),
            image: item.image || null
          };
        })
        : []
    },
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  if (role === 'founder' && !reveal) {
    result.personal.contactNumber = mask(result.personal.contactNumber);
    result.personal.alternateContactNumber = mask(result.personal.alternateContactNumber);
    result.bank.accountNumber = mask(result.bank.accountNumber);
  }
  return result;
}

async function submit(trainerId, input, role) {
  const actorRole = role === 'relationship_manager' ? 'relationship_manager' : 'trainer';
  const existing = await db.findTrainerOnboarding(trainerId);
  if (existing) {
    const error = new Error('Onboarding KYC is locked after first submission.');
    error.code = 'KYC_LOCKED';
    error.status = 409;
    throw error;
  }
  const record = normalize(input, null);
  validate(record);
  const now = new Date().toISOString();
  const stored = Object.assign({}, record, {
    trainerId: trainerId,
    status: 'submitted',
    createdAt: now,
    updatedAt: now
  });
  await db.saveTrainerOnboarding(stored);
  await db.appendSessionEvent(trainerId, 'trainer.onboarding.submitted', {
    actorRole: actorRole,
    targetId: trainerId,
    at: now,
    fields: Object.keys(record)
  });
  return publicView(stored, actorRole);
}

async function updatePersonal(trainerId, input, role) {
  const actorRole = role === 'relationship_manager' ? 'relationship_manager' : 'trainer';
  const existing = await db.findTrainerOnboarding(trainerId);
  if (!existing) {
    const error = new Error('Submit onboarding KYC before editing personal details.');
    error.code = 'KYC_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  const next = normalize(input, existing);
  const stored = Object.assign({}, existing, {
    personal: next.personal,
    bank: next.bank,
    updatedAt: new Date().toISOString()
  });
  await db.saveTrainerOnboarding(stored);
  await db.appendSessionEvent(trainerId, 'trainer.onboarding.personal.updated', {
    actorRole: actorRole,
    targetId: trainerId,
    at: stored.updatedAt,
    fields: EDITABLE_FIELDS.slice()
  });
  return publicView(stored, actorRole);
}

async function correct(trainerId, input, actorId) {
  const existing = await db.findTrainerOnboarding(trainerId);
  if (!existing) {
    const error = new Error('Onboarding KYC not found.');
    error.code = 'KYC_NOT_FOUND';
    error.status = 404;
    throw error;
  }
  const next = normalize(input, existing);
  validate(next);
  const before = {};
  const after = {};
  LOCKED_FIELDS.forEach(function (field) {
    const prior = JSON.stringify(existing[field] || null);
    const updated = JSON.stringify(next[field] || null);
    if (prior !== updated) {
      before[field] = existing[field] || null;
      after[field] = next[field] || null;
    }
  });
  if (!Object.keys(after).length) {
    const error = new Error('No locked KYC field changed.');
    error.code = 'KYC_NO_CORRECTION';
    error.status = 422;
    throw error;
  }
  const now = new Date().toISOString();
  const stored = Object.assign({}, existing, next, {
    trainerId: trainerId,
    status: 'corrected',
    updatedAt: now
  });
  await db.saveTrainerOnboarding(stored);
  const audit = await db.saveTrainerOnboardingCorrection({
    trainerId: trainerId,
    correctedBy: actorId,
    before: before,
    after: after,
    reason: text(input && input.reason),
    createdAt: now
  });
  await db.appendSessionEvent(trainerId, 'trainer.onboarding.corrected', {
    actorRole: 'founder',
    actorId: actorId,
    targetId: trainerId,
    at: now,
    fields: Object.keys(after)
  });
  return { record: publicView(stored, 'founder'), correction: audit };
}

async function viewFor(trainerId, role, options) {
  return publicView(await db.findTrainerOnboarding(trainerId), role, options);
}

async function history(trainerId, options) {
  const rows = trainerId
    ? await db.listTrainerOnboardingCorrections(trainerId)
    : await db.listTrainerOnboardingCorrections(null);
  const reveal = Boolean(options && options.reveal);
  return rows.map(function (row) {
    return {
      id: row.id,
      trainerId: row.trainerId,
      correctedBy: row.correctedBy,
      fields: Object.keys(row.after || {}),
      after: reveal ? row.after : Object.keys(row.after || {}).reduce(function (all, key) {
        all[key] = true;
        return all;
      }, {}),
      reason: row.reason || '',
      createdAt: row.createdAt
    };
  });
}

module.exports = {
  LOCKED_FIELDS: LOCKED_FIELDS,
  EDITABLE_FIELDS: EDITABLE_FIELDS,
  submit: submit,
  updatePersonal: updatePersonal,
  correct: correct,
  viewFor: viewFor,
  history: history,
  publicView: publicView
};
