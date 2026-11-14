import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useResource } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';
import { formatMoney } from '../lib/marketplace.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { PromoteButton } from '../components/monetization/SpendDialog.jsx';
import { errorText } from '../lib/error-text.js';

const PERKS = ['maxActiveAnnouncements', 'maxSavedSearches', 'maxSavedAnnouncements', 'announcementExpiryDays', 'maxProjectsShown',
  'maxContentShown', 'announcementStats', 'profileVisits', 'businessPages', 'hideSponsored'];
const PLANS = ['free', 'premium', 'partner'];

function PerkValue({ value }) {
  const { t, formatNumber } = useI18n();
  if (value === null) return t('monetization.store.unlimited');
  if (typeof value === 'boolean') return value ? t('monetization.store.included') : t('monetization.store.notIncluded');
  return formatNumber(value);
}

export default function StoreScreen({ route }) {
  const { t, locale, formatDate, formatNumber } = useI18n();
  const billing = useResource('/billing', { events: 'entitlements.changed,points.changed' });
  const wallet = useResource('/points', { events: 'points.changed' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const checkout = route?.query.get('checkout');
  const data = billing.data;
  const price = amount => formatMoney(amount, data.currency, locale);
  const go = async (key, path, body) => {
    setBusy(key); setError('');
    try {
      const result = await conduit.transmit(path, { method: 'POST', auth: true, ...(body ? { body } : {}) });
      window.location.assign(result.url);
    } catch (failure) {
      setError(errorText(failure));
      setBusy('');
    }
  };
  const subscription = data?.subscription?.active ? data.subscription : null;
  const planEnd = data?.entitlements?.find(item => item.plan === data.plan);
  const perks = data && Object.fromEntries(PLANS.map(plan => [plan, { ...data.perks[plan], hideSponsored: plan !== 'free' }]));
  return (
    <div className="container">
      <PageHeader eyebrow={t('monetization.store.eyebrow')} title={t('monetization.store.title')} subtitle={t('monetization.store.subtitle')} />
      {checkout === 'success' && <p className="success" role="status">{t('monetization.store.checkoutSuccess')}</p>}
      {checkout === 'cancelled' && <p className="status-message" role="status">{t('monetization.store.checkoutCancelled')}</p>}
      {billing.error && <ErrorState message={billing.error} onRetry={billing.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {!data && !billing.error ? <Spinner label={t('monetization.store.loading')} /> : data && <>
        <section className="card card-highlight store-current" aria-labelledby="store-current-plan">
          <h2 className="heading-md" id="store-current-plan">{t('monetization.store.currentPlan', { plan: t(`monetization.plans.${data.plan}`) })}</h2>
          {subscription?.status === 'past_due' && <p className="error" role="alert">{t('monetization.store.pastDue')}</p>}
          {subscription ? <p>{t(subscription.cancelAtPeriodEnd ? 'monetization.store.endsOn' : 'monetization.store.renewsOn',
            { date: formatDate(subscription.currentPeriodEnd) })}</p>
            : data.plan !== 'free' && <p>{planEnd?.endsAt ? t('monetization.store.activeUntil', { date: formatDate(planEnd.endsAt) }) : t('monetization.store.noEnd')}</p>}
          {data.billingAccount && <button className="btn btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => go('portal', '/billing/portal')}>
            {busy === 'portal' ? t('monetization.store.openingBilling') : t('monetization.store.manageBilling')}</button>}
        </section>
        {!data.enabled && <p className="status-message" role="status">{t('monetization.store.unavailable')}</p>}
        {data.enabled && <section className="detail-section" aria-labelledby="store-plans">
          <h2 className="heading-md" id="store-plans">{t('monetization.store.plansTitle')}</h2>
          <div className="store-plans">{data.plans.filter(plan => plan.available).map(plan => <article className="card" key={plan.id}>
            <h3>{t(`monetization.plans.${plan.id}`)}</h3>
            <p className="store-price">{t('monetization.store.perMonth', { price: price(plan.amountMinor) })}</p>
            <p className="body-muted">{t(`monetization.store.planText.${plan.id}`)}</p>
            {subscription?.plan === plan.id ? <p className="tag tag-open">{t('monetization.store.subscribed')}</p>
              : !subscription && <button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={() => go(plan.id, '/billing/checkout', { product: plan.id })}>
                {busy === plan.id ? t('monetization.store.redirecting') : t('monetization.store.subscribe', { plan: t(`monetization.plans.${plan.id}`) })}</button>}
          </article>)}</div>
        </section>}
        <h2 className="heading-md detail-section">{t('monetization.store.perksTitle')}</h2>
        <div className="table-wrap"><table>
          <caption>{t('monetization.store.perksCaption')}</caption>
          <thead><tr><th scope="col">{t('monetization.store.feature')}</th>{PLANS.map(plan => <th scope="col" key={plan}>{t(`monetization.plans.${plan}`)}</th>)}</tr></thead>
          <tbody>{PERKS.map(perk => <tr key={perk}><th scope="row">{t(`monetization.store.perks.${perk}`)}</th>
            {PLANS.map(plan => <td key={plan}><PerkValue value={perks[plan][perk]} /></td>)}</tr>)}</tbody>
        </table></div>
        {data.enabled && data.packs.length > 0 && <section className="detail-section" aria-labelledby="store-packs">
          <h2 className="heading-md" id="store-packs">{t('monetization.store.packsTitle')}</h2>
          <p className="body-muted">{t('monetization.store.packsText')}</p>
          <ul className="store-packs">{data.packs.map(pack => <li className="card" key={pack.id}>
            <p className="store-price">{t('monetization.store.packPoints', { points: formatNumber(pack.points) })}</p>
            <button className="btn btn-secondary" type="button" disabled={Boolean(busy)} onClick={() => go(pack.id, '/billing/checkout', { product: 'points', packId: pack.id })}
              aria-label={t('monetization.store.buyPackLabel', { points: formatNumber(pack.points), price: price(pack.amountMinor) })}>
              {busy === pack.id ? t('monetization.store.redirecting') : t('monetization.store.buyPack', { price: price(pack.amountMinor) })}</button>
          </li>)}</ul>
        </section>}
        <section className="detail-section" aria-labelledby="store-points">
          <h2 className="heading-md" id="store-points">{t('monetization.store.pointsTitle')}</h2>
          {wallet.error && <ErrorState message={wallet.error} onRetry={wallet.reload} />}
          {wallet.data && <p>{t('monetization.store.balance', { points: formatNumber(wallet.data.balance) })} <a href="#wallet">{t('monetization.store.openWallet')}</a></p>}
          <div className="store-plans">
            <article className="card">
              <h3>{t('monetization.store.premiumDays')}</h3>
              {wallet.data && <p className="body-muted">{t('monetization.store.premiumDaysText', { cost: formatNumber(wallet.data.rules.spend.premiumDayCost) })}</p>}
              <PromoteButton mode="premium" className="btn btn-secondary" />
            </article>
            <article className="card">
              <h3>{t('monetization.store.promoteTitle')}</h3>
              <p className="body-muted">{t('monetization.store.promoteText')}</p>
              <div className="compact-actions"><PromoteButton mode="profile" className="btn btn-secondary" /><a href="#my-posts">{t('monetization.store.promoteCalls')}</a></div>
            </article>
          </div>
        </section>
        {data.enabled && <p className="body-muted">{t('monetization.store.processor')}</p>}
      </>}
    </div>
  );
}
