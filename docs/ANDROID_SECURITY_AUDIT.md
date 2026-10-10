# Life OS for Android: security audit

Scope: the Android app in `android/`, the shared React code in `src/`, and the sync function `api/cloud.js`.
This is an engineering review against the OWASP MASVS control groups and Android's security guidance. It is not a
certification and it does not claim the app cannot be broken. No planner records, keys or tokens appear in this file.

## 1. Architecture and data flow

```
 ┌──────────────────────── Android phone ─────────────────────────┐
 │  Life OS APK (io.github.iamtharunj.lifeos)                     │
 │                                                                │
 │  WebView, origin https://localhost                             │
 │   bundled React app (assets/public, no remote JavaScript)      │
 │   CSP: script-src 'self'; connect-src 'self' + sync origin     │
 │        │ plaintext planner + derived keys live in memory       │
 │        │                                                       │
 │        │ Capacitor bridge, reachable from https://localhost only│
 │        ▼ (3 plugins added here + Capacitor's 4 built-ins)      │
 │  Vault plugin (Kotlin)          App plugin     LocalNotifications
 │   AES-256-GCM, Android Keystore  back button    AlarmManager   │
 │   key (non-exportable)           pause/resume   (inexact)      │
 │        ▼                                                       │
 │  files/vault/lifeos.db      encrypted planner                  │
 │  files/vault/lifeos.cloud   encrypted sync keys                │
 │  files/vault/lifeos.timer   encrypted focus-timer state        │
 │  WebView localStorage       revision number, dirty flag,       │
 │                             device preferences (no content)    │
 └───────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS only (TLS, system CAs)
                                 │ Authorization: Bearer <token>
                                 │ body: AES-256-GCM ciphertext
                                 ▼
        https://life-os-ecru-omega.vercel.app/api/cloud   (Vercel Function)
          CORS allowlist: the site itself + https://localhost
          stores sha256(token), salt, revision, ciphertext
                                 ▼
                        Upstash Redis (ciphertext only)
```

Two separate encryption layers, with separate jobs:

| Layer | Protects | Key | Where the key lives |
|---|---|---|---|
| Cloud (unchanged) | the copy on Vercel/Upstash and in transit | PBKDF2-SHA256 (600k) of your passphrase → AES-256-GCM key + access token | derived on the device; never sent (only the token half is) |
| Device (new, Android only) | the copy stored on the phone, and the cloud keys stored on the phone | random AES-256-GCM key created in the Android Keystore | inside the Keystore (hardware-backed where the phone has a TEE); cannot be exported |

Why Capacitor with bundled assets, rather than a WebView pointed at the website or a Trusted Web Activity: with the
site loaded remotely, whoever can change what that URL serves (a compromised deploy, a hijacked domain) runs code
with full access to the planner and the native bridge, the app cannot open offline on first launch, and a TWA runs
in Chrome where the app has no control over storage (the planner would stay in plaintext browser storage) and no
Keystore. Bundling means the code that runs is the code in the APK.

## 2. Threat model

Assets: planner contents (tasks, schedule, sleep, health, journal, finances, goals), the cloud AES key and access
token, the passphrase (never stored), notification text.

| # | Adversary | In scope? | Main controls |
|---|---|---|---|
| T1 | Finder or thief of the phone, screen locked | yes | Android file-based encryption + Keystore-encrypted files; no backups; generic notification text |
| T2 | Someone holding the unlocked phone briefly | yes | app lock (biometric / screen lock), recents preview hidden, screenshots blocked |
| T3 | Another app on the phone (no root) | yes | app sandbox, no exported components beyond the launcher, no FileProvider, no deep links, no shared storage |
| T4 | Network attacker (hostile Wi-Fi) | yes | HTTPS only, cleartext disabled, system CAs only, payload already end-to-end encrypted |
| T5 | Backups and device transfers (Google backup, `adb backup`) | yes | backups and device-to-device transfer disabled |
| T6 | Server or database operator / breach | yes | unchanged: server holds ciphertext, a token hash and a salt |
| T7 | Hostile content inside the planner (a crafted link) | yes | link scheme allowlist in the UI and in the WebView, CSP, no `eval` |
| T8 | A malicious web page calling the API from a browser | yes | exact-origin CORS allowlist; bearer token never in cookies |
| T9 | Dependency compromise (npm, Gradle) | partly | few pinned dependencies, lockfile, no analytics or ad SDKs; not independently audited |
| T10 | Rooted or compromised device, runtime instrumentation, malicious keyboard or accessibility service | **no** | cannot be defended by an app; plaintext is in memory while the app is open |
| T11 | Someone who knows the passphrase | **no** | the passphrase is the account |

## 3. Findings

Severity reflects what would have happened had the web app simply been wrapped as-is.

| ID | Severity | Finding | Where | Resolution |
|---|---|---|---|---|
| F1 | High | Full planner JSON kept in plaintext `localStorage` (`lifeos.db`) | `src/lib/store.ts` | Android: encrypted by the Vault plugin; never written to web storage. Web: unchanged, documented in §6 |
| F2 | High | Derived AES key and bearer token kept in plaintext `localStorage` (`lifeos.cloud`) | `src/lib/cloud.ts` | Android: stored only through the Vault plugin |
| F3 | High | Capacitor's default debug logging prints every plugin call with its arguments to the console and logcat. Once the planner goes through a plugin, it would be logged | Capacitor `native-bridge.js` | `loggingBehavior: "none"` in `capacitor.config.json` |
| F4 | High | Template ships `android:allowBackup="true"`: app data would go to cloud backup and device transfer | `AndroidManifest.xml` | backups off; extraction rules exclude everything |
| F5 | High | WebView remote debugging is on by default in debug builds, and a debug APK is `debuggable` (`run-as`, JDWP) | Capacitor default, AGP default | `webContentsDebuggingEnabled: false`; the debug build type is set non-debuggable |
| F6 | Medium | Template FileProvider grants paths for all of external storage and the cache | `res/xml/file_paths.xml` | provider and paths removed (nothing uses them) |
| F7 | Medium | Notification plugin's manifest adds `SCHEDULE_EXACT_ALARM` and `WAKE_LOCK` | plugin manifest | both removed at merge; reminders are scheduled inexact |
| F8 | Medium | Links in planner data are rendered with any URL scheme; Capacitor hands every non-app URL to `ACTION_VIEW` and loads `data:`/`blob:` pages in the app | `Projects.tsx`, `editors.tsx`, Capacitor `Bridge.launchIntent` | http/https/mailto only, in the UI and again in the WebView; everything else is blocked |
| F9 | Medium | The API only worked same-origin; the app's origin needs CORS | `api/cloud.js` | exact allowlist (site + `https://localhost`), no wildcard, no credentials |
| F10 | Medium | No Content-Security-Policy on the site or in the app | `index.html`, `vercel.json` | CSP in the app bundle; CSP and security headers on Vercel |
| F11 | Medium | Reminder text could expose planner content on the lock screen | new feature | generic text by default; detailed previews are opt-in |
| F12 | Medium | Focus-timer state (may hold a task label) in plaintext `localStorage` | `src/lib/focus.ts` | Android: stored through the Vault plugin |
| F13 | Low | Template pulls in the Google Services Gradle plugin (for push) | `android/build.gradle` | removed; there is no Firebase or push |
| F14 | Low | Browser download and `Notification` APIs do not exist in a WebView; export would silently fail | `io.ts`, `focus.ts` | system "save as" picker with a plaintext warning; encrypted export; native notifications |
| F15 | Low | Service worker would cache the shell a second time inside the app | `main.tsx` | not registered and not shipped in the app |
| F16 | Low | AndroidX adds an exported `ProfileInstallReceiver` (guarded by the shell-only `DUMP` permission) | merged manifest | removed at merge; one exported component remains, the launcher activity |
| F17 | Low | Capacitor always registers four built-in plugins (`CapacitorHttp`, `CapacitorCookies`, `WebView`, `SystemBars`); they cannot be switched off by configuration. Script running in the app page could use them, including native HTTP that ignores the page's CSP | Capacitor `Bridge.registerAllPlugins` | not removable without patching Capacitor. Mitigated by what keeps foreign script out: bundled assets only, `script-src 'self'`, no `eval`, no HTML-injection sinks in the code (checked: none), bridge bound to the app origin. Listed in §6 |
| F18 | Info | Capacitor enables WebView geolocation; the app holds no location permission, so it is inert | Capacitor `Bridge.initWebView` | no action |
| F19 | Info | Revision number, dirty flag, dismissed-alert keys and device preferences stay in `localStorage` | `store.ts`, `App.tsx`, `device.ts` | accepted: no planner content |
| F20 | Info | `npm audit`: 3 moderate findings, one advisory (`uuid` via `xcode` via the Capacitor CLI) | dev dependencies | build-time, iOS-only code path, not shipped; the offered fix is a CLI downgrade, not applied. Production dependencies: 0 findings |

Things that were already sound and are unchanged: passphrase never leaves the device; PBKDF2-SHA256 with 600,000
iterations and a random salt; AES-256-GCM with a fresh 96-bit IV per save; the server compares a SHA-256 of the
token in constant time and rate-limits wrong attempts per IP; stale devices get a 409 instead of overwriting newer
data; one encrypted snapshot per day for 35 days.

## 4. Controls by MASVS group

**Storage.** Planner, sync keys and timer state are written only as `version ‖ IV ‖ AES-256-GCM(gzip(text))` files
under the app's private `files/vault/`. Writes are atomic. Nothing sensitive goes to external storage, logs, the
clipboard or backups. Exports are user-initiated through the system file picker; the plaintext option warns first
and an encrypted option is offered.

**Cryptography.** Platform primitives only: Android Keystore AES-256-GCM (device layer), WebCrypto PBKDF2 and
AES-GCM (cloud layer). The Keystore key is generated on the device, non-exportable, and never leaves the Keystore;
the IV is generated by the provider for every write; each file is bound to its slot name as associated data, so a
ciphertext cannot be moved to another slot. No home-made algorithms, no hardcoded keys.

**Authentication.** The cloud model is unchanged (passphrase-derived bearer token). Optional app lock uses the
system BiometricPrompt with the phone's screen lock as fallback. It is a screen in front of the app, not a second
encryption key; see §6.

**Network.** One fixed HTTPS endpoint, compiled in. Cleartext is disabled in the manifest and the network security
config; only system certificate authorities are trusted. No certificate pinning (a pin on a Vercel-managed
certificate has no safe rotation story, and the payload is already end-to-end encrypted).

**Platform.** One exported component (the launcher activity). No deep links, no custom URL scheme handler, no
FileProvider of our own, and no custom JavaScript interface: the only native code added is one Capacitor plugin
(`VaultPlugin.kt`, about 200 lines), alongside the official App and Local Notifications plugins. The WebView shows
only the bundled app; other navigations are blocked or handed to the browser. Permissions in the built APK:
`INTERNET`, `POST_NOTIFICATIONS` (asked when you turn reminders on), `RECEIVE_BOOT_COMPLETED` (re-arm reminders
after a restart), `USE_BIOMETRIC` and its pre-Android 9 name `USE_FINGERPRINT` (app lock), and AndroidX's internal
`DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. The notification plugin's unexported file provider is kept; it is
scoped to an `ln_sounds/` folder the app never creates.

**Code quality.** Pinned Capacitor 8.5.3 packages, lockfile committed, no analytics, ads, trackers or remote
scripts. Unit tests cover the envelope format, tamper rejection, CORS, the API host, reminder planning and storage.

**Privacy.** Reminders are local (no push service, no Firebase). Default notification text names no task, habit or
amount. The recent-apps preview is hidden and screenshots are blocked unless you allow them.

## 5. Verification

Full detail, commands and the phone checklist are in `docs/ANDROID_TEST_PLAN.md`. In short, as of 2026-10-10:

- **Run and passed:** `npm test` (CORS, API host, link rules, reminder planning and syncing, daylight saving,
  cloud encryption), typecheck, the site build, 7 Kotlin unit tests of the storage envelope, Android Lint
  (0 errors), a 9-scenario end-to-end run of the app bundle against a stand-in phone, website regression in a
  browser under the new Content-Security-Policy, and inspection of the built APK (permissions, components,
  backup and cleartext flags, contents, secret patterns).
- **Not run:** anything on Android itself. No phone was attached and no emulator was available. The Keystore
  encryption path, the biometric prompt, real notification delivery, the screenshot flag and WebView link handling
  are implemented and compile, but are **unverified until the checklist in the test plan is done on a phone**.
- **Not yet deployed:** the live backend does not allow the app's origin until this repository is pushed.

## 6. Residual risks and honest limits

- **This has not run on a real phone yet.** See §5. Treat the first install as a test, with a backup exported.
- **The website's storage is unchanged.** In a browser the planner and the derived keys are still in plaintext
  `localStorage`, as before. The site does gain the Content-Security-Policy, the security headers and the link
  rules; the storage protections apply to the Android app only.
- **Script in the app page would have the whole bridge.** Capacitor's built-in plugins (native HTTP, cookies,
  server path) cannot be disabled, and the Vault plugin would decrypt for any script on the page. Everything
  therefore rests on no foreign script getting in: local assets only, `script-src 'self'`, no `eval`, no
  HTML-injection sinks. A bug in React, a dependency or the WebView that broke that would expose the planner.
- **The Keystore key is hardware-backed only where the phone provides it** (TEE on almost all current phones;
  StrongBox is not requested because it is slow and uneven across devices), and it is not bound to the screen
  being unlocked, so the app can save while the phone is locking.
- **A rooted or compromised phone defeats this.** Code running as the app, or as root, can ask the Keystore to
  decrypt or read the planner from memory.
- **The app lock is a screen, not encryption.** The Keystore key is usable whenever the app runs (so saving and
  reminders work in the background). The lock stops someone holding your unlocked phone; it does not add
  protection against an attacker who can already run code as the app.
- **Plaintext is in memory while the app is open**, including the derived cloud key.
- **Lose the phone with unsynced changes and they are gone.** Backups are off by design; recovery is the cloud copy
  plus your passphrase. Nobody can reset the passphrase.
- **If the Keystore key is lost** (some devices drop keys on certain lock-screen changes or OS repairs) the local
  files cannot be decrypted. The app says so, keeps the unreadable file aside, and restores from the cloud after
  you enter the passphrase; changes that were never synced are lost.
- **No certificate pinning.** An attacker who can get a certificate for the Vercel hostname from a trusted CA could
  see the token and ciphertext, and could replace or roll back the stored ciphertext. They could not read it.
- **The server can withhold or roll back data.** It cannot read or forge it (AES-GCM authentication fails).
- **`https://localhost` is an origin any local web server can claim.** CORS only decides which pages may read
  responses; every data request still needs the bearer token, which only this device holds.
- **Reminders are inexact** (no exact-alarm permission) and Android may delay them by several minutes, more under
  battery saver or on aggressive vendor skins. They cover the next 7 days and are refreshed when the app opens.
- **Detailed notification previews, when you turn them on, are visible on the lock screen** subject to your
  Android lock-screen notification setting.
- **The debug APK is signed with this computer's debug key.** Anyone with that key file could sign an update that
  Android would accept over the installed app. Use a release key you control for anything long-lived.
- **Dependencies were not independently audited.** `npm audit` results are in the test plan.
