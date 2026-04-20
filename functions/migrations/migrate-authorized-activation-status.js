#!/usr/bin/env node

/*
  Migration: ensure authorized users have activationStatus in English.

  - activationStatus: "active" | "inactive"
  - keeps isActive in sync
  - sets status="disabled" when inactive (to preserve legacy behavior)

  Usage:
    cd functions
    node migrations/migrate-authorized-activation-status.js --dry-run
    node migrations/migrate-authorized-activation-status.js --apply

  Notes:
    - For production/local project, configure ADC (GOOGLE_APPLICATION_CREDENTIALS).
    - For emulator, set FIRESTORE_EMULATOR_HOST and GCLOUD_PROJECT.
*/

const admin = require('firebase-admin');

const INACTIVE_STATUS_VALUES = new Set(['disabled', 'inactive', 'deactivated']);

function parseArgs(argv) {
  const args = new Set(argv.slice(2));

  return {
    apply: args.has('--apply'),
    dryRun: args.has('--dry-run') || !args.has('--apply'),
  };
}

function normalizeString(value) {
  return `${value || ''}`.toLowerCase().trim();
}

function resolveTargetActivation(data) {
  const explicitActivation = normalizeString(data.activationStatus);

  if (explicitActivation === 'active') {
    return { activationStatus: 'active', isActive: true };
  }

  if (explicitActivation === 'inactive') {
    return { activationStatus: 'inactive', isActive: false };
  }

  const legacyStatus = normalizeString(data.status);
  const isInactiveLegacy =
    data.isActive === false || INACTIVE_STATUS_VALUES.has(legacyStatus);

  return {
    activationStatus: isInactiveLegacy ? 'inactive' : 'active',
    isActive: !isInactiveLegacy,
  };
}

function shouldUpdate(data, target) {
  const currentActivation = normalizeString(data.activationStatus);
  const currentIsActive = data.isActive;

  if (currentActivation !== target.activationStatus) {
    return true;
  }

  if (currentIsActive !== target.isActive) {
    return true;
  }

  if (target.activationStatus === 'inactive') {
    return normalizeString(data.status) !== 'disabled';
  }

  return false;
}

async function main() {
  const options = parseArgs(process.argv);

  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const collectionRef = db.collection('authorized');

  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    console.log('No documents found in authorized collection.');
    return;
  }

  let inspected = 0;
  let toUpdate = 0;
  let toActive = 0;
  let toInactive = 0;

  const updates = [];

  snapshot.docs.forEach((doc) => {
    inspected += 1;

    const data = doc.data() || {};
    const target = resolveTargetActivation(data);

    if (!shouldUpdate(data, target)) {
      return;
    }

    const payload = {
      activationStatus: target.activationStatus,
      isActive: target.isActive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (target.activationStatus === 'inactive') {
      payload.status = 'disabled';
      toInactive += 1;
    } else {
      toActive += 1;
    }

    toUpdate += 1;
    updates.push({ ref: doc.ref, payload, id: doc.id });
  });

  console.log('--- Migration Preview ---');
  console.log(`Inspected: ${inspected}`);
  console.log(`Will update: ${toUpdate}`);
  console.log(`Set active: ${toActive}`);
  console.log(`Set inactive: ${toInactive}`);

  if (updates.length) {
    const preview = updates.slice(0, 10).map((u) => u.id);
    console.log('Sample document IDs to update:', preview.join(', '));
  }

  if (options.dryRun) {
    console.log('Dry run finished. No writes were made.');
    return;
  }

  if (!options.apply) {
    console.log('No --apply flag provided. Exiting without writes.');
    return;
  }

  const chunkSize = 450;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const batch = db.batch();

    chunk.forEach((item) => {
      batch.set(item.ref, item.payload, { merge: true });
    });

    await batch.commit();
    console.log(
      `Committed batch ${Math.floor(i / chunkSize) + 1} (${chunk.length} docs).`,
    );
  }

  console.log('Migration applied successfully.');
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
