import { useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import FormField from './FormField.jsx';
import Spinner from './Spinner.jsx';
import ErrorState from './ErrorState.jsx';
import ApplicationDetails from './ApplicationDetails.jsx';

const LINK_TYPES = ['website', 'youtube', 'spotify', 'soundcloud', 'bandcamp', 'other'];
const MAX_LINKS = 5;
const emptyForm = () => ({ message: '', instrumentIds: [], links: [] });
let linkKey = 0;

function OwnerSummary({ post }) {
  const { t } = useI18n();
  const resource = useResource(`/applications/received?announcementId=${post.id}&pageSize=1`, { events: 'applications.changed' });
  const counts = resource.data?.counts;
  return (
    <section className="detail-section" aria-labelledby="applications-heading">
      <h2 className="heading-md" id="applications-heading">{t('applications.owner.heading')}</h2>
      {resource.error && <ErrorState title={t('applications.loadError')} message={resource.error} onRetry={resource.reload} />}
      {!counts && !resource.error ? <Spinner label={t('applications.owner.loading')} /> : counts && (
        <p>{t('applications.owner.summary', { count: counts.total })}{counts.new > 0 && ` / ${t('applications.owner.newCount', { count: counts.new })}`}</p>
      )}
      <a className="btn btn-secondary" href={`#applications?announcement=${post.id}`}>{t('applications.owner.review')}</a>
    </section>
  );
}

function ApplyForm({ post, onSent, onCancel }) {
  const { t } = useI18n();
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const updateLink = (index, key, value) => update('links', form.links.map((link, i) => (i === index ? { ...link, [key]: value } : link)));
  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/announcements/${post.id}/applications`, {
        method: 'POST', auth: true,
        body: {
          message: form.message, instrumentIds: form.instrumentIds,
          links: form.links.filter(link => link.url.trim()).map(({ linkType, url }) => ({ linkType, url: url.trim() })),
        },
      });
      onSent();
    } catch (failure) {
      setError(failure.message);
    } finally { setBusy(false); }
  };
  return (
    <form className="form-stack application-form" onSubmit={submit}>
      <p className="status-message" id="application-privacy">{t('applications.apply.privacy')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="field">
        <label className="field-label" htmlFor="application-message">{t('applications.apply.message')}<span aria-hidden="true"> *</span></label>
        <p className="field-hint" id="application-message-hint">{t('applications.apply.messageHint')}</p>
        {/* The privacy notice is part of the description because the field receives focus when the form opens. */}
        <textarea className="input" id="application-message" rows="6" maxLength="4000" value={form.message} disabled={busy} autoFocus required
          aria-describedby="application-privacy application-message-hint" onChange={event => update('message', event.target.value)} />
        <p className="field-hint">{t('applications.apply.characters', { count: form.message.length })}</p>
      </div>
      {!!post.instruments.length && (
        <fieldset className="application-fieldset" disabled={busy}>
          <legend className="field-label">{t('applications.apply.instruments')}</legend>
          <div className="choice-grid">{post.instruments.map(item => (
            <label className="checkbox-label" key={item.instrument_id}>
              <input type="checkbox" checked={form.instrumentIds.includes(item.instrument_id)} onChange={event => update('instrumentIds', event.target.checked
                ? [...form.instrumentIds, item.instrument_id] : form.instrumentIds.filter(id => id !== item.instrument_id))} />
              {item.name}
            </label>
          ))}</div>
        </fieldset>
      )}
      <fieldset className="application-fieldset" disabled={busy} aria-describedby="application-links-hint">
        <legend className="field-label">{t('applications.apply.links')}</legend>
        <p className="field-hint" id="application-links-hint">{t('applications.apply.linksHint')}</p>
        {form.links.map((link, index) => (
          <div className="collaborator-row" key={link.key}>
            <FormField id={`application-link-type-${link.key}`} label={t('applications.apply.linkType', { number: index + 1 })}>
              <select className="input" value={link.linkType} onChange={event => updateLink(index, 'linkType', event.target.value)}>
                {LINK_TYPES.map(type => <option key={type} value={type}>{t(`applications.linkTypes.${type}`)}</option>)}
              </select>
            </FormField>
            <FormField id={`application-link-url-${link.key}`} label={t('applications.apply.linkUrl', { number: index + 1 })}>
              <input className="input" type="url" inputMode="url" maxLength="2048" placeholder="https://" value={link.url}
                onChange={event => updateLink(index, 'url', event.target.value)} />
            </FormField>
            <button className="btn btn-ghost" type="button" onClick={() => {
              update('links', form.links.filter((_, i) => i !== index));
              document.getElementById('application-add-link')?.focus();
            }}>{t('applications.apply.removeLink', { number: index + 1 })}</button>
          </div>
        ))}
        <button className="btn btn-secondary" id="application-add-link" type="button" disabled={form.links.length >= MAX_LINKS}
          onClick={() => update('links', [...form.links, { key: ++linkKey, linkType: 'website', url: '' }])}>
          {t('applications.apply.addLink')}
        </button>
      </fieldset>
      <div className="button-row">
        <button className="btn btn-primary" type="submit" disabled={busy || !form.message.trim()}>
          {busy ? t('applications.apply.sending') : t('applications.apply.submit')}
        </button>
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={onCancel}>{t('applications.apply.cancel')}</button>
      </div>
    </form>
  );
}

function ApplyPanel({ post }) {
  const { t, formatDate } = useI18n();
  const heading = useRef(null);
  const resource = useResource(`/announcements/${post.id}/applications/me`, { events: 'applications.changed' });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const application = resource.data?.application;
  const focusHeading = () => heading.current?.focus();
  const withdraw = async () => {
    if (!window.confirm(t('applications.apply.withdrawConfirm'))) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await conduit.transmit(`/applications/${application.id}`, { method: 'DELETE', auth: true });
      setNotice(t('applications.apply.withdrawn'));
      resource.reload();
      focusHeading();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section application-panel" aria-labelledby="apply-heading">
      <h2 className="heading-md" id="apply-heading" tabIndex="-1" ref={heading}>{t('applications.apply.heading')}</h2>
      {notice && <p className="success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {resource.error && <ErrorState title={t('applications.loadError')} message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('applications.apply.loading')} /> : resource.data && (application ? (
        <div className="card">
          <p><strong>{t('applications.apply.statusLine', { status: t(`applications.applicantStatus.${application.status}`) })}</strong></p>
          <p className="field-hint">{t('applications.apply.applied', { date: formatDate(application.createdAt) })}</p>
          <ApplicationDetails application={application} messageLabel={t('applications.apply.yourMessage')} />
          <div className="compact-actions">
            <button className="btn btn-danger" type="button" disabled={busy} onClick={withdraw}>
              {busy ? t('applications.apply.withdrawing') : t('applications.apply.withdraw')}
            </button>
            <a className="text-link" href="#applications?view=sent">{t('applications.apply.viewAll')}</a>
          </div>
        </div>
      ) : open ? (
        <ApplyForm post={post} onCancel={() => { setOpen(false); requestAnimationFrame(() => document.getElementById('apply-open')?.focus()); }}
          onSent={() => { setOpen(false); setNotice(t('applications.apply.sent')); resource.reload(); focusHeading(); }} />
      ) : (
        <>
          <p className="body-muted">{t('applications.apply.intro')}</p>
          <button className="btn btn-primary" id="apply-open" type="button" onClick={() => { setNotice(''); setOpen(true); }}>
            {t('applications.apply.open')}
          </button>
        </>
      ))}
    </section>
  );
}

export default function ApplicationPanel({ post, mine }) {
  if (post.isPublished === false && !mine) return null;
  return mine ? <OwnerSummary post={post} /> : <ApplyPanel post={post} />;
}
