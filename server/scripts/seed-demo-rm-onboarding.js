/* Idempotent demo seed for the granted relationship manager.
 *
 * The seeded RM account already has founder approval and an active status. Its
 * desk still needs a submitted KYC record because staff access requires both
 * signals. This script writes only that labelled demo record; it never changes
 * passwords, pay policy or a trainer record. Safe to run more than once.
 *
 *   DATABASE_MODE=supabase node scripts/seed-demo-rm-onboarding.js
 */
'use strict';

const db = require('../db');

const RECORD = {
  trainerId: 'usr_rm_001',
  status: 'submitted',
  fullName: 'Meera Nair',
  dateOfBirth: '1992-08-21',
  personal: {
    contactNumber: '9876543211',
    alternateContactNumber: '',
    emailId: 'rm@mathify.app',
    address: 'Bengaluru',
    fatherName: 'Nair Father',
    motherName: 'Nair Mother',
    spouseName: ''
  },
  bank: {
    accountHolderName: 'Meera Nair',
    accountNumber: '9876543210',
    ifscCode: 'HDFC0004321',
    bankName: 'HDFC',
    branch: 'Koramangala'
  },
  aadhaar: {
    number: '210987654321',
    front: {
      id: 'demo_rm_aadhaar_front',
      ref: 'onboarding/demo/rm-aadhaar-front.png',
      fileName: 'rm-aadhaar-front.png',
      mimeType: 'image/png'
    },
    rear: {
      id: 'demo_rm_aadhaar_rear',
      ref: 'onboarding/demo/rm-aadhaar-rear.png',
      fileName: 'rm-aadhaar-rear.png',
      mimeType: 'image/png'
    }
  },
  pan: {
    number: 'FGHIJ6789K',
    front: {
      id: 'demo_rm_pan_front',
      ref: 'onboarding/demo/rm-pan-front.png',
      fileName: 'rm-pan-front.png',
      mimeType: 'image/png'
    },
    rear: {
      id: 'demo_rm_pan_rear',
      ref: 'onboarding/demo/rm-pan-rear.png',
      fileName: 'rm-pan-rear.png',
      mimeType: 'image/png'
    }
  },
  signature: {
    image: {
      id: 'demo_rm_signature',
      ref: 'onboarding/demo/rm-signature.png',
      mimeType: 'image/png'
    }
  },
  additionalDocuments: [],
  createdAt: '2026-01-14T09:00:00.000Z',
  updatedAt: '2026-01-14T09:00:00.000Z'
};

async function main() {
  const existing = await Promise.resolve(db.findTrainerOnboarding(RECORD.trainerId));
  if (existing && existing.status === 'submitted') {
    process.stdout.write('demo RM onboarding already present; no write performed.\n');
    return;
  }
  await Promise.resolve(db.saveTrainerOnboarding(RECORD));
  process.stdout.write('demo RM onboarding seeded for ' + RECORD.trainerId + '.\n');
}

main().catch(function (error) {
  console.error('demo RM onboarding seed failed:', error && error.message || error);
  process.exitCode = 1;
});
