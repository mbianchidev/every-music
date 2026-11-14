import { useState } from 'react';
import { useI18n } from '../../lib/i18n.js';
import { useResource } from '../../lib/resources.js';
import Spinner from '../Spinner.jsx';
import ErrorState from '../ErrorState.jsx';
import Pagination from '../Pagination.jsx';
import ListingModerationButton from './ListingModerationButton.jsx';

export default function MarketplaceModeration() {
  const { t, formatDate } = useI18n();
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const resource = useResource(`/admin/marketplace/reports?status=open&page=${page}&pageSize=10`, { events: 'admin.changed,marketplace.changed' });
  const data = resource.data;
  return <section className="detail-section marketplace-moderation" aria-labelledby="marketplace-moderation-heading">
    <h2 className="heading-md" id="marketplace-moderation-heading" tabIndex="-1">{t('marketplace.moderation.title')}</h2>
    <p className="body-muted">{t('marketplace.moderation.intro')}</p>
    {message && <p className="success" role="status">{message}</p>}
    {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
    {!data && !resource.error ? <Spinner label={t('marketplace.moderation.loading')} /> : data && <>
      {!data.reports.length ? <p>{t('marketplace.moderation.empty')}</p> : <div className="table-wrap"><table>
        <caption>{t('marketplace.moderation.caption')}</caption>
        <thead><tr>
          <th scope="col">{t('marketplace.moderation.listing')}</th><th scope="col">{t('marketplace.moderation.seller')}</th>
          <th scope="col">{t('marketplace.moderation.reason')}</th><th scope="col">{t('marketplace.moderation.submitted')}</th>
          <th scope="col">{t('marketplace.moderation.actions')}</th>
        </tr></thead>
        <tbody>{data.reports.map(report => <tr key={report.id}>
          <th scope="row"><a href={`#listing?id=${report.listingId}`}>{report.listingTitle}</a></th>
          <td>{report.sellerName}</td>
          <td>{t(`marketplace.report.reasons.${report.category}`)}</td>
          <td><time dateTime={report.createdAt}>{formatDate(report.createdAt)}</time></td>
          <td><div className="table-actions">
            <a href={`#admin?tab=reports&id=${report.id}`} aria-label={t('marketplace.moderation.reviewLabel', { title: report.listingTitle })}>{t('marketplace.moderation.review')}</a>
            {report.listingRemoved ? <span>{t('marketplace.moderation.removed')}</span>
              : <ListingModerationButton className="text-link" listing={{ id: report.listingId, title: report.listingTitle }} onRemoved={() => {
                setMessage(t('marketplace.moderation.done'));
                document.getElementById('marketplace-moderation-heading')?.focus();
                resource.reload();
              }} />}
          </div></td>
        </tr>)}</tbody>
      </table></div>}
      <Pagination pagination={data.pagination} disabled={resource.loading} onPage={setPage} label={t('marketplace.moderation.pages')} />
    </>}
  </section>;
}
