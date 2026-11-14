import { useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { CLIENT_VERSION, detectPlatform } from '../lib/app-version.js';
import FormField from './FormField.jsx';
import { errorText } from '../lib/error-text.js';

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const EMPTY = { name: '', email: '', subject: '', message: '', steps: '', link: '', website: '', diagnostics: false };

function validate(values, authorized) {
  const errors = {};
  if (!authorized && !EMAIL.test(values.email.trim())) errors.email = 'email';
  else if (values.email.trim() && !EMAIL.test(values.email.trim())) errors.email = 'email';
  if (values.subject.trim().length < 3) errors.subject = 'subject';
  if (values.message.trim().length < 10) errors.message = 'message';
  if (values.link.trim() && !/^https?:\/\/\S+$/i.test(values.link.trim())) errors.link = 'link';
  return errors;
}

export default function SupportForm({ kind, authorized }) {
  const { t, locale } = useI18n();
  const form = useRef(null);
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const diagnostics = { appVersion: CLIENT_VERSION, platform: detectPlatform(), locale, userAgent: navigator.userAgent.slice(0, 512) };
  const field = name => ({
    value: values[name],
    onChange: event => setValues(previous => ({ ...previous, [name]: event.target.value })),
    disabled: busy,
  });
  const fieldError = name => (errors[name] ? t(`help.form.errors.${errors[name]}`) : undefined);

  const submit = async event => {
    event.preventDefault();
    setError(''); setSent('');
    const found = validate(values, authorized);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      form.current?.querySelector(`#support-${first}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const body = { kind, subject: values.subject, message: values.message, website: values.website };
      if (values.name.trim()) body.name = values.name;
      if (values.email.trim()) body.email = values.email;
      if (kind === 'bug' && values.steps.trim()) body.steps = values.steps;
      if (kind === 'work' && values.link.trim()) body.link = values.link;
      if (kind === 'bug' && values.diagnostics) {
        body.diagnosticsConsent = true;
        body.diagnostics = diagnostics;
      }
      await conduit.transmit('/support', { method: 'POST', auth: authorized, body });
      setValues(EMPTY);
      setSent(t(authorized ? 'help.form.sentSignedIn' : 'help.form.sent'));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={form} className="form-stack support-form" onSubmit={submit} noValidate>
      <p className="body-muted">{t(`help.form.intro.${kind}`)}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {sent && <p className="success" role="status">{sent} {authorized && <a href="#help?view=requests">{t('help.account.requests')}</a>}</p>}
      <div className="form-grid">
        <FormField id="support-name" label={t('help.form.name')} hint={t('help.form.nameHint')}>
          <input className="input" type="text" autoComplete="name" maxLength="120" {...field('name')} />
        </FormField>
        <FormField id="support-email" label={t('help.form.email')} required={!authorized} error={fieldError('email')}
          hint={authorized ? t('help.form.emailOptional') : t('help.form.emailHint')}>
          <input className="input" type="email" autoComplete="email" inputMode="email" maxLength="255" {...field('email')} />
        </FormField>
      </div>
      <FormField id="support-subject" label={t('help.form.subject')} required error={fieldError('subject')}>
        <input className="input" type="text" maxLength="200" {...field('subject')} />
      </FormField>
      <FormField id="support-message" label={t(`help.form.message.${kind}`)} hint={t(`help.form.messageHint.${kind}`)} required error={fieldError('message')}>
        <textarea className="input" maxLength="5000" rows="6" {...field('message')} />
      </FormField>
      {kind === 'bug' && <FormField id="support-steps" label={t('help.form.steps')} hint={t('help.form.stepsHint')}>
        <textarea className="input" maxLength="5000" rows="4" {...field('steps')} />
      </FormField>}
      {kind === 'work' && <FormField id="support-link" label={t('help.form.link')} hint={t('help.form.linkHint')} error={fieldError('link')}>
        <input className="input" type="url" inputMode="url" maxLength="2048" {...field('link')} />
      </FormField>}
      {kind === 'bug' && <div className="consent-field">
        <label className="checkbox-label" htmlFor="support-diagnostics">
          <input id="support-diagnostics" type="checkbox" checked={values.diagnostics} disabled={busy} aria-describedby="support-diagnostics-hint"
            onChange={event => setValues(previous => ({ ...previous, diagnostics: event.target.checked }))} />
          {t('help.form.diagnostics')}
        </label>
        <p className="field-hint" id="support-diagnostics-hint">{t('help.form.diagnosticsHint', {
          version: diagnostics.appVersion, platform: diagnostics.platform, locale: diagnostics.locale, agent: diagnostics.userAgent,
        })}</p>
      </div>}
      <div className="support-trap" aria-hidden="true">
        <label htmlFor="support-website">{t('help.form.honeypot')}</label>
        <input id="support-website" name="website" type="text" tabIndex="-1" autoComplete="off" {...field('website')} />
      </div>
      <p className="field-hint">{t('help.form.privacy')} <a href="#legal?page=privacy">{t('help.links.privacy')}</a></p>
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('help.form.sending') : t('help.form.submit')}</button>
    </form>
  );
}
