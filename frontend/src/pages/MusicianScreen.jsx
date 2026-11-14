import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import ProfileDetails from '../components/ProfileDetails.jsx';
import ShareButton from '../components/ShareButton.jsx';
import ReportButton from '../components/ReportButton.jsx';
import BlockButton from '../components/BlockButton.jsx';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

export default function MusicianScreen({ route }) {
  const id = route.query.get('id');
  const { t } = useI18n();
  const resource = useResource(`/profiles/${encodeURIComponent(id || 'missing')}`, { events: 'profiles.changed' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const profile = resource.data;
  const mine = profile?.userId === nucleus.payload.persona?.userId;
  useEffect(() => {
    if (!profile || mine) return;
    conduit.transmit('/analytics/events', { method: 'POST', auth: true, body: { kind: 'profile_view', resourceId: profile.id } })
      .catch(failure => { console.warn('Profile view measurement failed', failure); setError(errorText(failure)); });
  }, [profile?.id, mine]);
  const act = async (message) => {
    setBusy(true); setError('');
    try {
      if (message) {
        const result = await conduit.transmit('/conversations', { method: 'POST', auth: true, body: { recipientUserId: profile.userId } });
        window.location.hash = `#messages?id=${result.id}`;
      } else {
        await conduit.transmit(`/profiles/${profile.userId}/follow`, { method: profile.isFollowing ? 'DELETE' : 'POST', auth: true });
        resource.reload();
      }
    } catch (failure) {
      setError(errorText(failure));
    } finally { setBusy(false); }
  };
  return (
    <div className="container">
      <PageHeader eyebrow={t('musicians.profile.eyebrow')} title={profile?.artistName || t('app.routes.musician')} />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {!profile && !resource.error ? <Spinner label={t('musicians.profile.loading')} /> : profile && (
        <article className="card">
          {profile.isBlocked && <p className="status-message">{t('profileExtras.block.notice')}</p>}
          <ProfileDetails profile={profile} showName={false} />
          <div className="compact-actions">
            {mine ? <a className="btn btn-secondary" href="#edit-profile">{t('app.routes.editProfile')}</a> : <>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => act(true)}>{t('musicians.profile.message')}</button>
              {!profile.isBlocked && <button className="btn btn-secondary" type="button" disabled={busy} aria-pressed={profile.isFollowing} onClick={() => act(false)}>{profile.isFollowing ? t('musicians.profile.unfollow') : t('musicians.profile.follow')}</button>}
              <BlockButton userId={profile.userId} name={profile.artistName || t('app.routes.musician')} blocked={profile.isBlocked} onChanged={resource.reload} />
              <ReportButton userId={profile.userId} name={profile.artistName || t('ui.report.thisMusician')} />
            </>}
            <ShareButton title={profile.artistName || t('musicians.profile.shareTitle')} />
          </div>
        </article>
      )}
    </div>
  );
}
