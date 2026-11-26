/* Private trainer KYC document storage.
 *
 * Live mode writes image bytes to the private Supabase Storage bucket
 * `trainer-kyc`; only metadata is kept in the service-only records table. Mock
 * mode keeps bytes in the same service-only record so local tests remain
 * self-contained. No Data API role can read these records, and no browser
 * payload ever includes the byte field. */
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');

const BUCKET = 'trainer-kyc';
const KINDS = ['aadhaar', 'pan', 'signature', 'bankProof', 'other'];
const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024;

function fail(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status || 422;
  throw error;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeName(value) {
  const clean = text(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return clean || 'document';
}

function decode(data, declaredMime) {
  const raw = text(data);
  const match = raw.match(/^data:([^;,]+);base64,(.+)$/);
  const mime = match ? match[1] : declaredMime;
  const encoded = match ? match[2] : raw;
  if (!mime || MIME_TYPES.indexOf(mime) === -1) {
    fail('KYC_DOCUMENT_MIME', 'Only JPEG, PNG and WebP images are accepted.');
  }
  if (!encoded || !/^[A-Za-z0-9+/=\s]+$/.test(encoded)) {
    fail('KYC_DOCUMENT_DATA', 'The uploaded image is not valid base64 data.');
  }
  const buffer = Buffer.from(encoded.replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) {
    fail('KYC_DOCUMENT_SIZE', 'Each image must be between 1 byte and 4 MB.');
  }
  const isPng = buffer.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isJpeg = buffer.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const isWebp = buffer.length > 12 &&
    buffer.slice(0, 4).toString() === 'RIFF' &&
    buffer.slice(8, 12).toString() === 'WEBP';
  if ((mime === 'image/png' && !isPng) ||
      (mime === 'image/jpeg' && !isJpeg) ||
      (mime === 'image/webp' && !isWebp)) {
    fail('KYC_DOCUMENT_MISMATCH', 'The file content does not match its image type.');
  }
  return { mime: mime, buffer: buffer };
}

function storageUrl(storagePath) {
  const encodedPath = String(storagePath).split('/').map(encodeURIComponent).join('/');
  return String(config.supabase.url).replace(/\/$/, '') + '/storage/v1/object/' + BUCKET + '/' + encodedPath;
}

function storageHeaders(extra) {
  return Object.assign({
    apikey: config.supabase.secretKey,
    Authorization: 'Bearer ' + config.supabase.secretKey
  }, extra || {});
}

async function uploadToStorage(storagePath, decoded) {
  if (!config.supabaseConfigured) {
    fail('KYC_STORAGE_NOT_CONFIGURED', 'Supabase Storage is not configured.', 503);
  }
  const response = await fetch(storageUrl(storagePath), {
    method: 'POST',
    headers: storageHeaders({
      'Content-Type': decoded.mime,
      'Cache-Control': 'private, no-store',
      'x-upsert': 'false'
    }),
    body: decoded.buffer
  });
  if (!response.ok) {
    const detail = await response.text();
    fail(
      response.status === 404 ? 'KYC_STORAGE_BUCKET_MISSING' : 'KYC_STORAGE_UPLOAD_FAILED',
      'Private document upload failed. Ensure the private ' + BUCKET + ' bucket exists.' +
        (detail && process.env.NODE_ENV !== 'production' ? ' ' + detail.slice(0, 180) : ''),
      502
    );
  }
}

function publicMeta(record) {
  if (!record) return null;
  return {
    id: record.id,
    trainerId: record.trainerId,
    kind: record.kind,
    ref: record.ref,
    fileName: record.fileName,
    mimeType: record.mimeType,
    size: record.size,
    uploadedAt: record.uploadedAt
  };
}

async function upload(trainerId, input) {
  const body = input || {};
  const kind = text(body.kind);
  if (KINDS.indexOf(kind) === -1) {
    fail('KYC_DOCUMENT_KIND', 'Unknown document kind.');
  }
  const decoded = decode(body.data || body.base64, text(body.mimeType));
  const id = 'kycdoc_' + crypto.randomUUID();
  const fileName = safeName(body.fileName || body.name);
  const storagePath = config.databaseMode === 'supabase' && config.supabaseConfigured
    ? trainerId + '/' + id + '-' + fileName
    : null;
  if (storagePath) await uploadToStorage(storagePath, decoded);

  const record = {
    id: id,
    trainerId: trainerId,
    kind: kind,
    fileName: fileName,
    mimeType: decoded.mime,
    size: decoded.buffer.length,
    ref: storagePath || id,
    storagePath: storagePath,
    bytes: storagePath ? null : decoded.buffer.toString('base64'),
    uploadedAt: new Date().toISOString()
  };
  await db.saveTrainerDocument(record);
  return publicMeta(record);
}

async function findForTrainer(trainerId, documentId) {
  const record = await db.findTrainerDocument(documentId);
  if (!record || record.trainerId !== trainerId) return null;
  return publicMeta(record);
}

async function read(trainerId, documentId) {
  const record = await db.findTrainerDocument(documentId);
  if (!record || record.trainerId !== trainerId) {
    fail('KYC_DOCUMENT_NOT_FOUND', 'Document not found.', 404);
  }
  if (record.storagePath) {
    if (!config.supabaseConfigured) {
      fail('KYC_STORAGE_NOT_CONFIGURED', 'Supabase Storage is not configured.', 503);
    }
    const response = await fetch(storageUrl(record.storagePath), {
      headers: storageHeaders()
    });
    if (!response.ok) fail('KYC_STORAGE_READ_FAILED', 'Private document read failed.', 502);
    return {
      mimeType: record.mimeType,
      buffer: Buffer.from(await response.arrayBuffer())
    };
  }
  return {
    mimeType: record.mimeType,
    buffer: Buffer.from(String(record.bytes || ''), 'base64')
  };
}

module.exports = {
  BUCKET: BUCKET,
  KINDS: KINDS,
  MAX_BYTES: MAX_BYTES,
  upload: upload,
  findForTrainer: findForTrainer,
  read: read,
  publicMeta: publicMeta
};
