# Desktop and mobile builds

[Documentation index](README.md) | [Release artifacts](releases.md) | [Configuration](configuration.md)

Every.music uses Tauri 2 around the React client.

## Common setup

- Node.js 22.12+
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

For verified local installers, use `node scripts/release.mjs` from the repository
root with `VITE_API_BASE_URL` set. See [release builds](releases.md) for preflight,
host requirements, checksums, and signing status.

The CI workflow builds Linux, macOS, and Windows development installers on version
tags or manual dispatch and uploads them as artifacts. It uses the repository
variable `DESKTOP_API_BASE_URL` or a manual `api_base_url` input. These are not
published GitHub releases or signed/notarized store packages.

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

The isolated regression package depends directly on the patched vendor directory
and shares the desktop application's workspace lockfile, without requiring the
Tauri GUI to run. The explicit path keeps the test bound to the backport instead
of declaring an unpatched crates.io release that triggers a misleading Dependabot
alert. The vendor crate is excluded from workspace membership so its upstream
development dependencies and test suites stay outside application-wide builds.
The regression exercises
`next`, `nth`, `last`, `next_back`, and `nth_back` in release mode, where the
unpatched implementation crashes. On a host with GLib development libraries and
`pkg-config` installed:

```bash
cd frontend/src-tauri
cargo test --locked --release -p glib-variant-iter-regression --lib
cargo tree --locked --target x86_64-unknown-linux-gnu -i glib
```

CI runs the optimized regression on Linux. Until an upstream replacement is
compatible, any vendor refresh must verify the published checksum, preserve the
backport and license, and rerun the regression.
This is a source-level fix, not a claim that the unchanged 0.18.5 version falls
outside the advisory's version range.

**TODO/FIXME (dependency-update agents):** On every Tauri, GTK, or GLib update,
check for a patched upstream GLib release accepted by the complete Linux
dependency tree. As soon as one is compatible, remove the local fix in favor of
the upstream library:

1. Remove the `glib` entry from `[patch.crates-io]` and delete `frontend/src-tauri/vendor/glib`.
2. Update the regression package to use the same compatible upstream GLib version as Tauri and regenerate `Cargo.lock`.
3. Confirm the Linux dependency tree contains only patched upstream GLib releases, rerun the optimized regression and native CI build, and remove the obsolete backport documentation.

## Android

Install Android Studio, SDK 24+, the NDK, and Java 17+. The Android scaffold is
tracked under `src-tauri/gen/android`; initialize with `npx tauri android init`
only if recreating an absent platform project.

```bash
cd frontend
VITE_API_BASE_URL=https://api.example.com/realm npm run android
VITE_API_BASE_URL=https://api.example.com/realm npm run android:build
```

For an Android emulator reaching a host API, use `http://10.0.2.2:8080/realm` only for local development and configure the CSP/CORS allowlists accordingly.

## iOS

On macOS, install Xcode and CocoaPods. The iOS scaffold is not tracked in this
repository; initialize it before building:

```bash
cd frontend
npx tauri ios init
VITE_API_BASE_URL=https://api.example.com/realm npm run ios
VITE_API_BASE_URL=https://api.example.com/realm npm run ios:build
```

App Store and device builds require platform signing identities. Never commit keystores, provisioning profiles, signing passwords, or `key.properties`.

Android/iOS packaging and physical-device accessibility are not covered by the
desktop CI matrix. Validate them on the relevant SDKs/devices before distribution.

## Verification

Before distributing a package:

1. Run `npm run check`.
2. Run `cargo check --locked`.
3. Test sign-in, refresh, sign-out, verification, password reset, and API-offline recovery.
4. Confirm the production API URL is embedded.
5. Confirm CSP and backend CORS permit only intended origins.
