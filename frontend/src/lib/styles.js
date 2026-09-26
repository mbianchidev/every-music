const styles = `
:root {
  color-scheme: dark;
  --ink: #090a0d;
  --surface: #17191f;
  --surface-raised: #22252d;
  --paper: #f7f7f2;
  --muted: #b9bec9;
  --pink: #ff4f8b;
  --cyan: #53e6ef;
  --lime: #c9f85a;
  --danger: #ff91ad;
  --border: 3px;
  --shadow: 7px 7px 0 #000;
}

* { box-sizing: border-box; }
html { min-height: 100%; background: var(--ink); scroll-behavior: smooth; }
body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 15% -10%, rgba(255, 79, 139, 0.22), transparent 30rem),
    radial-gradient(circle at 90% 10%, rgba(83, 230, 239, 0.14), transparent 28rem),
    var(--ink);
  color: var(--paper);
  font-family: "Avenir Next", "Segoe UI", system-ui, sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
button, input, textarea { font: inherit; }
button { color: inherit; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes rise { from { opacity: 0; transform: translateY(12px); } }

.skip-link {
  position: fixed;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 2000;
  padding: 0.75rem 1rem;
  transform: translateY(-180%);
  background: var(--paper);
  color: var(--ink);
  font-weight: 800;
}
.skip-link:focus { transform: translateY(0); }

:focus-visible {
  outline: 3px solid var(--cyan);
  outline-offset: 4px;
}

.container,
.container-narrow {
  width: min(100%, 1200px);
  min-height: 100vh;
  margin: 0 auto;
  padding: calc(1.5rem + env(safe-area-inset-top, 0px))
           calc(1.5rem + env(safe-area-inset-right, 0px))
           calc(7.5rem + env(safe-area-inset-bottom, 0px))
           calc(1.5rem + env(safe-area-inset-left, 0px));
}
.container-narrow { width: min(100%, 640px); }
.center-content { display: grid; place-items: center; }
.boot-screen { min-height: 100vh; display: grid; place-items: center; }
.brand-mark {
  margin: 0;
  color: var(--paper);
  font-size: clamp(2.5rem, 10vw, 7rem);
  font-weight: 900;
  letter-spacing: -0.08em;
}

.page-header {
  margin-bottom: 2rem;
  padding: 2rem 0 1.5rem;
  border-bottom: var(--border) solid var(--paper);
}
.eyebrow {
  margin: 0 0 0.5rem;
  color: var(--lime);
  font-size: 0.78rem;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.heading-xl,
.heading-lg,
.heading-md {
  margin: 0 0 1rem;
  font-weight: 900;
  letter-spacing: -0.045em;
  line-height: 0.96;
}
.heading-xl { font-size: clamp(3rem, 9vw, 6.5rem); }
.heading-lg { font-size: clamp(2.1rem, 6vw, 4.2rem); }
.heading-md { color: var(--cyan); font-size: clamp(1.35rem, 3vw, 2.25rem); }
.body-muted { color: var(--muted); margin: 0 0 1.5rem; }

.btn {
  min-height: 48px;
  padding: 0.9rem 1.35rem;
  border: var(--border) solid #000;
  border-radius: 0;
  box-shadow: var(--shadow);
  cursor: pointer;
  font-weight: 900;
  letter-spacing: 0.035em;
  text-transform: uppercase;
  touch-action: manipulation;
  transition: transform 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
}
.btn:hover:not(:disabled) { transform: translate(3px, 3px); box-shadow: 4px 4px 0 #000; }
.btn:active:not(:disabled) { transform: translate(7px, 7px); box-shadow: none; }
.btn:disabled { cursor: not-allowed; opacity: 0.55; }
.btn-primary { background: var(--pink); color: #18030b; }
.btn-secondary { background: var(--cyan); color: #031416; }
.btn-tertiary { background: var(--lime); color: #111500; }
.btn-ghost { border-color: var(--paper); background: transparent; color: var(--paper); box-shadow: 7px 7px 0 rgba(247, 247, 242, 0.3); }

.field { display: grid; gap: 0.5rem; }
.field-label { font-weight: 800; }
.field-hint,
.field-error { margin: 0; font-size: 0.9rem; }
.field-hint { color: var(--muted); }
.field-error { color: var(--danger); font-weight: 700; }
.input {
  width: 100%;
  min-height: 48px;
  padding: 0.9rem 1rem;
  border: var(--border) solid var(--paper);
  border-radius: 0;
  background: var(--surface);
  color: var(--paper);
  appearance: none;
}
.input:focus { border-color: var(--cyan); box-shadow: 0 0 0 3px rgba(83, 230, 239, 0.24); }
.input::placeholder { color: #8f95a1; }
.input[aria-invalid="true"] { border-color: var(--danger); }

.form-stack { display: grid; gap: 1.25rem; }
.button-row { display: flex; flex-wrap: wrap; gap: 1rem; }
.button-row > * { flex: 1 1 12rem; }
.text-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--cyan);
  cursor: pointer;
  font-weight: 800;
  text-decoration: underline;
}

.card {
  padding: clamp(1.25rem, 3vw, 2rem);
  border: var(--border) solid var(--paper);
  background: linear-gradient(145deg, var(--surface-raised), var(--surface));
  box-shadow: var(--shadow);
  animation: rise 220ms ease both;
}
.card-highlight { border-color: var(--pink); }
.card-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.announcement-card { display: flex; min-height: 100%; flex-direction: column; }
.announcement-description {
  display: -webkit-box;
  margin: 0 0 1rem;
  overflow: hidden;
  color: var(--muted);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}
.announcement-meta { margin: auto 0 1.25rem; color: var(--muted); font-size: 0.9rem; }
.tag-list { margin-bottom: 1rem; }
.tag {
  display: inline-block;
  margin: 0 0.45rem 0.45rem 0;
  padding: 0.25rem 0.7rem;
  border: 2px solid #000;
  background: var(--cyan);
  color: #031416;
  font-size: 0.82rem;
  font-weight: 800;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr));
  gap: 1.5rem;
}

.nav {
  position: fixed;
  z-index: 1000;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.35rem;
  padding: 0.6rem max(0.6rem, env(safe-area-inset-right, 0px))
           calc(0.6rem + env(safe-area-inset-bottom, 0px))
           max(0.6rem, env(safe-area-inset-left, 0px));
  border-top: var(--border) solid var(--paper);
  background: rgba(23, 25, 31, 0.96);
  backdrop-filter: blur(18px);
}
.nav-item {
  min-height: 50px;
  border: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 800;
}
.nav-item-active { border-color: var(--paper); background: var(--pink); color: #18030b; }
.nav-icon { display: block; font-size: 1.25rem; line-height: 1; }

.error,
.success,
.status-message {
  margin-bottom: 1rem;
  padding: 1rem;
  border: 2px solid currentColor;
  font-weight: 700;
}
.error { background: rgba(255, 79, 139, 0.13); color: var(--danger); }
.success { background: rgba(201, 248, 90, 0.1); color: var(--lime); }
.status-message { color: var(--cyan); }
.loading-state { display: grid; min-height: 14rem; place-items: center; }
.spinner {
  width: 56px;
  height: 56px;
  border: 5px solid var(--surface-raised);
  border-top-color: var(--pink);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (min-width: 840px) {
  .container, .container-narrow { padding-top: 2.5rem; }
  .nav {
    top: 50%;
    right: 1rem;
    bottom: auto;
    left: auto;
    width: 88px;
    grid-template-columns: 1fr;
    transform: translateY(-50%);
    border: var(--border) solid var(--paper);
  }
}

@media (max-width: 520px) {
  .container, .container-narrow { padding-right: 1rem; padding-left: 1rem; }
  .card { box-shadow: 5px 5px 0 #000; }
  .nav-item { font-size: 0.64rem; }
  .button-row { flex-direction: column; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;

export default styles;
