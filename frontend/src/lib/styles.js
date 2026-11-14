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
`;

export default styles;
