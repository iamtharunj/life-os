# Building the Life OS Android app

The app is the same React code as the website, bundled into an APK with Capacitor 8. It talks to the same
encrypted sync backend (`https://life-os-ecru-omega.vercel.app/api/cloud`) and needs no laptop or local server.

## One-time deployment step

The app calls the backend from a different origin (`https://localhost`), so the backend must allow that origin.
That change is in `api/cloud.js` in this repository, and it only takes effect once it is deployed:

1. Commit and push to GitHub so Vercel redeploys.
2. Check it: `curl -i -X OPTIONS https://life-os-ecru-omega.vercel.app/api/cloud -H "Origin: https://localhost"`
   should answer `204` with `access-control-allow-origin: https://localhost`.

Until then the installed app shows "Connect once to get started" and cannot sync. The website keeps working
either way.

## What you need

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 or newer | Capacitor CLI requirement |
| JDK | 21 | Capacitor 8 compiles with Java 21 |
| Android SDK | platform 36, build-tools 35 or newer, platform-tools | Android Studio installs these, or use the command-line tools |

Gradle is downloaded by the wrapper (`android/gradlew`); you do not install it.

### On this computer

Everything is already in place, outside the repository:

- JDK 21: `D:\lifeos-toolchain\jdk-21.0.12.1+1` (Temurin, SHA-256 verified on download)
- Android SDK: `D:\prism-toolchain\android-sdk` (the SDK that was already on this PC; platform 36 was added to it)
- Gradle cache: `D:\lifeos-toolchain\gradle-home` (kept off the nearly full C: drive)
- `android/local.properties` points Gradle at the SDK. It is machine-specific and not committed.

Load the environment once per terminal, then build:

```powershell
. D:\lifeos-toolchain\env.ps1
npm run android:apk
```

(Git Bash: `source /d/lifeos-toolchain/env.sh`.)

### On another computer

Install JDK 21 and the Android SDK, then either set `JAVA_HOME` and `ANDROID_HOME`, or create
`android/local.properties` containing `sdk.dir=<path to the SDK>` (on Windows write it as `C\:/Android/Sdk`).

## Commands

| Command | What it does |
|---|---|
| `npm run build:mobile` | Builds the web assets into `mobile/` with the same esbuild step as the site (`node server.mjs --mobile`), then `cap sync android` copies them into the Android project |
| `npm run android:apk` | The above, then `gradlew assembleDebug` |
| `npm run android:check` | Kotlin unit tests and Android Lint |
| `npm test` | Logic self-checks, including CORS, API host, link rules and reminder planning |
| `npm run test:app` | Headless-Chrome run of the app bundle against a stand-in phone (see the header of `tests/app-e2e.mjs`) |

The APK is written to:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

`mobile/` contains only `index.html` and `dist/` (JavaScript, CSS, fonts). No source maps, no service worker, no
`data/`, no `.env`. It is rebuilt from scratch on every run.

## Installing on your phone

With USB debugging enabled and the phone connected:

```powershell
adb install -r "android\app\build\outputs\apk\debug\app-debug.apk"
```

Or copy the APK to the phone and open it (Android will ask you to allow installs from that source).

First launch needs the internet once: enter your passphrase (the same one as on the website). After that the app
opens and saves offline, and syncs when a connection returns.

### Updating

Rebuild and install over the top with the same command (`adb install -r`). Your data stays: the planner files and
the Keystore key belong to the installed app, and an update signed with the same key keeps them. Sync first anyway
(wait for "Synced · encrypted").

Two things that do wipe the app's local data, by Android's design:

- **Uninstalling.** The local copy and the Keystore key are deleted. Reinstall and enter the passphrase to restore
  from the cloud.
- **Installing an APK signed with a different key** (for example a debug build from another computer, or switching
  from debug to release). Android refuses it until the old app is uninstalled.

## About the "debug" build

`assembleDebug` is the build you sideload, so it is hardened beyond the usual debug defaults:

- `debuggable false` in `android/app/build.gradle`: no `adb shell run-as`, no debugger attach.
- WebView remote debugging off and bridge logging off (`capacitor.config.json`).

It is signed with this computer's debug key (`%USERPROFILE%\.android\debug.keystore`). That is fine for your own
phone. Anyone holding that file could sign an update Android would accept over your installed app, so do not share
it, and move to a release key for anything long-lived.

To debug for real, temporarily set `debuggable true` and `"webContentsDebuggingEnabled": true`, and do not use
that build with your real planner.

## Changing the application ID

`io.github.iamtharunj.lifeos` identifies the app on a phone. Changing it makes Android treat the build as a
different app with its own, empty storage. If you do change it, change all of:

- `appId` in `capacitor.config.json`
- `namespace` and `applicationId` in `android/app/build.gradle`
- `package_name` and `custom_url_scheme` in `android/app/src/main/res/values/strings.xml`
- the `package` line and folder of the Kotlin files under `android/app/src/main/java/`

## Changing the backend address

One constant: `CLOUD_ORIGIN` in `src/lib/platform.ts`. The app's Content-Security-Policy is generated from it.
The same origin is listed in `ALLOWED_ORIGINS` in `api/cloud.js`. `npm test` fails if the app's origin
(from `capacitor.config.json`) is not allowed by the API.

## A release-signed APK, later

Not set up, on purpose: a signing key is yours to create and keep. Outline:

1. Create a keystore **outside the repository** and back it up somewhere safe. Losing it means you can never
   update the installed app again.
   ```
   keytool -genkeypair -v -keystore D:\keys\lifeos-release.jks -alias lifeos -keyalg RSA -keysize 4096 -validity 9125
   ```
2. Keep the passwords out of the repository too. Put them in `%USERPROFILE%\.gradle\gradle.properties`
   (or in environment variables), for example:
   ```
   LIFEOS_STORE_FILE=D:/keys/lifeos-release.jks
   LIFEOS_STORE_PASSWORD=...
   LIFEOS_KEY_ALIAS=lifeos
   LIFEOS_KEY_PASSWORD=...
   ```
3. Add a `signingConfigs { release { ... } }` block to `android/app/build.gradle` that reads those properties,
   and set `signingConfig signingConfigs.release` on the `release` build type.
4. Build with `node android/gradlew.mjs assembleRelease`. Output: `android/app/build/outputs/apk/release/`.
5. Verify: `apksigner verify --print-certs app-release.apk`.
6. The first install of a release build replaces the debug build, which means uninstalling the debug app first
   (sync first; you will enter your passphrase again).

Leave `minifyEnabled false` unless you add keep rules for the Capacitor plugin classes and test the result; code
shrinking is not what protects this app. Never commit a `.jks`/`.keystore` file or a password.

## Updating dependencies

Capacitor packages are pinned to exact versions in `package.json`. To move to a newer Capacitor: update
`@capacitor/core`, `@capacitor/android` and `@capacitor/cli` together, update the plugins to matching versions, run
`npx cap sync android`, then `npm test`, `npm run android:check` and `npm run test:app`, and re-read the plugin's
`AndroidManifest.xml` for new permissions (the app manifest removes two it does not want).
