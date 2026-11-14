# Local Android setup

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
