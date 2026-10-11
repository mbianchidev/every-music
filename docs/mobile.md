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

### Linux GLib backport

Tauri's GTK3 dependencies require `glib` 0.18, which cannot be upgraded to the
0.20 release fixing [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).
The Cargo workspace therefore overrides the crates.io package with
`frontend/src-tauri/vendor/glib`, keeping the compatible 0.18.5 version.

The vendor directory contains the published
[`glib` 0.18.5 crate](https://static.crates.io/crates/glib/glib-0.18.5.crate),
with SHA-256 `233daaf6e83ae6a12a52055f568f9d7cf4671dabb78ff9560ab6da230ce00ee5`.
Its upstream revision is `42b9caf98e03ded086362d9653ca58fe94dc8658`.
The only source change is the two-line fix from
[gtk-rs/gtk-rs-core#1343](https://github.com/gtk-rs/gtk-rs-core/pull/1343):
make the output pointer mutable and pass `&mut p` to `g_variant_get_child`.
The upstream MIT license and copyright notice are retained.

The isolated regression package uses the same workspace override and lockfile
as the desktop application, without requiring the Tauri GUI to run. It exercises
`next`, `nth`, `last`, `next_back`, and `nth_back` in release mode, where the
unpatched implementation crashes. On a host with GLib development libraries and
`pkg-config` installed:

```bash
cd frontend/src-tauri
cargo test --locked --release -p glib-variant-iter-regression --lib
cargo tree --locked --target x86_64-unknown-linux-gnu -i glib
```

CI runs the optimized regression on Linux. Keep the override until Tauri can use
a patched upstream GLib release. When replacing the vendored crate, verify its
published checksum, preserve the backport and license, and rerun the regression.
This is a source-level fix, not a claim that the unchanged 0.18.5 version falls
outside the advisory's version range.

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
