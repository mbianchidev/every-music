# 📱 Every.music Mobile Apps

Every.music uses **Tauri v2** to build native mobile applications for Android and iOS from the same React + Vite frontend codebase.

---

## Prerequisites

### Common
- **Node.js** 20+
- **Rust** (latest stable)
- **Tauri CLI** (bundled in devDependencies)

### Android
- **Android Studio** with SDK 24+ (API level 24 = Android 7.0)
- **Android NDK** (installed via Android Studio SDK Manager)
- **Java 17+**
- Set `ANDROID_HOME` and `NDK_HOME` environment variables

### iOS (macOS only)
- **Xcode** 15+
- **CocoaPods** (`gem install cocoapods`)
- An Apple Developer account for device testing

---

## Project Structure

The mobile projects live inside the Tauri source directory:

```
frontend/src-tauri/
├── gen/
│   ├── android/          # Android Studio project (auto-generated)
│   │   ├── app/
│   │   │   └── src/main/
│   │   │       ├── java/music/every/app/  # Kotlin entry point
│   │   │       └── res/                    # Android resources & themes
│   │   ├── build.gradle.kts
│   │   └── gradle/
│   └── apple/            # Xcode project (generated on macOS via `npm run ios`)
├── src/
│   ├── lib.rs            # Shared entry point (desktop + mobile)
│   └── main.rs           # Desktop-only entry point
├── capabilities/
│   └── default.json      # Platform permissions
└── tauri.conf.json       # Shared configuration
```

---

## Development

### Android

```bash
cd frontend

# First time: initialize the Android project (already done)
npx tauri android init

# Run on connected device or emulator
npm run android
```

### iOS (macOS only)

```bash
cd frontend

# First time: initialize the iOS project
npx tauri ios init

# Run on simulator
npm run ios
```

---

## Production Builds

### Android APK / AAB

```bash
cd frontend
npm run android:build
```

The output APK/AAB will be in:
`src-tauri/gen/android/app/build/outputs/`

### iOS IPA

```bash
cd frontend
npm run ios:build
```

---

## Theming & Customization

### Android
The Android theme uses Every.music's Neo-Brutalist color palette defined in:
- `src-tauri/gen/android/app/src/main/res/values/colors.xml` — brand colors
- `src-tauri/gen/android/app/src/main/res/values/themes.xml` — material theme mapping

The status bar and navigation bar are styled to match the dark (#0A0A0A) background, with Hot Pink (#FF006E) as the primary accent.

### Mobile CSS
The frontend CSS includes mobile-specific optimizations:
- **Safe area insets** via `env(safe-area-inset-*)` for notched devices
- **Touch targets** minimum 44–48px height on buttons and inputs
- **Tap highlight** disabled for native feel
- **Viewport fit** set to `cover` for edge-to-edge rendering
- **Responsive breakpoints** at 480px for compact phone layouts

---

## App Configuration

Key settings in `tauri.conf.json`:

| Setting | Value |
|---------|-------|
| **App ID** | `music.every.app` |
| **Product Name** | Every.music |
| **Min Android SDK** | 24 (Android 7.0) |
| **Target Android SDK** | 36 |
| **Category** | Music |

---

## Signing (Release Builds)

### Android
Create a `key.properties` file in `src-tauri/gen/android/` with your keystore details:

```properties
storeFile=path/to/your.keystore
storePassword=your-store-password
keyAlias=your-key-alias
keyPassword=your-key-password
```

> **Note:** Never commit `key.properties` or keystore files to version control.

### iOS
Configure signing in Xcode under the project's "Signing & Capabilities" tab with your Apple Developer team.

---

## Troubleshooting

**Android emulator can't reach backend API:**
In debug mode, cleartext traffic is enabled. Point the Conduit base URL to your machine's IP (e.g., `http://10.0.2.2:8080/realm` for the Android emulator).

**iOS simulator not available:**
The `tauri ios` commands require macOS with Xcode installed. They are not available on Linux or Windows.

**Fonts not loading offline:**
The app loads Google Fonts from CDN. For fully offline mobile builds, consider bundling the Fredoka and Work Sans font files in `frontend/public/` and referencing them with local `@font-face` rules.
