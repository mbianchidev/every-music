# Accessibility

Every.music aims for WCAG 2.2 Level AA in its web interface. This is a contribution
target, not a certification or a claim that every screen has passed an audit.
The React UI is shared with Tauri desktop and mobile clients, so accessibility
must also work with each platform's WebView, keyboard, and assistive technology.

## Contribution guidelines

- Prefer semantic HTML, logical headings, and meaningful accessible names.
- Label every field and associate instructions and validation messages with it.
- Support keyboard-only operation, visible focus, and predictable focus movement.
  Preserve focus on errors and route changes; never trap users in a screen.
- Announce loading, success, and failure states without unnecessarily interrupting
  screen readers. Do not convey state through color alone.
- Meet AA contrast targets, support browser zoom and narrow-screen reflow, and
  keep controls usable with touch. Respect reduced-motion preferences.
- Give meaningful images descriptive alt text. Label synthetic screenshot data.
  Supply captions/transcripts or an equivalent text walkthrough for demos.
- Test native builds with their platform accessibility APIs and screen readers,
  not just a desktop browser.

## Verification

Run the [existing tests and build](docs/development.md#verification). They cover
request/session behavior, not full accessibility compliance. No automated
accessibility-audit tool is currently configured.

Manually exercise sign-in, registration, password recovery, profile editing,
announcement creation, feed navigation, and saving/removing announcements:

1. Use Tab/Shift+Tab, Enter, Space, and browser back navigation without a mouse.
2. Check labels, heading order, focused elements, and status/error announcements
   with VoiceOver on macOS/iOS, NVDA or Narrator on Windows, and TalkBack on Android
   as applicable. Linux native builds also need an Orca check.
3. Verify 200% zoom, 320 CSS-pixel reflow, visible focus, reduced motion, and
   contrast in success, failure, disabled, and selected states.
4. Check touch targets and on-screen-keyboard behavior on physical mobile devices.

## Known limitations and reporting

There is no completed independent WCAG audit or verified cross-platform
screen-reader test matrix. Mobile and native accessibility remain platform
release checks; browser layout checks alone do not establish native support.

Report barriers through the existing
[bug report template](https://github.com/mbianchidev/every-music/issues/new?template=bug_report.md),
including the task, platform/browser, assistive technology and version, steps,
and expected behavior. Use synthetic examples and sanitized screenshots.
Use [SECURITY.md](SECURITY.md) instead if a report exposes a vulnerability.
