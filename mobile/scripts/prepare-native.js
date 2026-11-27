/* Make Capacitor's generated folders writable before `cap sync`.
 *
 * On Windows, folders synced from OneDrive (and some checked-out native folders)
 * can carry the read-only file attribute. Capacitor removes and recreates its
 * asset directories during sync; Node's recursive rmdir fails with EPERM when
 * any directory is read-only. Clearing the attribute is safe because these are
 * generated native asset folders, not user data or credentials.
 *
 * Junctions are never followed. The local `file:..` dependency creates a
 * junction from node_modules back to the repository root, which would otherwise
 * make a recursive walk loop forever.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const mobileRoot = path.resolve(__dirname, '..');
const targets = ['android', 'ios', 'www'];
const skippedNames = new Set(['.git', 'node_modules']);
let changed = 0;

function makeWritable(target) {
  let stats;
  try {
    stats = fs.lstatSync(target);
  } catch (error) {
    return;
  }

  if (stats.isSymbolicLink()) return;

  if ((stats.mode & 0o222) !== 0o222) changed += 1;
  try {
    /* 0o666 clears FILE_ATTRIBUTE_READONLY on Windows and is a no-op on POSIX. */
    fs.chmodSync(target, 0o666);
  } catch (error) {
    /* Some platform files are intentionally locked; let cap sync report them. */
  }

  if (!stats.isDirectory()) return;

  let entries;
  try {
    entries = fs.readdirSync(target, { withFileTypes: true });
  } catch (error) {
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink() || skippedNames.has(entry.name)) continue;
    makeWritable(path.join(target, entry.name));
  }
}

for (const name of targets) {
  makeWritable(path.join(mobileRoot, name));
}

if (changed) process.stdout.write('Cleared ' + changed + ' read-only native paths.\n');
