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
  --accent-cyan: #53e6ef;
  --accent-lime: #c9f85a;
  --focus: #53e6ef;
  --placeholder: #a9aeb9;
  --nav-background: rgba(23, 25, 31, 0.96);
  --border: 3px;
  --shadow: 7px 7px 0 #000;
}

[data-theme="light"] {
  color-scheme: light;
  --ink: #f6f5f0;
  --surface: #fffef9;
  --surface-raised: #e8ebee;
  --paper: #17191f;
  --muted: #454b58;
  --danger: #9d123a;
  --accent-cyan: #005b64;
  --accent-lime: #3e5b00;
  --focus: #005b64;
  --placeholder: #595e69;
  --nav-background: rgba(255, 254, 249, 0.97);
}

* { box-sizing: border-box; }
html { min-height: 100%; background: var(--ink); scroll-behavior: smooth; scroll-padding-block-end: 6rem; }
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
button, input, textarea, select { font: inherit; }
button { color: inherit; }
a { color: var(--accent-cyan); }
fieldset { min-width: 0; margin: 0; padding: 1rem; border: 2px solid var(--muted); }
legend { padding: 0 0.4rem; font-weight: 800; }
select { max-width: 100%; }
input[type="checkbox"] { width: 22px; height: 22px; flex-shrink: 0; accent-color: var(--accent-cyan); }

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
  outline: 3px solid var(--focus);
  outline-offset: 4px;
  scroll-margin-block: 6rem;
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
  color: var(--accent-lime);
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
  overflow-wrap: anywhere;
}
.heading-xl { font-size: clamp(3rem, 9vw, 6.5rem); }
.heading-lg { font-size: clamp(2.1rem, 6vw, 4.2rem); }
.heading-md { color: var(--accent-cyan); font-size: clamp(1.35rem, 3vw, 2.25rem); }
.body-muted { color: var(--muted); margin: 0 0 1.5rem; }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  text-decoration: none;
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
.input:focus { border-color: var(--focus); box-shadow: 0 0 0 3px rgba(83, 230, 239, 0.24); }
.input::placeholder { color: var(--placeholder); opacity: 1; }
.input[aria-invalid="true"] { border-color: var(--danger); }

.form-stack { display: grid; gap: 1.25rem; }
.button-row { display: flex; flex-wrap: wrap; gap: 1rem; }
.button-row > * { flex: 1 1 12rem; }
.text-link {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--accent-cyan);
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
  background: var(--nav-background);
  backdrop-filter: blur(18px);
}
.nav-item {
  display: grid;
  align-content: center;
  text-align: center;
  color: var(--paper);
  text-decoration: none;
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
.success { background: rgba(201, 248, 90, 0.1); color: var(--accent-lime); }
.status-message { color: var(--accent-cyan); }
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

.app-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.7rem 1.25rem;
  width: min(100%, 1200px);
  margin: auto;
  padding: 1rem 1.5rem 0;
}
.brand-link { color: var(--paper); font-size: 1.25rem; font-weight: 900; text-decoration: none; }
.community-nav { display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; flex: 1 1 26rem; }
.community-nav a { display: inline-flex; min-height: 44px; align-items: center; font-weight: 700; }
.theme-control { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; }
.theme-control select { min-height: 44px; padding: 0.3rem; border: 2px solid var(--muted); color: var(--paper); background: var(--surface); }
.connection-status { flex-basis: 100%; margin: 0; color: var(--muted); font-size: 0.85rem; }
.connection-status:empty { display: none; }
.filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 170px), 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.filters .search-field { grid-column: 1 / -1; }
.discovery-form { margin-bottom: 1.5rem; }
.filter-details .filters { padding: 1rem; margin-bottom: 0; }
.pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 1rem; margin: 2rem 0; }
.selection-panel { border: 2px solid var(--muted); }
.selection-panel summary { cursor: pointer; min-height: 48px; padding: 0.75rem; font-weight: 800; }
.selection-panel fieldset { border: 0; }
.choice-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 0.4rem 1rem; }
.checkbox-label { display: flex; align-items: center; gap: 0.7rem; min-height: 44px; }
.experience-row { display: flex; flex-wrap: wrap; gap: 1rem; }
.experience-row > .field { flex: 1 1 12rem; }
.image-input { display: grid; gap: 1rem; }
.image-preview { display: grid; justify-items: start; gap: 0.75rem; }
.image-preview img { width: min(100%, 240px); height: 160px; object-fit: contain; border: 2px solid var(--muted); }
.content-image { display: block; width: 100%; max-height: 420px; height: auto; object-fit: cover; margin-bottom: 1rem; border: 2px solid var(--muted); }
.profile-image { width: 160px; height: 160px; object-fit: cover; margin-bottom: 1rem; border: 3px solid var(--paper); }
.detail-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-section { margin: 2rem 0; }
.stack { display: grid; gap: 1.25rem; }
.section-heading { margin-top: 3rem; }
.compact-actions { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0; }
.project-list { display: grid; gap: 1.25rem; }
.collaborator-row { display: flex; flex-wrap: wrap; align-items: end; gap: 0.75rem; padding: 0.75rem 0; }
.collaborator-row .field { flex: 1 1 14rem; }
.message-layout { display: grid; gap: 1.5rem; grid-template-columns: minmax(0, 1fr); align-items: start; }
.conversation-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.conversation-link { display: block; padding: 1rem; border: 2px solid var(--muted); color: var(--paper); text-decoration: none; overflow-wrap: anywhere; }
.conversation-link[aria-current="page"] { border-color: var(--pink); border-width: 3px; }
.conversation-link strong, .conversation-link small { display: block; }
.message-log { display: flex; flex-direction: column; gap: 0.9rem; max-height: 55vh; overflow-y: auto; padding: 0.5rem; }
.message-bubble { align-self: flex-start; max-width: 90%; padding: 0.8rem; border: 2px solid var(--muted); background: var(--surface); overflow-wrap: anywhere; }
.message-own { align-self: flex-end; border-color: var(--accent-cyan); }
.message-bubble p { margin: 0 0 0.5rem; white-space: pre-wrap; }
.message-bubble small { display: block; color: var(--muted); }
.message-composer { margin-top: 1.5rem; }
.notification-list { list-style: none; margin: 1.5rem 0; padding: 0; display: grid; gap: 1rem; }
.notification-unread { border-color: var(--accent-cyan); }
.notification-list time { display: block; color: var(--muted); }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin: 1.5rem 0; }
.metric-grid dt { color: var(--muted); }
.metric-grid dd { margin: 0; font-size: 2rem; font-weight: 900; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; text-align: left; }
caption { text-align: left; padding: 1rem 0; font-weight: 800; }
th, td { padding: 0.8rem; border-bottom: 1px solid var(--muted); }
.chart { display: grid; gap: 0.6rem; margin: 1.5rem 0; }
.chart-row { display: grid; grid-template-columns: 7rem minmax(0, 1fr) 3rem; gap: 0.75rem; align-items: center; }
.chart-bar { height: 1rem; min-width: 2px; background: var(--accent-cyan); }
.google-signin { margin: 1.5rem 0; min-height: 44px; }
.card h2 a { color: inherit; }
.card, .card p, .card h2, .card h3 { overflow-wrap: anywhere; }

@media (min-width: 840px) {
  .container, .container-narrow { padding-top: 2.5rem; padding-right: 7.5rem; }
  .app-tools { padding-right: 7.5rem; }
  .message-layout { grid-template-columns: minmax(200px, 0.8fr) minmax(0, 2fr); }
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
  .button-row > * { flex-basis: auto; }
  .app-tools { padding-right: 1rem; padding-left: 1rem; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
`;

export default styles;
