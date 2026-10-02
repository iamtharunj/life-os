import { confirmBox, getDB, isDB, migrate, replaceDB, toast } from './store.ts';
import { seedDB, withoutDemo } from './seed.ts';
import { emptyDB } from './store.ts';
import { today } from './dates.ts';

export function exportData() {
  const blob = new Blob([JSON.stringify(getDB(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lifeos-backup-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded');
}

export async function importData(file: File) {
  let parsed: unknown;
  try { parsed = JSON.parse(await file.text()); } catch { toast('That file is not valid JSON', { kind: 'warn' }); return; }
  if (!isDB(parsed)) { toast('Not a Life OS backup file', { kind: 'warn' }); return; }
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
  const ok = await confirmBox('Remove all demo data?', { body: 'Sample courses, projects, logs and habits are deleted. Anything you created yourself is kept.', ok: 'Remove demo data' });
  if (ok) { replaceDB(withoutDemo(getDB())); toast('Demo data removed — it\'s all yours now'); }
}
export async function clearAll() {
  const ok = await confirmBox('Delete ALL data and start empty?', { body: 'This removes every record. Settings are kept. A daily backup still exists in data/backups on disk.', ok: 'Delete everything', danger: true, typeToConfirm: 'DELETE' });
  if (ok) { const e = emptyDB(); e.settings = getDB().settings; replaceDB(e); toast('Started fresh'); }
}
