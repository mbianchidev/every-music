const styles = `
:root {
  color-scheme: light;
  --ink: #f6f7fb;
  --surface: #ffffff;
  --surface-raised: #eef0f6;
  --paper: #202533;
  --muted: #60687b;
  --line: #e0e3ec;
  --control-border: #7e8797;
  --brand: #6554c0;
  --brand-ink: #5542ae;
  --brand-soft: #efecfb;
  --brand-contrast: #ffffff;
  --danger: #ac303f;
  --danger-soft: #fff0f2;
  --positive: #226b50;
  --positive-soft: #eaf5ee;
  --focus: #6554c0;
  --placeholder: #697184;
  --shadow: 0 1px 3px rgba(25, 30, 48, 0.04);
}
[data-theme="dark"] {
  color-scheme: dark;
  --ink: #11131a;
  --surface: #191c26;
  --surface-raised: #232734;
  --paper: #edf0f7;
  --muted: #adb5c7;
  --line: #323747;
  --control-border: #737d92;
  --brand: #bcaff9;
  --brand-ink: #d3c8ff;
  --brand-soft: #302846;
  --brand-contrast: #211b36;
  --danger: #ffabb7;
  --danger-soft: #38232d;
  --positive: #9cdbbc;
  --positive-soft: #20352f;
  --focus: #c9bcff;
  --placeholder: #a4adc1;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
* { box-sizing: border-box; }
html { min-height: 100%; background: var(--ink); scroll-padding-block: 96px 104px; }
body {
  min-width: 320px;
  min-height: 100vh;
  margin: 0;
  background: var(--ink);
  color: var(--paper);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
button, input, textarea, select { font: inherit; }
button { color: inherit; }
button, a, input, select, textarea, summary { -webkit-tap-highlight-color: transparent; }
button, a { touch-action: manipulation; }
a { color: var(--brand-ink); text-underline-offset: 3px; }
a:hover { text-decoration-thickness: 2px; }
p { margin: 0 0 12px; }
h2, h3 { margin-top: 0; line-height: 1.35; }
h3 { font-size: 16px; }
fieldset { min-width: 0; margin: 0; padding: 18px; border: 1px solid var(--control-border); border-radius: 10px; }
legend { padding: 0 6px; font-size: 14px; font-weight: 650; }
select { max-width: 100%; }
input[type="checkbox"] { width: 18px; height: 18px; margin: 0; flex-shrink: 0; accent-color: var(--brand-ink); }
textarea { min-height: 100px; resize: vertical; }
.icon { display: inline-block; flex-shrink: 0; vertical-align: middle; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; scroll-margin-block: 96px; }
#main-content { min-width: 0; min-height: calc(100dvh - 72px); }
#main-content:focus-visible { outline: none; }
#main-content:focus-visible h1 { width: fit-content; outline: 2px solid var(--focus); outline-offset: 6px; border-radius: 2px; }
.skip-link { position: fixed; top: 12px; left: 12px; z-index: 2000; padding: 12px 18px; transform: translateY(-180%); background: var(--paper); color: var(--ink); border-radius: 8px; font-weight: 650; }
.skip-link:focus { transform: translateY(0); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.container { width: min(100%, 1264px); margin: 0 auto; padding: 28px 32px 48px; }
.container-narrow { width: min(100%, 492px); margin: 0 auto; padding: 40px 24px; }
.center-content { display: grid; align-content: center; min-height: calc(100dvh - 96px); }
.boot-screen { display: grid; place-items: center; min-height: 65vh; }
.brand-mark { font-size: 28px; font-weight: 750; letter-spacing: -1px; }
.page-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
.page-header > div { min-width: 0; }
.page-header .body-muted { margin: 8px 0 0; }
.page-header-actions { flex-shrink: 0; }
.eyebrow { margin: 0 0 6px; color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 0.025em; }
.heading-xl, .heading-lg, .heading-md { margin: 0 0 12px; color: var(--paper); font-weight: 700; line-height: 1.25; letter-spacing: -0.035em; overflow-wrap: anywhere; }
.heading-xl { font-size: 36px; }
.heading-lg { margin-bottom: 0; font-size: 30px; }
.heading-md { font-size: 20px; letter-spacing: -0.02em; }
.body-muted { color: var(--muted); }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 9px 16px; border: 1px solid transparent; border-radius: 8px; font-size: 14px; font-weight: 600; line-height: 1.5; text-align: center; text-decoration: none; cursor: pointer; transition: border-color 120ms ease; }
.btn:hover { text-decoration: none; }
.btn-primary { background: var(--brand); color: var(--brand-contrast); }
.btn-primary:hover:not(:disabled) { filter: brightness(0.94); }
.btn-secondary { background: var(--surface); color: var(--paper); border-color: var(--control-border); }
.btn-secondary:hover:not(:disabled), .btn-ghost:hover:not(:disabled) { background: var(--surface-raised); }
.btn-tertiary { background: var(--brand-soft); color: var(--brand-ink); }
.btn-ghost { background: transparent; color: var(--muted); }
.btn-danger { background: var(--surface); color: var(--danger); border-color: var(--control-border); }
.btn:disabled, .text-link:disabled { cursor: not-allowed; opacity: 0.6; }
.icon-button { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; padding: 8px; border: 1px solid var(--control-border); border-radius: 8px; background: var(--surface); color: var(--paper); cursor: pointer; }
.text-link { display: inline-flex; align-items: center; justify-content: center; min-height: 32px; border: 0; padding: 2px 0; background: transparent; color: var(--brand-ink); cursor: pointer; font-size: 14px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.field { display: grid; align-content: start; gap: 7px; min-width: 0; }
.field-label { font-size: 13px; font-weight: 600; }
.field-hint, .field-error { margin: 0; font-size: 13px; line-height: 1.5; }
.field-hint { color: var(--muted); }
.field-error { color: var(--danger); }
.input { width: 100%; min-width: 0; min-height: 44px; padding: 10px 12px; border: 1px solid var(--control-border); border-radius: 8px; background: var(--surface); color: var(--paper); font-size: 14px; line-height: 1.5; }
.input::placeholder { color: var(--placeholder); opacity: 1; }
.input[aria-invalid="true"] { border-color: var(--danger); }
.input:disabled { cursor: not-allowed; opacity: 0.65; }
input[type="file"] { width: 100%; max-width: 100%; font-size: 13px; }
input[type="file"]::file-selector-button { min-height: 40px; margin-right: 12px; padding: 7px 12px; border: 1px solid var(--control-border); border-radius: 7px; background: var(--surface); color: var(--paper); font: inherit; cursor: pointer; }
.form-stack { display: grid; gap: 20px; max-width: 760px; }
.form-stack > .btn { justify-self: start; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.button-row { display: flex; flex-wrap: wrap; gap: 12px; }
.center-content .form-stack > .btn { width: 100%; }
.center-content .form-stack > .text-link { justify-self: center; }
.center-content .page-header { margin-bottom: 28px; }
.center-content .card { padding: 28px; }
.card { min-width: 0; padding: 22px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); box-shadow: var(--shadow); overflow-wrap: anywhere; }
.card-highlight { border-color: var(--line); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 16px; align-items: stretch; }
.announcement-card, .musician-card { display: flex; flex-direction: column; padding: 20px; }
.announcement-card .heading-md, .musician-card .heading-md { margin-bottom: 10px; font-size: 17px; line-height: 1.4; letter-spacing: -0.018em; }
.card h2 a { color: inherit; text-decoration: none; }
.card h2 a:hover { color: var(--brand-ink); text-decoration: underline; }
.announcement-description { display: -webkit-box; margin: 0 0 14px; overflow: hidden; color: var(--muted); font-size: 14px; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.announcement-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; margin: auto 0 14px; padding-top: 8px; color: var(--muted); font-size: 12px; }
.announcement-meta > span { display: inline-flex; align-items: center; gap: 5px; }
.card-author { display: flex; align-items: center; gap: 9px; margin-bottom: 12px; color: var(--muted); font-size: 12px; }
.card-author a { color: var(--muted); text-decoration: none; }
.card-author a:hover { text-decoration: underline; }
.card-author .avatar { width: 30px; height: 30px; font-size: 10px; }
.card-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--line); }
.card-footer time { color: var(--muted); font-size: 12px; }
.card-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.card-actions .btn { min-height: 36px; padding: 6px 10px; font-size: 12px; }
.card-actions .field-error { flex-basis: 100%; }
.tag-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; }
.tag { display: inline-flex; align-items: center; min-height: 25px; padding: 3px 8px; border-radius: 5px; background: var(--brand-soft); color: var(--brand-ink); font-size: 11px; font-weight: 600; line-height: 1.5; }
.tag-muted { background: var(--surface-raised); color: var(--muted); }
.card-taxonomy { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.card-taxonomy:empty { display: none; }
.card-taxonomy > .tag-list { max-width: 100%; margin: 0; }
.call-card-heading { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.call-card-heading .heading-md { min-width: 0; margin-bottom: 0; }
.call-thumbnail { width: 72px; height: 72px; flex-shrink: 0; border-radius: 8px; object-fit: cover; }
.avatar { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex-shrink: 0; overflow: hidden; border-radius: 50%; background: var(--brand-soft); color: var(--brand-ink); font-size: 12px; font-weight: 700; }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.avatar-large { width: 76px; height: 76px; border-radius: 18px; font-size: 24px; }
.musician-summary { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.musician-summary .avatar { width: 46px; height: 46px; font-size: 15px; }
.musician-summary .heading-md { margin-bottom: 3px; }
.musician-summary p { margin: 0; color: var(--muted); font-size: 12px; }
.musician-card .card-footer { justify-content: flex-end; }
.sidebar { position: fixed; z-index: 40; inset: 0 auto 0 0; display: flex; flex-direction: column; width: 232px; padding: 27px 18px 20px; border-right: 1px solid var(--line); background: var(--surface); overflow-y: auto; }
.brand-link { display: inline-flex; align-items: center; gap: 9px; color: var(--paper); font-size: 21px; font-weight: 750; letter-spacing: -0.7px; text-decoration: none; white-space: nowrap; }
.brand-link:hover { text-decoration: none; }
.brand-dot { color: var(--brand-ink); }
.brand-emblem { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 34px; border-radius: 9px; background: var(--brand); color: var(--brand-contrast); }
.sidebar-caption { margin: 9px 0 24px 2px; color: var(--muted); font-size: 12px; }
.nav-publish { width: 100%; margin-bottom: 26px; }
.nav-group { display: grid; gap: 4px; margin-bottom: 24px; }
.nav-group-label { margin: 0 12px 6px; color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: 0.025em; }
.nav-item { position: relative; display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 44px; padding: 10px 12px; border: 0; border-radius: 8px; background: transparent; color: var(--muted); font-size: 14px; font-weight: 500; text-decoration: none; cursor: pointer; }
.nav-item:hover { background: var(--surface-raised); color: var(--paper); text-decoration: none; }
.nav-item-active { background: var(--brand-soft); color: var(--brand-ink); font-weight: 650; }
.nav-item-active::before { position: absolute; inset: 13px auto 13px 0; width: 3px; border-radius: 0 3px 3px 0; background: var(--brand-ink); content: ""; }
.nav-badge { margin-left: auto; padding: 1px 6px; border-radius: 5px; background: var(--brand-soft); color: var(--brand-ink); font-size: 11px; font-weight: 700; }
.sidebar-footer { display: flex; align-items: center; gap: 8px; margin-top: auto; padding: 18px 10px 0; border-top: 1px solid var(--line); color: var(--muted); font-size: 11px; }
.mobile-nav { display: none; }
.nav-dialog { width: min(420px, calc(100% - 24px)); max-height: calc(100dvh - 140px); padding: 20px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); color: var(--paper); box-shadow: 0 20px 70px #0005; overflow-y: auto; }
.nav-dialog::backdrop { background: #070a1280; }
.nav-dialog :focus-visible { scroll-margin-block: 16px; }
.nav-dialog .nav-group:last-child { margin-bottom: 0; }
.dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.dialog-heading h2 { margin: 0; font-size: 18px; }
body:has(.nav-dialog[open]), body:has(.modal-dialog[open]) { overflow: hidden; }
.app-tools { position: sticky; z-index: 30; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 72px; padding: 12px 32px; border-bottom: 1px solid var(--line); background: var(--surface); }
.is-authenticated #main-content, .is-authenticated .app-tools, .is-authenticated .global-notices { margin-left: 232px; }
.is-authenticated .header-brand { display: none; }
.header-context { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 12px; }
.header-context > span:last-child { color: var(--paper); }
.header-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 16px; margin-left: auto; }
.header-profile { display: inline-flex; border-radius: 50%; }
.is-guest .app-tools { border-bottom-color: transparent; background: var(--ink); }
.theme-control { display: flex; align-items: center; gap: 5px; color: var(--muted); }
.theme-control select { min-height: 36px; max-width: 100px; padding: 5px 4px; border: 0; border-radius: 6px; background: transparent; color: var(--paper); font-size: 12px; cursor: pointer; }
.theme-control select option { background: var(--surface); }
.connection-status { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--muted); font-size: 11px; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.is-live .status-dot { background: var(--positive); }
.global-notices:empty { display: none; }
.global-notices:not(:empty) { padding: 12px 32px 0; }
.global-notices .status-message { margin-bottom: 0; }
.discovery-tabs { display: flex; gap: 24px; margin: 0 0 20px; border-bottom: 1px solid var(--line); }
.discovery-tabs a { display: inline-flex; align-items: center; gap: 8px; min-height: 43px; padding: 0 1px 12px; border-bottom: 2px solid transparent; color: var(--muted); font-size: 14px; font-weight: 600; text-decoration: none; }
.discovery-tabs a[aria-current="page"] { border-bottom-color: var(--brand-ink); color: var(--brand-ink); }
.discovery-form { max-width: none; gap: 12px; margin-bottom: 20px; }
.search-field { position: relative; }
.search-field > .icon { position: absolute; top: 13px; left: 13px; color: var(--muted); pointer-events: none; }
.search-field .input { padding-left: 42px; }
.selection-panel { border: 1px solid var(--control-border); border-radius: 9px; background: var(--surface); }
.selection-panel summary { min-height: 44px; padding: 11px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
.selection-panel summary > .icon { margin: 0 6px; }
.selection-panel fieldset { border: 0; }
.filter-details { border-color: var(--line); background: transparent; }
.filter-details summary { padding-left: 3px; color: var(--muted); }
.filter-details[open] summary { padding-bottom: 12px; }
.filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; gap: 14px; padding-bottom: 4px; }
.filters .btn { justify-self: start; }
.results-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 14px; color: var(--muted); font-size: 12px; }
.results-summary p { margin: 0; }
.pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px; margin: 28px 0 0; font-size: 13px; }
.pagination p { margin: 0; }
.choice-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 2px 12px; }
.checkbox-label { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; }
.experience-row { display: flex; flex-wrap: wrap; align-items: end; gap: 16px; }
.experience-row > .field { flex: 1 1 160px; }
.image-input { display: flex; align-items: start; flex-wrap: wrap; gap: 18px; padding: 18px; border: 1px dashed var(--control-border); border-radius: 10px; background: var(--surface); }
.image-input > .field { flex: 1 1 260px; }
.image-preview { display: grid; justify-items: start; gap: 8px; }
.image-preview img { width: 112px; height: 84px; border: 1px solid var(--line); border-radius: 8px; object-fit: cover; }
.content-image { display: block; width: 100%; max-height: 420px; height: auto; object-fit: cover; margin-bottom: 20px; border-radius: 8px; }
.profile-image { width: 88px; height: 88px; margin-bottom: 14px; border: 1px solid var(--line); border-radius: 18px; object-fit: cover; }
.profile-summary { display: flex; align-items: center; gap: 20px; margin-bottom: 24px; }
.profile-summary .profile-image { margin-bottom: 0; }
.profile-summary .heading-md { margin-bottom: 4px; font-size: 24px; }
.profile-summary p { margin: 0; }
.profile-instruments { display: grid; gap: 8px; padding-left: 20px; }
.detail-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-section { margin: 28px 0; }
.detail-section:last-child { margin-bottom: 0; }
.detail-section > p { max-width: 74ch; }
.detail-section .heading-md { font-size: 18px; }
.detail-section > .card { max-width: 900px; }
.stack { display: grid; gap: 14px; }
.compact-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin: 18px 0 0; }
.project-list { display: grid; gap: 12px; margin: 16px 0; }
.project-list .card { padding: 18px; box-shadow: none; }
.project-list h3 { margin-bottom: 6px; }
.project-list p { color: var(--muted); font-size: 14px; }
.collaborator-row { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; padding: 12px 0; }
.collaborator-row .field { flex: 1 1 220px; }
.message-layout { display: grid; grid-template-columns: 276px minmax(0, 1fr); align-items: start; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); overflow: clip; }
.conversation-pane { min-width: 0; padding: 20px 14px; }
.conversation-pane .heading-md { padding: 0 6px; font-size: 16px; }
.conversation-pane > .text-link, .conversation-pane > .checkbox-label { margin-left: 6px; }
.thread-pane { min-width: 0; min-height: 560px; padding: 22px; border-left: 1px solid var(--line); }
.thread-pane .heading-md { font-size: 18px; }
.thread-pane > .compact-actions { margin-top: 0; margin-bottom: 12px; }
.conversation-list { display: grid; gap: 4px; list-style: none; margin: 12px 0 0; padding: 0; }
.conversation-link { display: grid; gap: 4px; padding: 12px; border-radius: 8px; color: var(--paper); text-decoration: none; overflow-wrap: anywhere; }
.conversation-link:hover { background: var(--surface-raised); text-decoration: none; }
.conversation-link[aria-current="page"] { background: var(--brand-soft); box-shadow: inset 3px 0 var(--brand-ink); }
.conversation-link strong { font-size: 13px; font-weight: 650; }
.conversation-link > span { display: -webkit-box; overflow: hidden; color: var(--muted); font-size: 12px; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.conversation-link small { color: var(--muted); font-size: 11px; }
.message-log { display: flex; flex-direction: column; gap: 12px; min-height: 220px; max-height: 48vh; overflow-y: auto; padding: 12px 4px; }
.message-bubble { align-self: flex-start; max-width: 85%; padding: 12px 14px; border-radius: 10px 10px 10px 3px; background: var(--surface-raised); overflow-wrap: anywhere; }
.message-own { align-self: flex-end; border-radius: 10px 10px 3px 10px; background: var(--brand-soft); }
.message-bubble p { margin: 0 0 6px; font-size: 14px; white-space: pre-wrap; }
.message-bubble small { display: block; color: var(--muted); font-size: 10px; }
.message-bubble .text-link { min-height: 26px; font-size: 11px; }
.message-composer { max-width: none; gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
.message-composer textarea { min-height: 88px; }
.message-composer > .btn { justify-self: end; }
.notification-list { list-style: none; margin: 20px 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); }
.notification-list .card { display: grid; gap: 6px; padding: 18px 20px; border: 0; border-bottom: 1px solid var(--line); border-radius: 0; background: transparent; box-shadow: none; }
.notification-list .card:first-child { border-radius: 12px 12px 0 0; }
.notification-list .card:last-child { border: 0; border-radius: 0 0 12px 12px; }
.notification-list .notification-unread { background: var(--brand-soft); }
.notification-list .eyebrow { margin: 0; font-size: 11px; }
.notification-list .heading-md { margin: 0; font-size: 15px; letter-spacing: 0; }
.notification-list time { color: var(--muted); font-size: 12px; }
.notification-list .text-link { justify-self: start; }
.metric-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 24px 0 28px; }
.metric-grid .card { padding: 18px; }
.metric-grid dt { color: var(--muted); font-size: 12px; }
.metric-grid dd { margin: 8px 0 0; font-size: 28px; font-weight: 700; line-height: 1.1; letter-spacing: -0.04em; }
.table-wrap { max-width: 100%; margin-top: 24px; overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
caption { padding: 16px; text-align: left; font-size: 14px; font-weight: 650; }
th, td { padding: 12px 16px; border-top: 1px solid var(--line); }
thead th { background: var(--surface-raised); color: var(--muted); font-size: 12px; font-weight: 600; }
tbody th { font-weight: 500; }
.chart { display: grid; gap: 10px; max-width: 880px; margin: 18px 0; }
.chart-row { display: grid; grid-template-columns: 88px minmax(0, 1fr) 32px; gap: 14px; align-items: center; color: var(--muted); font-size: 12px; }
.chart-bar { height: 10px; min-width: 2px; border-radius: 3px; background: var(--brand); }
.google-signin { margin: 24px 0 0; }
.google-signin:has(iframe), .google-signin:has(button) { padding-top: 24px; border-top: 1px solid var(--line); }
.error, .success, .status-message { margin: 0 0 18px; padding: 12px 15px; border: 1px solid currentColor; border-radius: 8px; font-size: 13px; }
.error { background: var(--danger-soft); color: var(--danger); }
.success { background: var(--positive-soft); color: var(--positive); }
.status-message { background: var(--brand-soft); color: var(--brand-ink); }
.loading-state { display: grid; justify-items: center; align-content: center; gap: 12px; min-height: 180px; color: var(--muted); font-size: 13px; }
.spinner { width: 26px; height: 26px; border: 3px solid var(--line); border-top-color: var(--brand-ink); border-radius: 50%; animation: spin 0.8s linear infinite; }
.empty-state { padding: 40px 24px; text-align: center; }
.empty-state .heading-md { font-size: 20px; }
.empty-state .body-muted { margin: 12px auto 20px; max-width: 48ch; font-size: 14px; }
.modal-dialog { width: min(580px, calc(100% - 32px)); max-height: calc(100dvh - 48px); padding: 24px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); color: var(--paper); box-shadow: 0 20px 70px #0005; overflow-y: auto; }
.modal-dialog::backdrop { background: #070a1280; }
.modal-dialog :focus-visible { scroll-margin-block: 16px; }
.modal-dialog .form-stack { gap: 16px; }
.encryption-panel { margin-bottom: 20px; }
.encryption-panel .heading-md { font-size: 16px; }
.encryption-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
.encryption-summary p { flex: 1 1 260px; margin: 0; }
.encryption-panel .form-stack { max-width: 680px; gap: 14px; }
.key-management { margin-top: 12px; }
.key-management summary { min-height: 36px; cursor: pointer; color: var(--brand-ink); font-size: 13px; font-weight: 600; }
.key-management .field { margin: 14px 0; max-width: 600px; }
.key-management > .text-link { margin-right: 20px; }
.fingerprint, .identifier { overflow-wrap: anywhere; word-break: break-word; }
.fingerprint-block { display: block; margin: 8px 0 18px; padding: 12px; border-radius: 8px; background: var(--surface-raised); color: var(--paper); font-size: 14px; }
.recovery-value { font-family: ui-monospace, monospace; }
.conversation-security { padding: 12px 0; border-top: 1px solid var(--line); }
.conversation-security > p { margin-bottom: 4px; }
.legacy-label { display: block; margin-bottom: 6px; color: var(--muted); font-size: 11px; }
.reported-excerpt { margin: 12px 0 20px; padding: 14px 16px; border-left: 3px solid var(--brand-ink); background: var(--surface-raised); white-space: pre-wrap; overflow-wrap: anywhere; }
.report-detail { max-width: 900px; }
.report-detail h3 { margin-top: 24px; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (min-width: 1250px) {
  .filters { grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .filters .btn { grid-column: 1 / -1; padding-left: 0; min-height: 28px; }
}
@media (max-width: 1023px) {
  .sidebar { display: none; }
  .is-authenticated #main-content, .is-authenticated .app-tools, .is-authenticated .global-notices { margin-left: 0; }
  .is-authenticated .header-brand { display: block; }
  .header-context { display: none; }
  .app-tools { min-height: 64px; padding: 12px 24px; }
  .container { padding: 24px 24px calc(104px + env(safe-area-inset-bottom, 0px)); }
  .is-authenticated .container-narrow { padding-bottom: calc(104px + env(safe-area-inset-bottom, 0px)); }
  .mobile-nav { position: fixed; z-index: 50; inset: auto 0 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; padding: 8px max(8px, env(safe-area-inset-right, 0px)) calc(8px + env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px)); border-top: 1px solid var(--line); background: var(--surface); }
  .mobile-nav .nav-item { flex-direction: column; justify-content: center; gap: 4px; min-height: 48px; padding: 5px 2px; font-size: 11px; }
  .mobile-nav .nav-item-active::before { inset: auto 40% 1px; width: auto; height: 2px; }
  .mobile-unread { position: absolute; top: 2px; right: 24%; width: 7px; height: 7px; border-radius: 50%; background: var(--brand-ink); }
  .nav-dialog { margin: auto auto calc(82px + env(safe-area-inset-bottom, 0px)); }
  .nav-dialog .nav-item { min-height: 44px; }
  .nav-dialog .nav-group { margin-bottom: 18px; gap: 2px; }
  .nav-dialog .nav-publish { margin-bottom: 18px; }
  .card-actions .btn { min-height: 44px; }
  .global-notices:not(:empty) { padding: 12px 24px 0; }
}
@media (max-width: 700px) {
  .input, .theme-control select { font-size: 16px; }
  .heading-lg { font-size: 27px; }
  .page-header { align-items: start; gap: 12px; margin-bottom: 20px; }
  .page-header .body-muted { font-size: 14px; }
  .page-header-actions .btn { padding: 9px 12px; }
  .form-grid { grid-template-columns: 1fr; }
  .message-layout { grid-template-columns: minmax(0, 1fr); }
  .thread-pane { min-height: 0; border-top: 1px solid var(--line); border-left: 0; }
  .conversation-pane { max-height: 300px; overflow-y: auto; }
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metric-grid .card:last-child { grid-column: 1 / -1; }
  .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .filters .btn { grid-column: 1 / -1; }
}
@media (max-width: 480px) {
  .app-tools { flex-wrap: wrap; gap: 8px; padding: 12px 16px; }
  .header-actions { gap: 8px; }
  .brand-link { gap: 7px; font-size: 18px; }
  .brand-emblem { width: 28px; height: 30px; border-radius: 7px; }
  .connection-status { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .container { padding: 22px 16px calc(104px + env(safe-area-inset-bottom, 0px)); }
  .container-narrow { padding: 32px 20px; }
  .global-notices:not(:empty) { padding: 12px 16px 0; }
  .page-header { flex-wrap: wrap; }
  .page-header-actions { display: none; }
  .card { padding: 18px; }
  .grid { gap: 14px; }
  .filters { gap: 12px; }
  .filter-details[open] .filters { padding-top: 4px; }
  .filter-details .input { padding-right: 7px; padding-left: 9px; }
  .discovery-tabs { margin-bottom: 16px; }
  .image-input { padding: 14px; }
  .thread-pane { padding: 18px 14px; }
  .message-bubble { max-width: 93%; }
  .notification-list .card { padding: 16px; }
  .profile-summary { gap: 14px; }
  .profile-summary .heading-md { font-size: 21px; }
  .table-wrap th, .table-wrap td { padding: 10px; }
}
@media (max-width: 360px) {
  .header-profile { display: none; }
  .theme-control { gap: 2px; }
  .theme-control select { max-width: 78px; }
  .filters { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
/* w0b-notifications */
.notification-preferences .form-stack { max-width: 900px; gap: 16px; }
.notification-preferences > .heading-md:focus { outline-offset: 4px; }
.notification-channel-notes { display: grid; gap: 6px; margin: 0; padding-left: 20px; color: var(--muted); font-size: 14px; }
.notification-group-heading { margin: 12px 0 4px; color: var(--paper); font-size: 16px; font-weight: 700; line-height: 1.4; }
.notification-kind { display: block; margin: 0; padding: 6px 0; border: 0; border-top: 1px solid var(--line); border-radius: 0; }
.notification-kind::after { content: ''; display: block; clear: both; }
.notification-kind > legend { float: left; width: 40%; margin: 0; padding: 12px 16px 0 0; font-size: 14px; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }
.notification-channels { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0 16px; }
.notification-channels .checkbox-label { line-height: 1.3; overflow-wrap: anywhere; }
.notification-kind-note { clear: both; margin: 2px 0 6px; font-size: 13px; }
.notification-list .notification-detail { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
@media (max-width: 640px) {
  .notification-kind > legend { float: none; width: auto; padding: 8px 0 0; }
  .notification-channels { gap: 0 10px; }
  .notification-channels .checkbox-label { gap: 8px; font-size: 13px; }
}
/* w4-applications */
.application-card { display: grid; gap: 12px; }
.application-card > p, .application-card .musician-summary { margin: 0; }
.application-summary { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.application-summary .heading-md { margin: 0; }
.application-status { margin-left: auto; font-size: 12px; }
.application-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; margin: 0; }
.application-label { margin: 0 0 6px; color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 0.025em; }
.application-details { display: grid; gap: 14px; }
.application-details .tag-list, .application-details .detail-text, .application-group .tag-list { margin: 0; }
.application-links { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
.application-links li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; min-width: 0; }
.application-controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); align-items: start; gap: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.application-note { display: grid; gap: 10px; }
.application-note .btn { justify-self: start; }
.application-card .compact-actions { margin-top: 0; }
.application-form .status-message { margin: 0; }
.application-fieldset { display: grid; gap: 10px; min-width: 0; margin: 0; padding: 0; border: 0; }
.application-fieldset legend { padding: 0; }
.application-fieldset > .btn { justify-self: start; }
.application-filters { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 18px; }
@media (max-width: 900px) {
  .application-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .application-controls { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 480px) {
  .application-filters { grid-template-columns: minmax(0, 1fr); }
  .application-status { margin-left: 0; }
}
/* w6-marketplace */
.marketplace-tabs { flex-wrap: wrap; gap: 0 20px; }
.marketplace-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: -4px 0 20px; }
.marketplace-toolbar .btn[aria-current="page"] { border-color: var(--brand-ink); color: var(--brand-ink); }
.marketplace-toolbar .btn-primary[aria-current="page"] { color: var(--brand-contrast); }
.marketplace-intro { max-width: 80ch; margin-bottom: 16px; font-size: 14px; }
.listing-card { display: flex; flex-direction: column; padding: 20px; }
.listing-card .heading-md { margin-bottom: 0; font-size: 17px; line-height: 1.4; letter-spacing: -0.018em; }
.listing-card-labels { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.tag-warning { background: var(--danger-soft); color: var(--danger); }
.listing-price { margin: 0 0 4px; color: var(--paper); font-size: 16px; font-weight: 700; }
.listing-price-large { margin-bottom: 12px; font-size: 24px; letter-spacing: -0.02em; }
.listing-category { margin: 0 0 10px; color: var(--muted); font-size: 13px; }
.listing-card-seller { color: var(--muted); font-size: 12px; }
.listing-layout { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; gap: 20px; }
.listing-detail .heading-md { margin-top: 24px; font-size: 18px; }
.listing-seller { margin: 0; }
.listing-manage { margin-top: 8px; }
.listing-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 96px), 1fr)); gap: 10px; margin: 0 0 20px; padding: 0; list-style: none; }
.listing-gallery li:first-child { grid-column: 1 / -1; }
.listing-gallery-image { display: block; width: 100%; height: auto; max-height: 440px; border: 1px solid var(--line); border-radius: 8px; object-fit: cover; }
.listing-gallery li:not(:first-child) .listing-gallery-image { aspect-ratio: 4 / 3; }
.listing-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr)); gap: 14px 20px; margin: 0 0 8px; }
.listing-facts dt { color: var(--muted); font-size: 12px; }
.listing-facts dd { margin: 2px 0 0; font-weight: 600; overflow-wrap: anywhere; }
.marketplace-safety .heading-md { font-size: 17px; }
.marketplace-safety ul { display: grid; gap: 8px; margin: 0; padding-left: 20px; font-size: 14px; }
.listing-photos { display: grid; gap: 10px; }
.listing-photo-list { display: flex; flex-wrap: wrap; gap: 16px; margin: 4px 0 0; padding: 0; list-style: none; }
.listing-photo-list li { display: grid; justify-items: start; gap: 6px; }
.listing-photo-list img { width: 112px; height: 84px; border: 1px solid var(--line); border-radius: 8px; object-fit: cover; }
.listing-photo-actions { display: grid; justify-items: start; }
.listing-description-input { min-height: 180px; }
.table-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; }
@media (max-width: 1023px) {
  .listing-layout { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 480px) {
  .marketplace-tabs a { min-height: 36px; padding-bottom: 8px; }
}
/* w2-account-trust */
.verified-badge { display: inline-flex; align-items: center; gap: 6px; margin-left: 6px; vertical-align: -2px; color: #1d64c8; font-size: 13px; font-weight: 650; letter-spacing: 0; }
[data-theme="dark"] .verified-badge { color: #8cc2ff; }
.verified-badge svg { display: block; flex-shrink: 0; }
.verified-badge .verified-seal { fill: currentColor; }
.verified-badge .verified-tick { stroke: var(--surface); }
.verified-badge-label { margin-left: 0; }
.account-trust > .card + .card, .account-trust > .card + section, .account-trust > section + section { margin-top: 16px; }
.account-trust-card { display: grid; gap: 12px; max-width: 900px; }
.account-trust-card > * { margin-bottom: 0; }
.account-trust-card h3 { margin: 0; font-size: 17px; }
.account-trust-card h4 { margin: 0; font-size: 15px; }
.account-trust-card h3:focus-visible, .account-trust-card h4:focus-visible, .two-step h2:focus-visible, .account-trust > h2:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; }
.account-trust-card .form-stack { max-width: 560px; }
.reauth-fields > .btn { justify-self: start; }
.method-choice { display: grid; gap: 2px; padding: 4px 0 8px; }
.method-choice .field-hint { padding-left: 28px; }
.qr-code { display: block; width: min(100%, 220px); height: auto; border: 1px solid var(--line); border-radius: 8px; }
.setup-key, .verification-code, .verification-code-inline, .recovery-codes { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.setup-key { letter-spacing: 0.06em; }
.recovery-codes { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; font-size: 15px; }
.recovery-codes li { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-raised); text-align: center; letter-spacing: 0.06em; }
.verification-code-block { display: grid; justify-items: start; gap: 8px; }
.verification-code { display: inline-block; padding: 8px 14px; border: 2px dashed var(--control-border); border-radius: 8px; font-size: 24px; font-weight: 700; letter-spacing: 0.08em; overflow-wrap: anywhere; }
.verification-photos { display: flex; flex-wrap: wrap; gap: 12px; }
.verification-photos img { width: min(100%, 240px); height: auto; border: 1px solid var(--line); border-radius: 8px; }
.verification-queue { display: grid; gap: 14px; margin: 16px 0; padding: 0; list-style: none; }
.danger-zone { border-color: var(--danger); }
.deletion-facts { display: grid; gap: 6px; margin: 0; padding-left: 20px; }
.two-step { display: grid; gap: 12px; }
.two-step > p { margin: 0; }
/* w1-profiles-ads */
.place-picker-control { position: relative; }
.place-options { position: absolute; z-index: 40; top: calc(100% + 4px); right: 0; left: 0; max-height: 288px; margin: 0; padding: 4px; overflow-y: auto; list-style: none; border: 1px solid var(--control-border); border-radius: 8px; background: var(--surface); box-shadow: 0 10px 28px rgba(15, 18, 30, 0.16); }
.place-options[hidden] { display: none; }
.place-options li { padding: 9px 10px; border-radius: 6px; color: var(--paper); cursor: pointer; }
.place-options li[aria-selected="true"], .place-options li:hover { background: var(--brand-soft); color: var(--brand-ink); }
.place-meta { display: block; color: var(--muted); font-size: 12px; }
.place-options li[aria-selected="true"] .place-meta { color: inherit; }
.place-picker .text-link { justify-self: start; }
.filter-location { display: flex; flex-direction: column; gap: 8px; grid-column: 1 / -1; }
.filter-location .btn { align-self: flex-start; }
.upgrade-notice { border-style: dashed; border-color: var(--control-border); }
.quota-notice { margin: 0 0 12px; color: var(--muted); font-size: 13px; }
.quota-full { color: var(--danger); font-weight: 600; }
.profile-facts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 14px 0 0; color: var(--muted); font-size: 13px; }
.tag-open { background: var(--positive-soft); color: var(--positive); }
.musician-summary .tag-open { margin-top: 4px; }
.contact-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px 20px; margin: 10px 0 0; }
.contact-list dt { color: var(--muted); font-size: 12px; font-weight: 600; }
.contact-list dd { margin: 0; overflow-wrap: anywhere; }
.profile-links, .person-list, .saved-search-list { display: grid; gap: 10px; margin: 10px 0 0; padding: 0; list-style: none; }
.profile-links li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.person-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.person-list .btn { min-height: 36px; margin-left: auto; padding: 6px 12px; }
.saved-search-list .card { display: flex; flex-direction: column; gap: 8px; }
.saved-search-list .heading-md { margin: 0; }
.save-search-row { align-items: center; margin-bottom: 12px; }
.distance { color: var(--muted); }
.announcement-stats { margin-top: 14px; }
@media (max-width: 480px) {
  .person-list .btn { margin-left: 0; }
}
/* w3-help-onboarding */
.boot-screen { align-content: center; gap: 14px; }
.boot-emblem { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 68px; border-radius: 18px; background: var(--brand); color: var(--brand-contrast); }
.back-bar { width: min(100%, 1264px); margin: 0 auto; padding: 20px 32px 0; }
.back-bar + .container { padding-top: 12px; }
.back-link { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; margin-left: -8px; padding: 4px 12px 4px 8px; border-radius: 8px; color: var(--brand-ink); font-size: 14px; font-weight: 600; text-decoration: none; }
.back-link:hover { background: var(--surface-raised); text-decoration: underline; }
.site-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 24px; padding: 20px 32px 28px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
.is-authenticated .site-footer { margin-left: 232px; }
.site-footer ul { display: flex; flex-wrap: wrap; gap: 0 18px; margin: 0; padding: 0; list-style: none; }
.site-footer a { display: inline-flex; align-items: center; min-height: 32px; color: var(--muted); }
.site-footer a:hover, .site-footer a[aria-current="page"] { color: var(--paper); }
.site-footer a[aria-current="page"] { font-weight: 650; }
.site-footer p { margin: 0; }
.update-banner, .shell-notice { width: min(100% - 64px, 1200px); margin: 16px auto 0; }
.update-banner { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 8px 8px 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--brand-soft); color: var(--brand-ink); font-size: 14px; }
.update-banner p { flex: 1 1 220px; margin: 0; }
.update-banner .icon-button { margin-left: auto; background: transparent; color: var(--brand-ink); }
.update-required, .terms-gate { display: grid; gap: 14px; }
.update-required > *, .terms-gate > * { margin: 0; }
.terms-gate-links, .link-list { display: grid; gap: 8px; margin: 0; padding-left: 20px; }
.update-instructions { display: grid; gap: 10px; }
.update-instructions p { margin: 0; }
.update-platforms { display: grid; gap: 14px; margin: 0; padding: 4px 14px 14px; }
.update-platforms dt { font-weight: 650; }
.update-platforms dd { display: grid; gap: 6px; margin: 4px 0 0; color: var(--muted); }
.help-options { list-style: none; max-width: 760px; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 12px; background: var(--surface); overflow: hidden; }
.help-options li + li { border-top: 1px solid var(--line); }
.help-options a { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 16px; min-height: 68px; padding: 14px 18px; color: var(--paper); text-decoration: none; }
.help-options a:hover { background: var(--surface-raised); }
.help-options a:hover .help-option-title { text-decoration: underline; }
.help-option-title { color: var(--brand-ink); font-weight: 650; }
.help-option-body { grid-column: 1; color: var(--muted); font-size: 14px; }
.help-options .icon { grid-column: 2; grid-row: 1 / span 2; color: var(--muted); }
.support-form { max-width: 760px; }
.consent-field { display: grid; gap: 4px; }
.consent-field .field-hint { padding-left: 28px; overflow-wrap: anywhere; }
.support-trap { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
.support-requests { display: grid; gap: 14px; max-width: 900px; margin: 0; padding: 0; list-style: none; }
.support-requests h3 { margin: 16px 0 6px; font-size: 14px; }
.support-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--muted); font-size: 12px; }
.support-detail { max-width: 900px; margin-top: 16px; }
.support-detail h4 { margin: 20px 0 6px; font-size: 14px; }
.support-diagnostics { display: grid; gap: 6px; margin: 0; font-size: 13px; }
.support-diagnostics div { display: grid; grid-template-columns: minmax(90px, 140px) minmax(0, 1fr); gap: 12px; }
.support-diagnostics dt { color: var(--muted); }
.support-diagnostics dd { margin: 0; overflow-wrap: anywhere; }
.star-rating { padding: 0; border: 0; }
.star-rating legend { margin-bottom: 8px; padding: 0; }
.star-options { display: flex; flex-wrap: wrap; gap: 4px; }
.star-option { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 10px; color: var(--control-border); cursor: pointer; }
.star-option input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.star-option:hover { background: var(--surface-raised); }
.star-option.is-filled { color: var(--brand-ink); }
.star-option.is-filled .icon { fill: currentColor; }
.star-option:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
.legal-page .legal-body, .legal-page .detail-section, .legal-page > .body-muted { max-width: 74ch; }
.legal-tabs { flex-wrap: wrap; gap: 0 20px; }
.legal-template { max-width: 74ch; }
.legal-meta { display: flex; flex-wrap: wrap; gap: 8px 32px; margin: 0 0 8px; }
.legal-meta dt { color: var(--muted); font-size: 12px; }
.legal-meta dd { margin: 0; font-weight: 600; }
.legal-body section { margin-top: 28px; }
.legal-body .heading-md { font-size: 18px; }
.legal-body ul { display: grid; gap: 6px; margin: 0 0 12px; padding-left: 20px; }
.helpdesk { padding-top: 28px; border-top: 1px solid var(--line); }
.helpdesk-switch { margin: 12px 0 4px; }
.helpdesk-switch .btn[aria-pressed="true"] { border-color: var(--brand-ink); }
.helpdesk-filters { display: flex; flex-wrap: wrap; gap: 14px; margin: 16px 0; }
.helpdesk-filters .field { flex: 1 1 180px; max-width: 280px; }
.helpdesk-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.rating-comments { display: grid; gap: 12px; max-width: 74ch; margin: 0; padding: 0; list-style: none; }
.rating-comments li { padding: 12px 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.rating-comments p { margin: 0; }
.tour-dialog { position: fixed; inset: 0; width: 100%; max-width: none; height: 100%; max-height: none; margin: 0; padding: 0; border: 0; background: transparent; color: var(--paper); overflow: hidden; }
.tour-dialog::backdrop { background: transparent; }
.tour-dialog-centered::backdrop { background: #070a12b8; }
body:has(.tour-dialog[open]) { overflow: hidden; }
.tour-highlight { position: absolute; top: 0; left: 0; border-radius: 10px; box-shadow: 0 0 0 3px var(--focus), 0 0 0 200vmax #070a12b8; pointer-events: none; transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1); }
.tour-card { position: absolute; top: 0; left: 0; padding: 20px; border: 1px solid var(--line); border-radius: 14px; background: var(--surface); box-shadow: 0 16px 48px #0007; transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1); }
.tour-card .heading-md { margin-bottom: 6px; font-size: 18px; }
.tour-card p { margin-bottom: 8px; }
.tour-progress { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; color: var(--muted); font-size: 12px; font-weight: 600; }
.tour-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 16px; }
.tour-step-buttons { display: flex; gap: 8px; margin-left: auto; }
@media (max-width: 1023px) {
  .back-bar { padding: 16px 24px 0; }
  .is-authenticated .site-footer { margin-left: 0; padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px)); }
  .site-footer { padding-right: 24px; padding-left: 24px; }
  .update-banner, .shell-notice { width: calc(100% - 48px); }
}
@media (max-width: 700px) {
  .helpdesk-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .helpdesk-filters .field { max-width: none; }
}
@media (max-width: 480px) {
  .back-bar { padding: 12px 16px 0; }
  .site-footer { padding-right: 16px; padding-left: 16px; }
  .update-banner, .shell-notice { width: calc(100% - 32px); }
  .tour-card { padding: 16px; }
}
/* w0c-infra */
.device-list { list-style: none; padding: 0; }
.device-list .card { overflow-wrap: anywhere; }
/* w5-organizations */
.organization-card { display: flex; flex-direction: column; padding: 20px; }
.organization-card .heading-md { margin-bottom: 3px; font-size: 17px; }
.organization-card .musician-summary p { margin: 0; color: var(--muted); font-size: 12px; }
.organization-card .card-footer { justify-content: space-between; font-size: 13px; }
.verified-badge { gap: 4px; background: var(--positive-soft); color: var(--positive); }
.organization-byline { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 10px; color: var(--muted); font-size: 12px; }
.organization-byline .tag { min-height: 21px; }
.post-list, .release-list, .member-list, .member-admin-list, .photo-grid { display: grid; gap: 12px; margin: 16px 0; padding: 0; list-style: none; }
.post-list .card, .release-list .card, .member-admin-list .card { padding: 18px; box-shadow: none; }
.post-list .eyebrow { margin-bottom: 4px; }
.post-list h3, .release-list h3, .member-admin-list h3 { margin-bottom: 6px; }
.post-list .body-muted, .release-list .body-muted { margin: 0; font-size: 13px; }
.inline-list { display: flex; flex-wrap: wrap; gap: 8px 20px; margin: 8px 0 16px; padding: 0; list-style: none; }
.inline-list li { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.member-row { display: flex; align-items: center; gap: 12px; }
.member-row p { margin: 2px 0 0; font-size: 13px; }
.member-editor { margin-top: 12px; }
.member-editor .form-stack { padding: 0 14px 14px; }
.photo-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); }
.photo-grid figure { margin: 0; }
.photo-grid img { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; border: 1px solid var(--line); border-radius: 8px; object-fit: cover; }
.photo-grid figcaption { margin-top: 6px; color: var(--muted); font-size: 13px; }
.detail-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 12px 20px; margin: 20px 0; }
.detail-list dt { color: var(--muted); font-size: 12px; font-weight: 600; }
.detail-list dd { margin: 4px 0 0; }
.picker { display: grid; gap: 12px; max-width: 520px; }
.picker > .btn { justify-self: start; }
.claim-venue { display: grid; gap: 8px; justify-items: start; }
.verification-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; box-shadow: none; }
@media (max-width: 480px) {
  .organization-card { padding: 18px; }
  .inline-list { gap: 8px 14px; }
}
/* w8-events */
.event-quick-filters, .filters.event-filters { grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); }
.event-quick-filters { max-width: 560px; }
.filters.event-filters .btn { grid-column: 1 / -1; justify-self: start; }
.event-filters .picker, .event-filters .chosen-entity, .event-filters .place-picker { align-self: start; }
.chosen-entity-value { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; min-height: 44px; margin: 0; }
.chosen-entity-value > span { font-weight: 600; }
.event-card { display: flex; flex-direction: column; }
.event-card-date { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; font-weight: 600; }
.event-card-lineup { margin: 0 0 10px; color: var(--muted); font-size: 14px; }
.event-notice { font-size: 14px; }
.event-notice-cancelled { background: var(--danger-soft); color: var(--danger); }
.event-detail { display: grid; gap: 4px; }
.event-cover { display: block; width: 100%; height: auto; max-height: 420px; margin-bottom: 8px; border-radius: 10px; object-fit: cover; }
.event-facts dd { display: grid; gap: 4px; }
.event-your-time { color: var(--muted); font-size: 13px; }
.event-map-links { margin: 0; }
.event-actions { margin-top: 16px; align-items: flex-start; }
.event-actions > .compact-actions { margin: 0; }
.capacity { display: grid; gap: 8px; max-width: 520px; margin-bottom: 14px; }
.capacity-text { margin: 0; }
.capacity-bar { height: 10px; overflow: hidden; border: 1px solid var(--control-border); border-radius: 999px; background: var(--surface-raised); }
.capacity-bar span { display: block; height: 100%; background: var(--brand); }
.ticket-links .btn { white-space: normal; }
.lineup-group h3 { margin: 16px 0 8px; font-size: 14px; }
.lineup-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.lineup-list li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; }
.lineup-name { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; font-weight: 600; }
.communication-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.communication { padding: 14px 16px; border: 1px solid var(--line); border-left: 4px solid var(--brand-ink); border-radius: 8px; background: var(--surface); }
.communication-cancellation, .communication-postponement { border-left-color: var(--danger); }
.communication p { margin: 0 0 6px; }
.communication-form { margin-top: 18px; }
.event-posts .card-author { flex-wrap: wrap; }
.event-posts .detail-text { margin: 0 0 8px; }
.lineup-editor-list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.lineup-editor-list .card { padding: 16px; box-shadow: none; }
.lineup-editor-list legend { font-weight: 600; }
.lineup-add { align-items: start; }
.ticket-link-row { align-items: end; }
.events-extension-list { min-width: 0; }
.events-extension-list h3 { margin: 0 0 10px; }
.events-extension-list .stack { margin-bottom: 10px; }
@media (max-width: 480px) {
  .event-card .call-card-heading { flex-wrap: wrap; }
  .communication { padding: 12px; }
}
`;

export default styles;
