# Contributing to Every.music

Bug reports, documentation improvements, accessibility fixes, tests, and focused
features are welcome. Read the [Code of Conduct](CODE_OF_CONDUCT.md) and search
[existing issues](https://github.com/mbianchidev/every-music/issues) first.

Use the [bug report](https://github.com/mbianchidev/every-music/issues/new?template=bug_report.md)
or [feature request](https://github.com/mbianchidev/every-music/issues/new?template=feature_request.md)
template. Describe expected and actual behavior, reproduction steps, relevant
versions, and sanitized logs. Discuss substantial changes before implementation.
Do not include real account data, credentials, or private screenshots.

Report vulnerabilities privately through [SECURITY.md](SECURITY.md), not an issue.
Report conduct concerns using the private contact in the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development

Coding agents must read [AGENTS.md](AGENTS.md) before editing. Everyone should
start with the [documentation index](docs/README.md) and
[development guide](docs/development.md), which cover:

- Node.js 22.12+, npm, PostgreSQL 16, and optional Rust/platform SDK requirements.
- Locked dependency installation, an isolated database, and API/client startup.
- Unit tests, production builds, dependency audits, and integration smoke tests.
- Database migrations, error handling, and transaction conventions.

Use synthetic fixtures only. Follow [ACCESSIBILITY.md](ACCESSIBILITY.md) for UI
changes and the [release guide](docs/releases.md) for native packaging. Never
test migrations or cleanup commands against a production database.

## Pull requests

Work on a separate branch and keep the change focused. Include tests for changed
behavior and update the relevant docs and configuration examples. Explain the
problem, the solution, any compatibility/migration impact, and checks performed.
State checks or platforms you could not verify.

Run the relevant [quality gates](docs/development.md#verification) before
requesting review. Respond to feedback and keep CI green. Do not include
generated build output, local secrets, or unrelated formatting changes.

There is no separate formatter/linter command configured: follow existing
formatting and run the package checks. Contributors remain responsible for
all work, including AI-assisted contributions, as described in the
[AI policy](README.md#ai-policy).

The application is licensed under [Apache License 2.0](LICENSE). Retain third-party
notices, including those for the vendored GLib dependency and the Code of Conduct.
