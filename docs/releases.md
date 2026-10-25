# Release builds and development artifacts

[Documentation index](README.md) | [Native prerequisites](mobile.md) | [Operations](deployment.md)

## What is distributed

The repository currently has no published GitHub release or app-store package.
The CI packaging job can produce downloadable **development** installers.
They are not a claim of Developer ID signing, notarization, Windows publisher
verification, or readiness for store submission.

The local entrypoint `scripts/release.mjs` reuses the installed Tauri CLI and its
existing `beforeBuildCommand` (`npm run compile`). It builds native installers,
checks that each expected artifact is new and nonempty, and generates SHA-256
checksums. It never creates a tag, GitHub release, upload, or registry push.

## Prerequisites and supported hosts

- Node.js 26.12.1 recommended (22.12+ minimum), npm, Rust stable, and [Tauri platform dependencies](https://v2.tauri.app/start/prerequisites/).
- Run `(cd frontend && npm ci)` before packaging.
- Use the host-native architecture (`arm64` or `x64`); cross-compilation and
  universal macOS packages are not provided by this wrapper.
- Keep versions aligned in `frontend/package.json`,
  `frontend/src-tauri/tauri.conf.json`, and `frontend/src-tauri/Cargo.toml`.
- Supply an absolute `VITE_API_BASE_URL` ending in `/realm`. HTTPS is required
  except for loopback development. Credentials/query strings/fragments are rejected.

| Host | Additional toolchain | Wrapper output |
|---|---|---|
| macOS | Xcode Command Line Tools | `.dmg` |
| Linux | WebKitGTK 4.1, GTK3, AppIndicator, librsvg, patchelf and system build dependencies | `.deb`, `.AppImage` |
| Windows | MSVC C++ build tools and WebView2 | NSIS `.exe` installer |

Tauri remains responsible for its platform prerequisites. Preflight validates
the tools it can inspect; a full build is needed to verify SDK/bundler availability.
Mobile builds use the [Android/iOS procedures](mobile.md), not this wrapper.

## Build locally

From the repository root, in a POSIX shell:

```bash
VITE_API_BASE_URL=http://localhost:8080/realm node scripts/release.mjs --check
VITE_API_BASE_URL=http://localhost:8080/realm node scripts/release.mjs
```

For a deployed API, replace the loopback URL with your real HTTPS API URL.
It becomes public build-time configuration. Align backend CORS and the Tauri CSP
before packaging.

PowerShell:

```powershell
$env:VITE_API_BASE_URL = "http://localhost:8080/realm"
node scripts/release.mjs --check
node scripts/release.mjs
```

The wrapper runs a noninteractive, locked release build with `--no-sign`.
No release signing or notarization is requested; macOS binaries may have the
toolchain's ad-hoc signature, which is not a verified Developer ID signature.
`CARGO_BUILD_TARGET` must be unset. `CARGO_TARGET_DIR` is set to
`frontend/src-tauri/target` so output verification is predictable.

Successful output is under
`artifacts/everymusic-<version>-<platform>-<architecture>/`, containing installers,
`SHA256SUMS`, and `build-info.json` with the version, embedded API URL, host,
signing status, sizes, and hashes. `artifacts/` is ignored by Git.

The wrapper refuses to overwrite an existing output directory. Move an earlier
build to your archive before rerunning. A failed build does not report success
from old installers; staging files owned by the wrapper are cleaned up.

## Verify and install

In the output directory on macOS/Linux:

```bash
shasum -a 256 -c SHA256SUMS
```

On Windows, use `Get-FileHash -Algorithm SHA256` for the downloaded installer
and compare it to `SHA256SUMS`. A checksum verifies bytes, not publisher identity;
obtain the checksum and package from a trusted workflow run.

Smoke-test the installer on the target OS: launch, reach the configured API,
sign in with a synthetic account, edit a profile, publish/save/remove a call,
refresh the session, sign out, and recover from API unavailability. Also perform
the [accessibility checks](../ACCESSIBILITY.md). Unit/build success alone does not
verify installation or screen-reader behavior.

For a trusted, verified macOS development download that macOS blocks because its
developer cannot be verified, follow [Apple's current per-app guidance](https://support.apple.com/en-us/102445):
try opening it, then use **System Settings > Privacy & Security > Open Anyway**
only if available and appropriate. Never disable Gatekeeper/antivirus globally,
override malware warnings, or bypass managed-device policy.

## Obtain CI bundles

The [Every.music CI workflow](https://github.com/mbianchidev/every-music/actions/workflows/ci.yml)
runs desktop packaging on manual dispatch or `v*` tags, not ordinary pull requests.
A maintainer may manually select the intended branch and supply `api_base_url`;
otherwise the `DESKTOP_API_BASE_URL` repository variable is required.
Tag publication remains a separate maintainer decision.

After a successful run, open its **Artifacts** section and download the matching
`everymusic-desktop-<OS>-<architecture>-<commit>` archive. The archive contains the
wrapper's installers, checksums, and build information. Artifacts are retained for
14 days and GitHub may require sign-in to download. A failed/skipped job provides
no usable package.

Pull requests still run backend/frontend, integration, container, and Tauri checks.
The release-wrapper tests run with the frontend checks:

```bash
node --test scripts/test/release.test.mjs
```

Actual publication, code signing/notarization, store identities, and long-term
release hosting are separate steps; no signing credentials are committed or
configured by this process.
