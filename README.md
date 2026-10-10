# Life OS

A local-first personal operating system: today, week, calendar, tasks, focus, academics, fitness, sleep, diet,
mindfulness, finance, projects & hackathons, habits, goals, analytics and reviews — with a subtle RPG layer.

## Run

Double-click **`Start Life OS.cmd`**, or:

```
npm install      # first time only
npm start        # builds, serves http://localhost:4321 and opens the browser
```

Keep that window open while you use the app — closing it stops the server ("site can't be reached").

- **Phone, anywhere (recommended):** Tailscale on laptop + phone, then open **https://tharun.tail608ed9.ts.net**
  (set up once with `tailscale serve --bg 4321`; only your own Tailscale devices can reach it; turn off with
  `tailscale serve --https=443 off`). Needs Life OS running on the laptop and Tailscale connected on both.
- `npm run start:lan` — reachable from anyone on the same Wi-Fi (no login: trusted networks only).
- `npm run dev` — rebuilds and reloads the page when source files change.
- `npm test` — logic self-checks (recurrence, sleep window, streaks, XP, finance, demo data).
- `npm run typecheck`

## Hosted version (Vercel, end-to-end encrypted)

Works from any device with no laptop running. Your planner is encrypted in the browser with your passphrase before
upload; the server (`api/cloud.js`) stores only an unreadable blob, a hash of an access token, and a salt.

1. Push this repo to GitHub (a private repo is fine) and import it in Vercel. `vercel.json` already sets the build.
2. In the Vercel project: **Storage → Create Database → Upstash for Redis** (free plan), connect it to the project.
3. **Deployments → Redeploy** so the function sees the storage variables.
4. Open the site and create your passphrase. Then on the laptop: Settings → Data → Export; on the hosted site:
   Settings → Data → Import.
5. On your phone: open the site, enter the passphrase once, then "Add to Home screen". It opens offline and syncs
   when it is back online.

- **Forgotten passphrase = unreadable cloud copy.** Nobody can reset it. Keep an exported backup.
- Two devices: a device with stale data is refused and loads the newer copy instead of overwriting it.
- One encrypted snapshot per day is kept for 35 days (Settings → Data → Restore a daily backup).
- Change the passphrase: Settings → Data → Change passphrase. Other devices ask for the new one; daily backups from
  before the change are removed (only the old passphrase could read them).
- Start over: Settings → Data → Lock this device on every device, then delete the `lifeos:*` keys in the Upstash
  console; the next visit asks for a new passphrase.
- The local version (`npm start`) keeps working and keeps its own separate data file.

## Android app

The same app as an installable APK (Capacitor 8), syncing with the hosted backend above. On the phone the planner
and the sync keys are stored encrypted with an Android Keystore key, there is an optional app lock, and reminders
are local notifications.

```
npm run android:apk      # -> android/app/build/outputs/apk/debug/app-debug.apk
```

- Build, install and release notes: [docs/ANDROID_BUILD.md](docs/ANDROID_BUILD.md)
- What is protected and what is not: [docs/ANDROID_SECURITY_AUDIT.md](docs/ANDROID_SECURITY_AUDIT.md)
- What was tested, and the checklist to run on your phone: [docs/ANDROID_TEST_PLAN.md](docs/ANDROID_TEST_PLAN.md)

The app can only sync once the backend in this repository (`api/cloud.js`) has been deployed, because that is what
lets the app's origin call it.

## Your data

- Stored in `data/lifeos.json` next to this file; a daily copy goes to `data/backups/` (last 30 days).
- Settings → Data: export / import a JSON backup, remove demo data, reset demo data, delete everything.
- Deletes show an **Undo** toast (also `Ctrl+Z`).
- If the page is opened without the server, it falls back to browser storage and says so in the sidebar.

## Keys

`Ctrl/⌘+K` search & commands · `C` quick capture · `T` today · `W` week · `F` focus · `H` home

## Notes

- Vite can't build from a folder whose path contains `#`, so `server.mjs` uses esbuild + a tiny Node server instead.
- XP is derived from your history (never stored), so changing XP values in Settings applies retroactively.
  Tasks and focus sessions done inside your protected sleep window earn no XP.
