// Runs the Gradle wrapper in this folder on any OS, for the npm scripts:  node android/gradlew.mjs assembleDebug
import { spawnSync } from 'node:child_process';

const win = process.platform === 'win32';
const run = spawnSync(win ? '.\\gradlew.bat' : './gradlew', process.argv.slice(2), { cwd: import.meta.dirname, stdio: 'inherit', shell: win });
process.exit(run.status ?? 1);
