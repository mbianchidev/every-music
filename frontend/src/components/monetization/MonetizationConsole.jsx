import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useResource } from '../../lib/resources.js';
import { useI18n } from '../../lib/i18n.js';
import Spinner from '../Spinner.jsx';
import ErrorState from '../ErrorState.jsx';
import FormField from '../FormField.jsx';
import Pagination from '../Pagination.jsx';
import SponsoredCardForm from './SponsoredCardForm.jsx';
import { errorText } from '../../lib/error-text.js';

const SECTIONS = ['overview', 'cards', 'offers', 'grants'];
const sum = values => Object.values(values ?? {}).reduce((total, value) => total + value, 0);

function Overview({ data }) {
  const { t, formatNumber } = useI18n();
  const metrics = [
    ['payments', data.payments.enabled ? t('monetization.admin.stats.enabled') : t('monetization.admin.stats.disabled')],
    ['premium', data.payments.subscriptions.premium], ['partner', data.payments.subscriptions.partner],
    ['pastDue', data.payments.subscriptions.pastDue], ['outstanding', data.points.outstanding],
    ['earned', sum(data.points.earned)], ['spent', sum(data.points.spent)], ['promotions', sum(data.promotions)],
    ['referralsPending', data.referrals.pending], ['referralsRewarded', data.referrals.rewarded],
    ['impressions', data.sponsored.impressions], ['clicks', data.sponsored.clicks],
    ['completions', data.sponsored.videoCompletions], ['liveCards', data.sponsored.liveCards],
  ];
  return <dl className="metric-grid monetization-metrics">{metrics.map(([key, value]) => <div className="card" key={key}>
    <dt>{t(`monetization.admin.stats.${key}`)}</dt><dd>{typeof value === 'number' ? formatNumber(value) : value}</dd>
  </div>)}</dl>;
}

function Cards({ data }) {
  const { t, formatNumber } = useI18n();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const resource = useResource(`/admin/sponsored-cards?page=${page}&pageSize=10`, { events: 'sponsored.changed' });
  const remove = async (card) => {
    if (!window.confirm(t('monetization.admin.cards.confirmDelete', { title: card.title }))) return;
    setError(''); setMessage('');
    try {
      await conduit.transmit(`/admin/sponsored-cards/${card.id}`, { method: 'DELETE', auth: true });
      setMessage(t('monetization.admin.cards.deleted'));
      resource.reload();
    } catch (failure) { setError(errorText(failure)); }
  };
  const done = () => {
    setEditing(null); setMessage(t('monetization.admin.form.saved')); resource.reload();
    document.getElementById('monetization-cards-heading')?.focus();
  };
  return <>
    <h3 id="monetization-cards-heading" tabIndex="-1">{t('monetization.admin.tabs.cards')}</h3>
    {message && <p className="success" role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    {editing ? <SponsoredCardForm card={editing.id ? editing : null} defaultPoints={data.rules.earn.rewardedVideo}
      videoBytes={data.limits.videoBytes} onSaved={done} onCancel={() => setEditing(null)} />
      : <button className="btn btn-primary" type="button" onClick={() => { setMessage(''); setEditing({}); }}>{t('monetization.admin.cards.new')}</button>}
    {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
    {!resource.data && !resource.error ? <Spinner label={t('monetization.admin.loading')} /> : resource.data && (!resource.data.cards.length
      ? <p className="body-muted">{t('monetization.admin.cards.empty')}</p> : <>
        <div className="table-wrap"><table>
          <caption>{t('monetization.admin.cards.caption')}</caption>
          <thead><tr><th scope="col">{t('monetization.admin.cards.card')}</th><th scope="col">{t('monetization.admin.cards.status')}</th>
            <th scope="col">{t('monetization.admin.cards.totals')}</th><th scope="col">{t('monetization.admin.cards.actions')}</th></tr></thead>
          <tbody>{resource.data.cards.map(card => <tr key={card.id}>
            <th scope="row">{card.title}<br /><span className="body-muted">{card.sponsorName}</span></th>
            <td>{card.live ? t('monetization.admin.cards.live') : t('monetization.admin.cards.notLive')}</td>
            <td>{t('monetization.admin.cards.totalsValue', {
              impressions: formatNumber(card.stats.impressions), clicks: formatNumber(card.stats.clicks), completions: formatNumber(card.stats.videoCompletions),
            })}</td>
            <td><div className="compact-actions">
              <button className="btn btn-secondary" type="button" onClick={() => { setMessage(''); setEditing(card); }}
                aria-label={t('monetization.admin.cards.editNamed', { title: card.title })}>{t('monetization.admin.cards.edit')}</button>
              <button className="btn btn-danger" type="button" onClick={() => remove(card)}
                aria-label={t('monetization.admin.cards.deleteNamed', { title: card.title })}>{t('monetization.admin.cards.delete')}</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
        <Pagination pagination={resource.data.pagination} onPage={setPage} disabled={resource.loading} label={t('monetization.admin.cards.pages')} />
      </>)}
  </>;
}

function Offers({ data, onSent }) {
  const { t, formatDate, formatNumber } = useI18n();
  const [draft, setDraft] = useState({ headline: '', message: '', link: '', audience: 'all' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const set = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const send = async (event) => {
    event.preventDefault();
    if (!window.confirm(t('monetization.admin.offers.confirm', { audience: t(`monetization.admin.offers.audiences.${draft.audience}`) }))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await conduit.transmit('/admin/offers', {
        method: 'POST', auth: true,
        body: { headline: draft.headline.trim(), message: draft.message.trim(), audience: draft.audience, link: draft.link.trim() || null },
      });
      setMessage(t('monetization.admin.offers.sent', { count: result.recipients }));
      setDraft({ headline: '', message: '', link: '', audience: draft.audience });
      onSent();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return <>
    <form className="form-stack" onSubmit={send}>
      <h3>{t('monetization.admin.offers.title')}</h3>
      <p className="body-muted">{t('monetization.admin.offers.intro')}</p>
      <fieldset disabled={busy} className="form-stack">
        <FormField id="offer-headline" label={t('monetization.admin.offers.headline')} required>
          <input className="input" value={draft.headline} minLength="3" maxLength="120" onChange={event => set('headline', event.target.value)} />
        </FormField>
        <FormField id="offer-message" label={t('monetization.admin.offers.message')} required>
          <textarea className="input" value={draft.message} minLength="3" maxLength="500" onChange={event => set('message', event.target.value)} />
        </FormField>
        <FormField id="offer-link" label={t('monetization.admin.offers.link')} hint={t('monetization.admin.offers.linkHint')}>
          <input className="input" value={draft.link} maxLength="200" pattern="#[a-z][a-z0-9\-]*(\?\S*)?" onChange={event => set('link', event.target.value)} />
        </FormField>
        <FormField id="offer-audience" label={t('monetization.admin.offers.audience')}>
          <select className="input" value={draft.audience} onChange={event => set('audience', event.target.value)}>
            {['all', 'free', 'paid'].map(value => <option key={value} value={value}>{t(`monetization.admin.offers.audiences.${value}`)}</option>)}
          </select>
        </FormField>
      </fieldset>
      {error && <p className="field-error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || draft.headline.trim().length < 3 || draft.message.trim().length < 3}>
        {busy ? t('monetization.admin.offers.sending') : t('monetization.admin.offers.send')}</button>
    </form>
    <h3>{t('monetization.admin.offers.recent')}</h3>
    {!data.offers.length ? <p className="body-muted">{t('monetization.admin.offers.empty')}</p> : <div className="table-wrap"><table>
      <caption className="sr-only">{t('monetization.admin.offers.recent')}</caption>
      <thead><tr><th scope="col">{t('monetization.admin.offers.headline')}</th><th scope="col">{t('monetization.admin.offers.audience')}</th>
        <th scope="col">{t('monetization.admin.offers.recipients')}</th><th scope="col">{t('monetization.admin.offers.date')}</th></tr></thead>
      <tbody>{data.offers.map(offer => <tr key={offer.id}><th scope="row">{offer.headline}</th>
        <td>{t(`monetization.admin.offers.audiences.${offer.audience}`)}</td><td>{formatNumber(offer.recipients)}</td>
        <td>{formatDate(offer.createdAt)}</td></tr>)}</tbody>
    </table></div>}
  </>;
}

function Grants({ data, onGranted }) {
  const { t, formatDate, formatNumber } = useI18n();
  const [draft, setDraft] = useState({ email: '', points: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const set = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const grant = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await conduit.transmit('/admin/points/grants', {
        method: 'POST', auth: true, body: { email: draft.email.trim(), points: Number(draft.points), note: draft.note.trim() },
      });
      setMessage(t('monetization.admin.grants.granted', { points: formatNumber(result.points), balance: formatNumber(result.balance) }));
      setDraft({ email: '', points: '', note: draft.note });
      onGranted();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return <>
    <form className="form-stack" onSubmit={grant}>
      <h3>{t('monetization.admin.grants.title')}</h3>
      <p className="body-muted">{t('monetization.admin.grants.intro')}</p>
      <fieldset disabled={busy} className="form-stack">
        <FormField id="grant-email" label={t('monetization.admin.grants.email')} required>
          <input className="input" type="email" autoComplete="off" value={draft.email} maxLength="255" onChange={event => set('email', event.target.value)} />
        </FormField>
        <FormField id="grant-points" label={t('monetization.admin.grants.points')} required>
          <input className="input" type="number" min="1" max="100000" value={draft.points} onChange={event => set('points', event.target.value)} />
        </FormField>
        <FormField id="grant-note" label={t('monetization.admin.grants.note')} required>
          <input className="input" value={draft.note} minLength="3" maxLength="200" onChange={event => set('note', event.target.value)} />
        </FormField>
      </fieldset>
      {error && <p className="field-error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !draft.email.trim() || !(Number(draft.points) >= 1) || draft.note.trim().length < 3}>
        {busy ? t('monetization.admin.grants.granting') : t('monetization.admin.grants.grant')}</button>
    </form>
    <h3>{t('monetization.admin.grants.recent')}</h3>
    {!data.grants.length ? <p className="body-muted">{t('monetization.admin.grants.empty')}</p> : <div className="table-wrap"><table>
      <caption className="sr-only">{t('monetization.admin.grants.recent')}</caption>
      <thead><tr><th scope="col">{t('monetization.admin.grants.member')}</th><th scope="col">{t('monetization.admin.grants.points')}</th>
        <th scope="col">{t('monetization.admin.grants.note')}</th><th scope="col">{t('monetization.wallet.date')}</th></tr></thead>
      <tbody>{data.grants.map(item => <tr key={item.id}><th scope="row">{item.artistName || item.userId}</th>
        <td>{formatNumber(item.points)}</td><td>{item.note}</td><td>{formatDate(item.createdAt)}</td></tr>)}</tbody>
    </table></div>}
  </>;
}

// Administrator console for sponsored cards, rewarded videos, offers and
// points grants, with aggregate statistics only.
export default function MonetizationConsole() {
  const { t } = useI18n();
  const [section, setSection] = useState('overview');
  const resource = useResource('/admin/monetization', { events: 'admin.changed,sponsored.changed' });
  return (
    <section className="detail-section monetization-console" aria-labelledby="monetization-console-heading">
      <h2 className="heading-md" id="monetization-console-heading">{t('monetization.admin.title')}</h2>
      <p className="body-muted">{t('monetization.admin.intro')}</p>
      <div className="compact-actions" role="group" aria-label={t('monetization.admin.sections')}>
        {SECTIONS.map(value => <button key={value} type="button" className={`btn ${section === value ? 'btn-tertiary' : 'btn-ghost'}`}
          aria-pressed={section === value} onClick={() => setSection(value)}>{t(`monetization.admin.tabs.${value}`)}</button>)}
      </div>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('monetization.admin.loading')} /> : resource.data && <>
        {section === 'overview' && <Overview data={resource.data} />}
        {section === 'cards' && <Cards data={resource.data} />}
        {section === 'offers' && <Offers data={resource.data} onSent={resource.reload} />}
        {section === 'grants' && <Grants data={resource.data} onGranted={resource.reload} />}
      </>}
    </section>
  );
}
