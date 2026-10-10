# Life OS for Android: test plan and results

Run on 2026-10-10 on the development PC (Windows 11, Node 24.19, JDK 21.0.12, Android SDK platform 36).

**Read this first.** Everything below marked *passed* was actually run and its output read. No phone was attached
and no emulator was available (an emulator download was started and then stopped when the PC ran low on memory),
so **nothing has been run on Android itself yet**. The Kotlin code compiles, its encryption format is unit-tested on
the JVM, and the web side is tested end to end against a stand-in phone, but the Android Keystore, real
notifications, the biometric prompt and WebView behaviour are verified only by you, with the checklist in part C.

No real planner data was used in any test. The production backend received only read-only requests (public
metadata, a preflight, the home page headers; part A7). Nothing was written to it.

## A. Automated checks that were run

### A1. Existing project checks (regression)

| Check | Command | Result |
|---|---|---|
| Logic self-checks | `npm test` | passed, 11 groups (8 existing + 3 new) |
| Types | `npm run typecheck` | passed, no errors |
| Build | `npm run build` | passed |
| Website build (what Vercel runs) | `node server.mjs --site` | passed; `site/index.html` is byte-for-byte `index.html`; 0 source maps |
| Production dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |
| Full dependency audit | `npm audit` | 3 moderate, all one advisory: `uuid` (GHSA-w5hq-g745-h8pq) reached only through `xcode`, which the Capacitor CLI uses for iOS projects. Build-time only, never in the APK or the site, and this project has no iOS target. The offered fix downgrades the CLI, so it was not applied |

### A2. New self-checks in `npm test` (`src/lib/selftest.ts`)

| Area | What is asserted | Result |
|---|---|---|
| API host | website uses `/api/cloud`; app uses exactly `https://life-os-ecru-omega.vercel.app/api/cloud` | passed |
| Link rules | only `http(s)` and `mailto` links become clickable; `javascript:`, `data:`, `intent:`, `file:`, `content:`, `tel:`, `blob:` do not | passed |
| Capacitor config | bundled assets (no `server.url`), no cleartext, no mixed content, bridge logging off, WebView debugging off | passed |
| CORS | the app origin and the site get their exact origin echoed, with methods `GET, PUT, OPTIONS`, headers `authorization, content-type`, `Vary: Origin`, no credentials header; eight other origins (including `http://localhost`, `https://localhost:8080`, `null`, `*`) get nothing; a request with a bad token is still `401` | passed |
| Cloud encryption (existing) | AES-GCM round trip, fresh IV, tamper and wrong-key rejection, passphrase change, backups | passed, unchanged |
| Reminder plan | off schedules nothing; unique, stable IDs; 7-day window, future only, at most 64; default text contains no task, block or habit name; details only when enabled; edit, complete, delete and disabling a category drop the old reminder; recurrence respects weekday, `until`, skipped and attended days; bedtime after midnight; quiet hours; paused and idle timers | passed |
| Reminder sync | unchanged plan is not rescheduled; reschedule replaces rather than duplicates; a moved task cancels the old day; turning off cancels everything; exact alarms are never requested | passed |
| Daylight saving | 08:00 stays 08:00 local across both US changeovers (23 h and 25 h days); a 02:30 reminder on the spring-forward day lands at 03:30; same wall-clock time and ID in another zone | passed |
| Notification routes | only routes the app defines are accepted; URLs, `javascript:`, path tricks and non-strings are rejected | passed |

### A3. Kotlin unit tests (`npm run android:check`, `EnvelopeTest`)

Runs on the JVM with a throwaway AES-256 key in place of the Keystore key. 7 tests, 0 failures:
round trip; no plaintext, structure or token visible in the stored bytes; a fresh IV on every write; tampering in
the IV, ciphertext or tag, truncation, an empty file and an unknown version all rejected; a different key rejected;
a file moved to another slot rejected; an empty value and a 2 MB multi-byte value.

### A4. Android Lint (`npm run android:check`)

0 errors. 8 warnings, none security-related: a newer Gradle patch and AppCompat exist (the Capacitor template pins
them); three unused template resources; three notes about the legacy launcher bitmap used only on Android 7.

### A5. App end-to-end, stand-in phone (`npm run test:app`, `tests/app-e2e.mjs`)

The real `mobile/` bundle in headless Chrome at the app's origin (`https://localhost`), with Capacitor's real
bridge script, an in-memory stand-in for the three native plugins, and the real `api/cloud.js` handlers on an
in-memory store. DNS was disabled in the browser so nothing could reach a real server. 9 scenarios, all passed:

1. First launch and setup. The planner and keys are written only through the Vault; web storage contains no
   planner text, no AES key, no token and no passphrase; the server holds no plaintext; no service worker;
   screenshots blocked by default.
2. Offline: an edit shows "Offline · saved here" only after the local save; an offline restart opens the saved copy
   without asking for the passphrase; reconnecting syncs it.
3. Going to the background flushes immediately. A stale phone gets `409`, adopts the newer copy, and the server
   revision is not overwritten.
4. Reminders: permission denied leaves the switch off with an explanation; granted schedules inexact, generically
   worded notifications on five channels; reopening does not duplicate; disabling a category or the whole feature
   cancels; a tap opens `/sleep`; five hostile route values are ignored.
5. Back button: previous page; closes an open dialog first; minimizes at the first page; data untouched.
6. Export: plaintext export asks first and saves nothing on cancel; the encrypted export contains no readable
   planner or key; it imports back.
7. App lock: cannot be enabled without passing the system prompt; locks on restart and after background time;
   prompts once, not per render; nothing of the planner is drawn while locked; removing the phone's screen lock
   does not lock the owner out.
8. Unreadable local data: online, the planner is restored from the cloud and the old file is set aside; offline,
   a recovery screen appears and nothing is seeded or replaced; unreadable keys ask for the passphrase again; a
   wrong passphrase leaves no keys behind.
9. The server stops accepting the token (passphrase changed elsewhere): the phone drops its keys and asks again.

Across the run: 0 Content-Security-Policy violations, 0 requests to any other host, 0 page errors, and 18 CORS
preflights answered by the real `OPTIONS` handler.

### A6. Website regression in a browser (development harness, not in the repository)

Headless Chrome against a local stand-in that serves the freshly built site with the exact response headers from
`vercel.json`.

| Mode | Result |
|---|---|
| Hosted (encrypted sync) | setup, all 19 pages render, service worker registers, edit survives reload, export downloads; 0 CSP violations, 0 errors |
| Hosted, two devices | passphrase change on one device, the other is refused with the old one and accepted with the new one: passed |
| Local server (`npm start` behaviour) | all 19 pages, edit reaches the server and survives reload, no service worker; 0 CSP violations, 0 errors |
| Phone-only settings | "App lock" and "Reminders" do not appear in the browser |

### A7. Build output inspection

| Check | Result |
|---|---|
| `npm run android:apk` end to end | passed; `android/app/build/outputs/apk/debug/app-debug.apk`, 3.67 MB |
| APK signature | verifies (APK Signature Scheme v2, local debug certificate) |
| Permissions in the built APK (`aapt2 dump permissions`) | `INTERNET`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `USE_BIOMETRIC`, `USE_FINGERPRINT` (pre-Android 9 name for the same thing), plus AndroidX's internal `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. No `SCHEDULE_EXACT_ALARM`, `WAKE_LOCK`, storage, location, camera, microphone or contacts |
| Debuggable | no |
| Merged manifest | 1 exported component (the launcher activity); 0 deep-link filters; `allowBackup=false`; extraction rules exclude everything; `usesCleartextTraffic=false`; system CAs only; 3 unexported receivers and 2 unexported providers from the notification plugin and AndroidX |
| Files in the APK | the web bundle is byte-identical to `mobile/`; no source maps, `.env`, `data/`, backups, `.git`, service worker, TypeScript sources or keystores |
| Secret patterns in `mobile/`, `site/` and the unpacked APK | none: no Redis/Upstash names, private keys, cloud tokens, JWTs, bearer literals, personal hostnames or signing passwords |
| JavaScript bundle | 0 `console.log`, 0 `console.debug`, 0 `eval`, 0 `new Function`, no script loaded from another origin |
| Hosts named in the bundle | the sync origin; `www.w3.org` (SVG namespace); `react.dev` and `capacitorjs.com` (error-message links); `github.com` and `www.hackerearth.com` (links in the demo data). None is contacted by the app |
| Live backend, read-only (`GET ?meta`, `OPTIONS`) | reachable; **does not yet allow the app's origin** (`OPTIONS` → 405). Expected until this repository is deployed; see part B |

## B. Before the app can sync: deploy

Push this repository so Vercel deploys the updated `api/cloud.js` and `vercel.json`. Then:

```
curl -i -X OPTIONS https://life-os-ecru-omega.vercel.app/api/cloud -H "Origin: https://localhost"
```

- [ ] answers `204` with `access-control-allow-origin: https://localhost`
- [ ] the website still opens, syncs and shows no errors in the browser console (it now sends a
      Content-Security-Policy; the same policy passed all 19 pages locally)
- [ ] `curl -i ... -H "Origin: https://example.com"` returns no `access-control-allow-origin`

## C. On your phone (not yet verified by anyone)

Use a copy of your data you can afford to lose until the first block passes: export a backup from the website
first.

### C1. Install and first run
- [ ] `adb install -r app-debug.apk` succeeds; the launcher shows "Life OS" with the green L icon
- [ ] First launch online shows "Enter your passphrase"; the correct passphrase opens your planner
- [ ] A wrong passphrase is refused
- [ ] Status and navigation bars do not cover the top bar or the bottom navigation, in portrait and landscape
- [ ] All sections open: Today, Week, Calendar, Tasks, Focus, Academics, Fitness, Sleep, Diet, Mindfulness,
      Finance, Projects, Habits, Goals, Analytics, Reviews, Inbox, Settings

### C2. Storage and sync
- [ ] Edit something; the indicator reaches "Synced · encrypted"; the change appears on the website
- [ ] Aeroplane mode: edit; indicator shows "Offline · saved here"; force-stop the app; reopen offline; the edit
      is there and no passphrase is asked
- [ ] Back online: it syncs within a few seconds of reopening
- [ ] Edit on the website, then open the app: the newer data loads
- [ ] Force-stop and reopen ten times: the planner always opens (Keystore decryption is stable on your phone)
- [ ] Reboot the phone and open the app: the planner opens
- [ ] Install a rebuilt APK over the top (`adb install -r`): data is still there

### C3. Privacy
- [ ] Recent-apps view shows a blank card for Life OS
- [ ] Screenshot is blocked; after Settings → App security → Allow screenshots it works
- [ ] Settings → App security → App lock: asks for fingerprint or PIN to enable; after leaving the app for longer
      than the chosen time it asks again; cancelling leaves it locked
- [ ] `adb shell run-as io.github.iamtharunj.lifeos ls` is refused ("not debuggable")
- [ ] `chrome://inspect` on a connected PC does not list the app's WebView
- [ ] `adb logcat` while using the app shows no planner text, passphrase or tokens
- [ ] Android Settings → Apps → Life OS → Permissions lists only Notifications

### C4. Reminders
- [ ] Settings → Reminders: turning it on shows Android's permission dialog (Android 13+); allowing it enables
      the switch; "Send a test" shows a notification
- [ ] Denying the permission leaves the switch off with an explanation, and the rest of the app works
- [ ] A time block starting in about 15 minutes produces a reminder roughly 10 minutes before (it may be a few
      minutes late), with the app in the foreground, in the background, and swiped away from recents
- [ ] The notification says "Life OS" and nothing about the task unless "Show details" is on
- [ ] Tapping a reminder opens the right page
- [ ] Open and close the app several times: no duplicate reminders
- [ ] Complete or delete the task or block: its reminder no longer fires
- [ ] Reminders inside quiet hours do not fire
- [ ] After a reboot, without opening the app, a scheduled reminder still fires
- [ ] Turning notifications off in Android settings: the app shows "Blocked in Android settings"
- [ ] A focus session that ends while the app is in the background produces a notification

Some phones (Xiaomi, Oppo, Vivo, OnePlus, Samsung with aggressive settings) stop background alarms for
force-stopped or "optimised" apps. If reminders go missing, set Life OS to Unrestricted under
Android Settings → Apps → Life OS → Battery, and allow auto-start if your phone has that setting.

### C5. Links, back, export
- [ ] A project link (https) opens in your browser, not inside the app
- [ ] Back goes to the previous page, closes dialogs, and from the first page leaves the app running in the background
- [ ] Settings → Data → Export encrypted opens Android's "save as" screen and saves a file
- [ ] Export data warns about plaintext first
- [ ] Import data with that encrypted file restores it

### C6. Recovery (optional, destructive: do it last, after a successful sync)
- [ ] Android Settings → Apps → Life OS → Storage → Clear storage, reopen: the app asks for the passphrase and
      restores everything from the cloud
