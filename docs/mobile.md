# Desktop and mobile builds

Every.music uses Tauri 2 around the React client.

## Common setup

- Node.js 22
- Rust stable
- Platform toolchains required by Tauri
- A reachable HTTPS API

Packaged clients do not have the Vite or nginx proxy. Build with an absolute API URL:

```bash
cd frontend
VITE_API_BASE_URL=https://api.example.com/realm npm run desktop:build
```

Add the client origins to `PORTAL_ORIGINS` and keep the Tauri `connect-src` policy aligned with the deployed API.

## Desktop

```bash
cd frontend
npm ci
npm run desktop
npm run desktop:build
```

The release workflow builds Linux, macOS, and Windows bundles on version tags or manual dispatch.
It requires the repository variable `DESKTOP_API_BASE_URL`, for example `https://api.example.com/realm`.

## Android

Install Android Studio, SDK 24+, the NDK, and Java 17+.

```bash
cd frontend
npx tauri android init
VITE_API_BASE_URL=https://api.example.com/realm npm run android
VITE_API_BASE_URL=https://api.example.com/realm npm run android:build
```

For an Android emulator reaching a host API, use `http://10.0.2.2:8080/realm` only for local development and configure the CSP/CORS allowlists accordingly.

## iOS

On macOS, install Xcode and CocoaPods:

```bash
cd frontend
npx tauri ios init
VITE_API_BASE_URL=https://api.example.com/realm npm run ios
VITE_API_BASE_URL=https://api.example.com/realm npm run ios:build
```

App Store and device builds require platform signing identities. Never commit keystores, provisioning profiles, signing passwords, or `key.properties`.

## Verification

Before distributing a package:

1. Run `npm run check`.
2. Run `cargo check --locked`.
3. Test sign-in, refresh, sign-out, verification, password reset, and API-offline recovery.
4. Confirm the production API URL is embedded.
5. Confirm CSP and backend CORS permit only intended origins.
