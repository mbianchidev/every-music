import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Navigation from '../components/Navigation.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import ProfileDetails from '../components/ProfileDetails.jsx';
import ShareButton from '../components/ShareButton.jsx';

export default function MusicianScreen({ route }) {
  const id = route.query.get('id');
  const resource = useResource(`/profiles/${encodeURIComponent(id || 'missing')}`, { events: 'profiles.changed' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const profile = resource.data;
  const mine = profile?.userId === nucleus.payload.persona?.userId;
  useEffect(() => {
    if (!profile || mine) return;
    conduit.transmit('/analytics/events', { method: 'POST', auth: true, body: { kind: 'profile_view', resourceId: profile.id } })
      .catch(failure => { console.warn('Profile view measurement failed', failure); setError(failure.message); });
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
      setError(failure.message);
    } finally { setBusy(false); }
  };
  return (
    <div className="container">
      <PageHeader eyebrow="Musician profile" title={profile?.artistName || 'MUSICIAN'} />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {!profile && !resource.error ? <Spinner label="Loading musician" /> : profile && (
        <article className="card">
          <ProfileDetails profile={profile} showName={false} />
          <div className="compact-actions">
            {mine ? <a className="btn btn-secondary" href="#edit-profile">Edit profile</a> : <>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => act(true)}>Send message</button>
              <button className="btn btn-secondary" type="button" disabled={busy} aria-pressed={profile.isFollowing} onClick={() => act(false)}>{profile.isFollowing ? 'Unfollow' : 'Follow musician'}</button>
            </>}
            <ShareButton title={profile.artistName || 'Every.music musician'} />
          </div>
        </article>
      )}
      <Navigation active="feed" />
    </div>
  );
}
