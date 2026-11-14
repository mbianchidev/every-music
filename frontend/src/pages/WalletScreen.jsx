import { useEffect, useRef, useState } from 'react';
import { useResource } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Pagination from '../components/Pagination.jsx';
import RewardedVideoDialog from '../components/monetization/RewardedVideoDialog.jsx';

function promotionText(t, item) {
  return t(`monetization.wallet.kinds.${item.kind}`, {
    title: item.announcementTitle ?? '', place: item.placeLabel ?? '', radius: item.radiusKm ?? '',
  });
}

export default function WalletScreen({ route }) {
  const { t, formatDate, formatNumber } = useI18n();
  const [page, setPage] = useState(1);
  const wallet = useResource('/points', { events: 'points.changed,entitlements.changed' });
  const ledger = useResource(`/points/ledger?page=${page}&pageSize=10`, { events: 'points.changed' });
  const videos = useResource('/rewards/videos', { events: 'sponsored.changed,points.changed' });
  const [watching, setWatching] = useState(null);
  const requested = useRef(route?.query.get('video'));
  useEffect(() => {
    const match = requested.current && videos.data?.videos.find(item => item.id === requested.current);
    if (!match) return;
    requested.current = null;
    setWatching(match);
    history.replaceState(null, '', '#wallet');
  }, [videos.data]);
  const earn = wallet.data?.rules.earn;
  const today = videos.data?.today;
  const capped = today && today.completed >= today.cap;
  return (
    <div className="container">
      <PageHeader eyebrow={t('monetization.store.eyebrow')} title={t('monetization.wallet.title')} subtitle={t('monetization.wallet.subtitle')}
        actions={<a className="btn btn-secondary" href="#store">{t('monetization.wallet.storeLink')}</a>} />
      {wallet.error && <ErrorState message={wallet.error} onRetry={wallet.reload} />}
      {!wallet.data && !wallet.error ? <Spinner label={t('monetization.wallet.loading')} /> : wallet.data && <>
        <dl className="metric-grid wallet-balance"><div className="card"><dt>{t('monetization.wallet.balance')}</dt>
          <dd>{t('monetization.wallet.points', { count: wallet.data.balance })}</dd></div></dl>
        <section className="detail-section" aria-labelledby="wallet-earn">
          <h2 className="heading-md" id="wallet-earn">{t('monetization.wallet.earnTitle')}</h2>
          <ul className="wallet-earn">
            {(earn.referralInviter > 0 || earn.referralInvitee > 0) && <li>{t('monetization.wallet.earnInvite', {
              inviter: formatNumber(earn.referralInviter), invitee: formatNumber(earn.referralInvitee),
            })} <a href="#invite">{t('monetization.wallet.inviteLink')}</a></li>}
            {earn.appRating > 0 && <li>{t('monetization.wallet.earnRate', { points: formatNumber(earn.appRating) })} <a href="#help?view=rate">{t('monetization.wallet.rateLink')}</a></li>}
            {earn.rewardedVideoDailyCap > 0 && <li>{t('monetization.wallet.earnVideo', {
              points: formatNumber(earn.rewardedVideo), cap: formatNumber(earn.rewardedVideoDailyCap),
            })}</li>}
          </ul>
        </section>
      </>}
      <section className="detail-section" aria-labelledby="wallet-videos">
        <h2 className="heading-md" id="wallet-videos">{t('monetization.wallet.videosTitle')}</h2>
        {videos.error && <ErrorState message={videos.error} onRetry={videos.reload} />}
        {!videos.data && !videos.error ? <Spinner label={t('monetization.wallet.videosTitle')} /> : videos.data && <>
          <p>{t('monetization.wallet.videosToday', { completed: formatNumber(today.completed), cap: formatNumber(today.cap) })}</p>
          {capped && <p className="status-message">{t('monetization.wallet.capReached')}</p>}
          {!videos.data.videos.length ? <p className="body-muted">{t('monetization.wallet.videosEmpty')}</p>
            : <ul className="wallet-videos">{videos.data.videos.map(video => <li className="card" key={video.id}>
              <p className="sponsored-byline"><span className="tag tag-sponsored">{t('monetization.sponsored.label')}</span>
                <span>{t('monetization.sponsored.by', { sponsor: video.sponsorName })}</span></p>
              <h3>{video.title}</h3>
              <p className="body-muted">{video.body}</p>
              <button className="btn btn-secondary" type="button" disabled={capped} onClick={() => setWatching(video)}
                aria-label={t('monetization.wallet.watchNamed', { title: video.title, points: formatNumber(video.rewardPoints) })}>
                {t('monetization.wallet.watch')}</button>
            </li>)}</ul>}
        </>}
      </section>
      {wallet.data && <section className="detail-section" aria-labelledby="wallet-promotions">
        <h2 className="heading-md" id="wallet-promotions">{t('monetization.wallet.promotionsTitle')}</h2>
        {!wallet.data.promotions.length ? <p className="body-muted">{t('monetization.wallet.promotionsEmpty')}</p>
          : <ul className="inline-list wallet-promotions">{wallet.data.promotions.map(item => <li key={item.id}>
            <strong>{promotionText(t, item)}</strong>
            <span className="body-muted">{item.active ? t('monetization.wallet.active', { date: formatDate(item.endsAt) })
              : new Date(item.startsAt) > new Date() ? t('monetization.wallet.scheduled', { date: formatDate(item.startsAt) })
                : t('monetization.wallet.ended', { date: formatDate(item.endsAt) })}</span>
          </li>)}</ul>}
      </section>}
      <section className="detail-section" aria-labelledby="wallet-history">
        <h2 className="heading-md" id="wallet-history">{t('monetization.wallet.historyTitle')}</h2>
        {ledger.error && <ErrorState message={ledger.error} onRetry={ledger.reload} />}
        {!ledger.data && !ledger.error ? <Spinner label={t('monetization.wallet.historyTitle')} /> : ledger.data && (!ledger.data.entries.length
          ? <p className="body-muted">{t('monetization.wallet.historyEmpty')}</p> : <>
            <div className="table-wrap"><table>
              <caption>{t('monetization.wallet.historyCaption')}</caption>
              <thead><tr><th scope="col">{t('monetization.wallet.date')}</th><th scope="col">{t('monetization.wallet.reason')}</th>
                <th scope="col">{t('monetization.wallet.change')}</th><th scope="col">{t('monetization.wallet.balanceAfter')}</th></tr></thead>
              <tbody>{ledger.data.entries.map(entry => <tr key={entry.id}>
                <th scope="row">{formatDate(entry.createdAt)}</th>
                <td>{t(`monetization.wallet.reasons.${entry.reason}`)}{entry.reason === 'event_grant' && entry.note ? `: ${entry.note}` : ''}</td>
                <td>{entry.delta > 0 ? '+' : '\u2212'}{formatNumber(Math.abs(entry.delta))}</td>
                <td>{formatNumber(entry.balanceAfter)}</td>
              </tr>)}</tbody>
            </table></div>
            <Pagination pagination={ledger.data.pagination} onPage={setPage} disabled={ledger.loading} label={t('monetization.wallet.historyPages')} />
          </>)}
      </section>
      <RewardedVideoDialog video={watching} onClose={() => setWatching(null)} onEarned={() => { wallet.reload(); videos.reload(); ledger.reload(); }} />
    </div>
  );
}
