import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useResource } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';
import Avatar from './Avatar.jsx';
import ErrorState from './ErrorState.jsx';
import Pagination from './Pagination.jsx';
import Spinner from './Spinner.jsx';
import { errorText } from '../lib/error-text.js';

export default function BlockedUsers() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const resource = useResource(`/blocks?page=${page}&pageSize=20`, { events: 'blocks.changed' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const unblock = async person => {
    setBusy(person.userId); setError(''); setMessage('');
    try {
      await conduit.transmit(`/profiles/${person.userId}/block`, { method: 'DELETE', auth: true });
      setMessage(t('profileExtras.block.unblocked', { name: person.artistName }));
      document.getElementById('blocked-heading')?.focus();
      resource.reload();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(''); }
  };
  const rows = resource.data?.blocked || [];
  return (
    <section className="detail-section" aria-labelledby="blocked-heading">
      <h2 className="heading-md" id="blocked-heading" tabIndex="-1">{t('profileExtras.block.heading')}</h2>
      <p className="body-muted">{t('profileExtras.block.explanation')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('profileExtras.block.loading')} />
        : resource.data && (rows.length ? <ul className="person-list">{rows.map(person => <li key={person.userId}>
          <Avatar name={person.artistName} src={person.profilePictureUrl} />
          <a href={`#musician?id=${person.userId}`}>{person.artistName}</a>
          <button className="btn btn-ghost" type="button" disabled={busy === person.userId} onClick={() => unblock(person)}
            aria-label={t('profileExtras.block.unblockNamed', { name: person.artistName })}>{t('profileExtras.block.unblock')}</button>
        </li>)}</ul> : <p>{t('profileExtras.block.empty')}</p>)}
      <Pagination pagination={resource.data?.pagination} onPage={setPage} disabled={resource.loading} label={t('profileExtras.block.pages')} />
    </section>
  );
}
