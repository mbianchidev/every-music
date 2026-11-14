import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useResource } from '../../lib/resources.js';
import { useI18n } from '../../lib/i18n.js';
import { pinRadii, spendCost } from '../../lib/monetization.js';
import ModalDialog from '../ModalDialog.jsx';
import FormField from '../FormField.jsx';
import PlacePicker from '../PlacePicker.jsx';
import Spinner from '../Spinner.jsx';
import ErrorState from '../ErrorState.jsx';
import { errorText } from '../../lib/error-text.js';

function SpendForm({ mode, announcement, onClose }) {
  const { t, formatDate, formatNumber } = useI18n();
  const wallet = useResource('/points', { events: 'points.changed', reconnect: false });
  const rules = wallet.data?.rules.spend;
  const [kind, setKind] = useState(mode === 'profile' ? 'profile_boost' : mode === 'premium' ? 'premium_days' : 'announcement_boost');
  const [days, setDays] = useState(null);
  const [place, setPlace] = useState(null);
  const [radius, setRadius] = useState(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  if (wallet.error) return <ErrorState message={wallet.error} onRetry={wallet.reload} />;
  if (!rules) return <Spinner label={t('monetization.spend.loading')} />;
  const durations = kind === 'premium_days' ? rules.premiumDurations : rules.promotionDurations;
  const chosenDays = durations.includes(days) ? days : durations[0];
  const radii = pinRadii(rules);
  const radiusKm = radii.includes(radius) ? radius : radii[0];
  const cost = spendCost(rules, { kind, days: chosenDays, radiusKm });
  const balance = wallet.data.balance;
  const submit = async (event) => {
    event.preventDefault();
    if (kind === 'announcement_pin' && !place) { setError(t('monetization.spend.chooseArea')); return; }
    setBusy(true); setError('');
    try {
      const result = await conduit.transmit('/points/spend', {
        method: 'POST', auth: true,
        body: {
          kind, days: chosenDays,
          ...(announcement ? { announcementId: announcement.id } : {}),
          ...(kind === 'announcement_pin' ? { placeId: place.id, radiusKm } : {}),
        },
      });
      setDone(result);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  if (done) {
    const endsAt = done.promotion?.endsAt ?? done.entitlement?.endsAt;
    return <div className="form-stack">
      <p className="success" role="status">{t('monetization.spend.done', { cost: formatNumber(done.cost) })}
        {endsAt && ` ${t('monetization.spend.activeUntil', { date: formatDate(endsAt) })}`}</p>
      <button className="btn btn-primary" type="button" onClick={onClose}>{t('monetization.spend.close')}</button>
    </div>;
  }
  return (
    <form className="form-stack" onSubmit={submit} noValidate>
      {mode === 'announcement' && <fieldset disabled={busy}>
        <legend>{t('monetization.spend.type')}</legend>
        {['announcement_boost', 'announcement_pin'].map(option => <label className="checkbox-label" key={option}>
          <input type="radio" name="promotion-kind" value={option} checked={kind === option} onChange={() => { setKind(option); setError(''); }} />
          {t(`monetization.spend.kinds.${option}`)}
        </label>)}
      </fieldset>}
      <p className="body-muted">{t(`monetization.spend.explain.${kind}`)}</p>
      <FormField id="spend-days" label={t('monetization.spend.days')}>
        <select className="input" value={chosenDays} disabled={busy} onChange={event => setDays(Number(event.target.value))}>
          {durations.map(value => <option key={value} value={value}>{t('monetization.spend.dayCount', { count: value })}</option>)}
        </select>
      </FormField>
      {kind === 'announcement_pin' && <>
        <PlacePicker id="spend-place" label={t('monetization.spend.area')} hint={t('monetization.spend.areaHint')} value={place}
          disabled={busy} onChange={value => { setPlace(value); setError(''); }} />
        <FormField id="spend-radius" label={t('monetization.spend.radius')}>
          <select className="input" value={radiusKm} disabled={busy} onChange={event => setRadius(Number(event.target.value))}>
            {radii.map(value => <option key={value} value={value}>{t('monetization.spend.radiusOption', { km: value })}</option>)}
          </select>
        </FormField>
      </>}
      <div className="spend-summary" aria-live="polite">
        <p><strong>{t('monetization.spend.cost', { cost: formatNumber(cost) })}</strong></p>
        <p>{t('monetization.spend.balance', { balance: formatNumber(balance) })}</p>
        {balance < cost && <p>{t('monetization.spend.short', { missing: formatNumber(cost - balance) })} <a href="#wallet" onClick={onClose}>{t('monetization.spend.earnMore')}</a></p>}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || balance < cost}>
        {busy ? t('monetization.spend.spending') : t('monetization.spend.confirm', { cost: formatNumber(cost) })}
      </button>
    </form>
  );
}

// Spends points on a profile boost, a call boost or pin, or Premium days.
export default function SpendDialog({ open, onClose, mode, announcement = null }) {
  const { t } = useI18n();
  const title = mode === 'profile' ? t('monetization.spend.titleProfile')
    : mode === 'premium' ? t('monetization.spend.titlePremium') : t('monetization.spend.titleAnnouncement', { title: announcement?.title ?? '' });
  return <ModalDialog title={title} open={open} onClose={onClose}>
    <SpendForm mode={mode} announcement={announcement} onClose={onClose} />
  </ModalDialog>;
}

export function PromoteButton({ mode, announcement = null, className = 'btn btn-ghost' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const label = mode === 'profile' ? t('monetization.spend.boostProfile') : mode === 'premium' ? t('monetization.store.getPremiumDays') : t('monetization.spend.promote');
  return <>
    <button className={className} type="button" onClick={() => setOpen(true)}
      aria-label={announcement ? t('monetization.spend.promoteNamed', { title: announcement.title }) : undefined}>{label}</button>
    <SpendDialog open={open} onClose={() => setOpen(false)} mode={mode} announcement={announcement} />
  </>;
}
