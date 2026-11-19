# Android APK

## Download from GitHub Actions

The `Build Android APK` workflow in `.github/workflows/android.yml` runs when changes are pushed to `main`. You can also open **Actions → Build Android APK → Run workflow** and choose `main`.

The workflow builds the web app, generates the native Android project if it is missing, and builds a signed debug APK with Node.js 24 and Java 21. Each successful run publishes a GitHub Release containing:

- `petcare.apk`, ready to install on an Android phone.
- `petcare-download-qr.png`, a QR code that links directly to that build's APK.
- `download-url.txt`, the same download URL as plain text.
- `petcare.apk.sha256`, the APK checksum.

Open the completed run's **Summary** or its GitHub Release to scan the QR code. Download the APK on the phone, open it, and allow installation from the browser when Android asks. A private repository requires signing in to a GitHub account with access. Public repositories allow sharing the download with anyone.

The APK is a debug build for testing, rather than a Play Store release. Debug signing keys can differ between builds; if Android rejects an update because of a signing-key mismatch, uninstall the old debug app before installing the new APK. Uninstalling clears local app data.

The workflow uses the built-in `GITHUB_TOKEN` with `contents: write` to publish releases. No personal access token or QR service is needed. Repository or organization policies must allow that permission and the actions used by the workflow.

To generate a QR locally for an existing release, run:

```powershell
npm run android:qr -- Maxinemiago01/Pet-Clinic android-1-1
```

Replace `android-1-1` with the actual release tag. This command only generates the QR and notes in `downloads/`; the APK must already be uploaded to that release for the link to work.

## Local Android setup

The app uses Capacitor to package the Angular build for Android.

From the project folder, install the dependencies and add the native project if the `android/` folder is missing.

```powershell
npm ci
npx cap add android
```

Build the web app, copy it into the native project, and open Android Studio.

```powershell
npm run android:sync
npm run android:open
```

Use Android Studio to run the app on a device or emulator, or build a debug APK. You can also build the debug APK from PowerShell.

```powershell
cd android
.\gradlew.bat assembleDebug
```

Gradle writes the APK to `android/app/build/outputs/apk/debug/app-debug.apk` from the project root. Gradle signs it with a local debug key. The app needs internet access for accounts, records, and photos.
