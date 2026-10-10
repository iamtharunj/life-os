import { askSecret, confirmBox, getDB, isDB, migrate, replaceDB, toast, undo } from './store.ts';
import { demoSummary, seedDB, withoutDemo } from './seed.ts';
import { emptyDB } from './store.ts';
import { today } from './dates.ts';
import { ITERATIONS, derive, savedCreds, seal, unseal } from './cloud.ts';
import { native } from './platform.ts';
import { Vault } from './vault.ts';
import type { DB } from './types.ts';

/** Browser: a download. App: the system "save as" picker, so the file goes only where the user puts it. */
async function saveText(name: string, text: string) {
  if (native) return (await Vault.saveFile({ name, text })).saved;
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

/** `encrypted`: sealed with this device's sync key, so it opens with the passphrase that was in use when it was made. */
export async function exportData(encrypted = false) {
  const json = JSON.stringify(getDB(), null, 2);
  const creds = savedCreds();
  let text = json;
  if (encrypted && creds) text = JSON.stringify({ lifeosBackup: 1, salt: creds.salt, iterations: ITERATIONS, blob: await seal(creds.key, json) });
  else if (native && !(await confirmBox('Export without encryption?', { body: 'Anyone, and any app, that can open this file can read your whole planner. Save it somewhere private, or use the encrypted export instead.', ok: 'Export anyway', danger: true }))) return;
  try {
    if (await saveText(`lifeos-backup-${today()}${text === json ? '' : '.encrypted'}.json`, text)) toast(native ? 'Backup saved' : 'Backup downloaded');
  } catch { toast('The backup could not be saved', { kind: 'warn' }); }
}

/** Parse a backup file, plain or encrypted. Null (after telling the user why) when it cannot be used. */
export async function readBackup(file: File): Promise<DB | null> {
  let parsed: any;
  try { parsed = JSON.parse(await file.text()); } catch { toast('That file is not valid JSON', { kind: 'warn' }); return null; }
  if (parsed?.lifeosBackup === 1 && typeof parsed.blob === 'string' && typeof parsed.salt === 'string') {
    try {
      const creds = savedCreds();
      let key = creds?.salt === parsed.salt ? creds!.key : undefined;
      if (!key) {
        const pass = await askSecret('Passphrase for this backup', { body: 'This backup is encrypted. Enter the sync passphrase that was in use when it was made.', ok: 'Open' });
        if (pass === null) return null;
        const n = Number(parsed.iterations); // from the file, so only accept a sane work factor
        key = (await derive(pass, parsed.salt, n >= 100_000 && n <= 5_000_000 ? n : undefined)).key;
      }
      parsed = JSON.parse(await unseal(key, parsed.blob));
    } catch { toast('That passphrase does not open this backup', { kind: 'warn' }); return null; }
  }
  if (!isDB(parsed)) { toast('Not a Life OS backup file', { kind: 'warn' }); return null; }
  return parsed;
}

export async function importData(file: File) {
  const parsed = await readBackup(file);
  if (!parsed) return;
  const n = parsed.tasks.length + (parsed.sleep?.length ?? 0) + (parsed.txns?.length ?? 0);
  const ok = await confirmBox('Replace all current data with this backup?', { body: `The backup contains ${n}+ records. Your current data will be replaced (you can undo right after).`, ok: 'Import', danger: true });
  if (!ok) return;
  replaceDB(migrate(parsed));
  toast('Backup imported');
}

export async function resetDemo() {
  const ok = await confirmBox('Reset to demo data?', { body: 'Everything you entered will be replaced by the sample data. Export a backup first if you want to keep it.', ok: 'Reset', danger: true, typeToConfirm: 'RESET' });
  if (ok) { replaceDB(seedDB()); toast('Demo data restored'); }
}
export async function removeDemo() {
  const { removed, kept } = demoSummary(getDB());
  if (!removed) { toast('There is no demo data left to remove'); return; }
  const ok = await confirmBox('Remove all demo data?', {
    body: `Deletes ${removed.toLocaleString()} sample records, including the sample habits, rewards and workout templates. ${kept.length ? `Keeps what you added: ${kept.join(', ')}.` : 'You have not added anything yet, so the planner will be empty.'} Your settings stay. Anything that started as sample data is removed even if you edited it.`,
    ok: 'Remove demo data',
  });
  if (ok) { replaceDB(withoutDemo(getDB())); toast('Demo data removed. It\'s all yours now.', { action: 'Undo', onAction: undo }); }
}
export async function clearAll() {
  const ok = await confirmBox('Delete ALL data and start empty?', { body: 'This removes every record. Settings are kept. A daily backup still exists in data/backups on disk.', ok: 'Delete everything', danger: true, typeToConfirm: 'DELETE' });
  if (ok) { const e = emptyDB(); e.settings = getDB().settings; replaceDB(e); toast('Started fresh'); }
}
