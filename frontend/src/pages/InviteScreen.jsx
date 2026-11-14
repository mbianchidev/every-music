import { useId, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useResource } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import FormField from '../components/FormField.jsx';
import { errorText } from '../lib/error-text.js';

const STATUSES = ['pending', 'rewarded', 'capped'];

export default function InviteScreen() {
  const { t, formatDate, formatNumber } = useI18n();
  const resource = useResource('/referrals', { events: 'points.changed' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState('');
  const [claimError, setClaimError] = useState('');
  const linkId = useId();
  const data = resource.data;
  const copy = async () => {
    setMessage(''); setError('');
    try {
      await navigator.clipboard.writeText(data.link);
      setMessage(t('monetization.invite.copied'));
    } catch (failure) {
      console.warn('Clipboard unavailable', failure);
      setError(t('monetization.invite.copyFailed'));
      document.getElementById(linkId)?.select();
    }
  };
  const share = async () => {
    setMessage(''); setError('');
    try {
      await navigator.share({ title: t('monetization.invite.shareTitle'), url: data.link });
    } catch (failure) {
      if (failure.name !== 'AbortError') {
        console.warn('Native sharing unavailable', failure);
        setError(t('monetization.invite.copyFailed'));
      }
    }
  };
  const claim = async (event) => {
    event.preventDefault();
    setClaiming(true); setClaimError(''); setClaimMessage('');
    try {
      const result = await conduit.transmit('/referrals/claim', { method: 'POST', auth: true, body: { code: code.trim() } });
      setClaimMessage(t(result.status === 'pending' ? 'monetization.invite.claimedPending' : 'monetization.invite.claimed'));
      setCode('');
      resource.reload();
    } catch (failure) { setClaimError(errorText(failure)); }
    finally { setClaiming(false); }
  };
  return (
    <div className="container">
      <PageHeader eyebrow={t('monetization.store.eyebrow')} title={t('monetization.invite.title')} subtitle={t('monetization.invite.subtitle')} />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!data && !resource.error ? <Spinner label={t('monetization.invite.loading')} /> : data && <>
        <section className="card card-highlight invite-link" aria-labelledby="invite-link-heading">
          <h2 className="heading-md" id="invite-link-heading">{t('monetization.invite.linkLabel')}</h2>
          <label className="sr-only" htmlFor={linkId}>{t('monetization.invite.linkLabel')}</label>
          <input className="input" id={linkId} readOnly value={data.link} onFocus={event => event.target.select()} />
          <p className="body-muted">{t('monetization.invite.codeLabel', { code: data.code })}</p>
          <div className="button-row">
            <button className="btn btn-primary" type="button" onClick={copy}>{t('monetization.invite.copy')}</button>
            {typeof navigator.share === 'function' && <button className="btn btn-secondary" type="button" onClick={share}>{t('monetization.invite.share')}</button>}
          </div>
          {message && <p className="success" role="status">{message}</p>}
          {error && <p className="field-error" role="alert">{error}</p>}
          <p>{t('monetization.invite.rewards', {
            inviter: formatNumber(data.rewards.inviter), invitee: formatNumber(data.rewards.invitee),
            cap: formatNumber(data.rewards.monthlyCap), used: formatNumber(data.rewards.rewardedThisMonth),
          })}</p>
        </section>
        <section className="detail-section" aria-labelledby="invite-status">
          <h2 className="heading-md" id="invite-status">{t('monetization.invite.statusTitle')}</h2>
          <dl className="detail-list">{STATUSES.map(status => <div key={status}>
            <dt>{t(`monetization.invite.counts.${status}`)}</dt><dd>{formatNumber(data.counts[status])}</dd></div>)}</dl>
          {!data.recent.length ? <p className="body-muted">{t('monetization.invite.empty')}</p> : <div className="table-wrap"><table>
            <caption>{t('monetization.invite.recentCaption')}</caption>
            <thead><tr><th scope="col">{t('monetization.invite.joined')}</th><th scope="col">{t('monetization.invite.status')}</th></tr></thead>
            <tbody>{data.recent.map((item, index) => <tr key={`${item.joinedAt}-${index}`}>
              <th scope="row">{formatDate(item.joinedAt)}</th><td>{t(`monetization.invite.counts.${item.status}`)}</td></tr>)}</tbody>
          </table></div>}
        </section>
        <section className="detail-section" aria-labelledby="invite-claim">
          <h2 className="heading-md" id="invite-claim">{t('monetization.invite.claimTitle')}</h2>
          {data.claim.used ? <p>{t('monetization.invite.claimUsed')}</p>
            : !data.claim.open ? <p className="body-muted">{t('monetization.invite.claimClosed', { days: data.claim.days })}</p>
              : <form className="form-stack picker" onSubmit={claim}>
                <p className="body-muted">{t('monetization.invite.claimText', { days: data.claim.days })}</p>
                <FormField id="invite-claim-code" label={t('monetization.invite.claimCode')} required>
                  <input className="input" value={code} maxLength="24" autoComplete="off" autoCapitalize="characters" disabled={claiming}
                    onChange={event => setCode(event.target.value)} />
                </FormField>
                {claimError && <p className="field-error" role="alert">{claimError}</p>}
                <button className="btn btn-secondary" type="submit" disabled={claiming || code.trim().length < 8}>
                  {claiming ? t('monetization.invite.claiming') : t('monetization.invite.claim')}</button>
              </form>}
          {claimMessage && <p className="success" role="status">{claimMessage}</p>}
        </section>
      </>}
    </div>
  );
}
