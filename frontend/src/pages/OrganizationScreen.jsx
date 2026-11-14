import { useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { OPEN_TO, can, mapLinks, placeLabel } from '../lib/organizations.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import Avatar from '../components/Avatar.jsx';
import ManagedImage from '../components/ManagedImage.jsx';
import ShareButton from '../components/ShareButton.jsx';
import ReportButton from '../components/ReportButton.jsx';
import AnnouncementCard from '../components/AnnouncementCard.jsx';
import VerifiedBadge from '../components/VerifiedBadge.jsx';
import OrganizationMembers from '../components/OrganizationMembers.jsx';
import OrganizationPosts from '../components/OrganizationPosts.jsx';
import OrganizationReleases from '../components/OrganizationReleases.jsx';
import OrganizationRelations from '../components/OrganizationRelations.jsx';
import OrganizationPhotos from '../components/OrganizationPhotos.jsx';
import SimilarBands from '../components/SimilarBands.jsx';
import ClaimVenue from '../components/ClaimVenue.jsx';
import PastAndNextEvents from '../components/PastAndNextEvents.jsx';
import OrganizationVerificationRequest from '../components/OrganizationVerificationRequest.jsx';
import BandWorkspace from '../components/BandWorkspace.jsx';
import { errorText } from '../lib/error-text.js';

function Details({ organization }) {
  const { t, formatNumber } = useI18n();
  const rows = [];
  const venue = organization.venue;
  const band = organization.band;
  if (venue?.type) rows.push([t('organizations.fields.venueType'), t(`organizations.venueTypes.${venue.type}`)]);
  if (venue?.capacity) rows.push([t('organizations.fields.capacity'), formatNumber(venue.capacity)]);
  if (band?.formedYear) rows.push([t('organizations.fields.formedYear'), String(band.formedYear)]);
  if (organization.activeSince || organization.activeUntil) {
    rows.push([t('organizations.fields.yearsActive'), `${organization.activeSince ?? '?'} - ${organization.activeUntil ?? t('organizations.page.present')}`]);
  }
  const openTo = band ? OPEN_TO.filter(key => band.openTo[key]) : [];
  if (openTo.length) rows.push([t('organizations.fields.openTo'), openTo.map(key => t(`organizations.openTo.${key}`)).join(', ')]);
  if (venue?.parkingInfo) rows.push([t('organizations.fields.parkingInfo'), venue.parkingInfo]);
  if (venue?.directions) rows.push([t('organizations.fields.directions'), venue.directions]);
  if (!rows.length) return null;
  return <dl className="detail-list">{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd className="detail-text">{value}</dd></div>)}</dl>;
}

export default function OrganizationScreen({ route }) {
  const { t } = useI18n();
  const reference = route.query.get('id');
  const resource = useResource(`/organizations/${encodeURIComponent(reference || 'missing')}`, { events: 'organizations.changed' });
  const organization = resource.data;
  const announcements = useResource(organization ? `/organizations/${organization.id}/announcements?pageSize=6` : null, { events: 'announcements.changed' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const own = nucleus.payload.persona?.userId;
  const follow = async () => {
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/organizations/${organization.id}/follow`, { method: organization.isFollowing ? 'DELETE' : 'POST', auth: true });
      resource.reload();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const links = mapLinks(organization?.coordinates);
  const place = placeLabel(organization?.location);
  const member = Boolean(organization?.viewer?.role && organization.viewer.role !== 'maintainer');
  return (
    <div className="container">
      <PageHeader eyebrow={organization ? `${t(`organizations.kinds.${organization.kind}`)}${organization.managed ? '' : ` / ${t('organizations.card.unmanaged')}`}` : t('organizations.page.eyebrow')}
        title={organization?.name || t('organizations.page.eyebrow')} />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {!organization && !resource.error ? <Spinner label={t('organizations.page.loading')} /> : organization && <>
        <article className="card">
          <div className="profile-summary">
            {organization.pictureUrl ? <ManagedImage className="profile-image" src={organization.pictureUrl} alt={t('organizations.page.pictureAlt', { name: organization.name })} width="88" height="88" />
              : <Avatar name={organization.name} large />}
            <div>
              {organization.verified && <p><VerifiedBadge verified /></p>}
              {place && <p className="body-muted">{place}</p>}
              <p className="body-muted">{t('organizations.followers', { count: organization.followerCount })}</p>
            </div>
          </div>
          {organization.viewer.invited && <p className="status-message" role="status">{t('organizations.page.invited')} <a href="#your-pages">{t('organizations.page.respond')}</a></p>}
          <div className="compact-actions">
            <button className="btn btn-primary" type="button" disabled={busy} aria-pressed={organization.isFollowing} onClick={follow}>
              {organization.isFollowing ? t('organizations.page.unfollow') : t('organizations.page.follow')}
            </button>
            {can(organization, 'manage_profile') && <a className="btn btn-secondary" href={`#edit-organization?id=${organization.id}`}>{t('organizations.page.edit')}</a>}
            {member && <a className="btn btn-secondary" href={`#organization-members?id=${organization.id}`}>{t('organizations.page.members')}</a>}
            {can(organization, 'post_announcements') && organization.managed && <a className="btn btn-ghost" href={`#create?organization=${organization.id}`}>{t('organizations.page.announce')}</a>}
            <ShareButton title={organization.name} />
            {organization.reportUserId && organization.reportUserId !== own && <ReportButton userId={organization.reportUserId} name={organization.name} label={t('organizations.page.report')} />}
          </div>
          {!organization.managed && <section className="detail-section" aria-labelledby="community-heading">
            <h2 className="heading-md" id="community-heading">{t('organizations.page.communityTitle')}</h2>
            <p>{t('organizations.page.communityText', { name: organization.creatorName || t('organizations.page.someone') })}</p>
            <ClaimVenue organization={organization} onChanged={resource.reload} />
          </section>}
          {organization.bio && <section className="detail-section"><h2 className="heading-md">{t('organizations.page.about')}</h2><p className="detail-text">{organization.bio}</p></section>}
          <Details organization={organization} />
          {!!organization.genres.length && <div className="tag-list" aria-label={t('organizations.fields.genres')}>{organization.genres.map(genre => <span className="tag" key={genre.id}>{genre.name}</span>)}</div>}
          {links && <p className="compact-actions">
            <a href={links.map} target="_blank" rel="noopener noreferrer">{t('organizations.page.map')}</a>
            <a href={links.directions} target="_blank" rel="noopener noreferrer">{t('organizations.page.directions')}</a>
          </p>}
          {organization.workWithUs && <section className="detail-section"><h2 className="heading-md">{t('organizations.fields.workWithUs')}</h2><p className="detail-text">{organization.workWithUs}</p></section>}
          {(organization.contacts.email || organization.contacts.phone || organization.links.length > 0) && <section className="detail-section">
            <h2 className="heading-md">{t('organizations.page.contacts')}</h2>
            <ul className="inline-list">
              {organization.contacts.email && <li><a href={`mailto:${organization.contacts.email}`}>{organization.contacts.email}</a></li>}
              {organization.contacts.phone && <li><a href={`tel:${organization.contacts.phone.replace(/[^+\d]/g, '')}`}>{organization.contacts.phone}</a></li>}
              {organization.links.map((link, index) => <li key={index}><a href={link.url} target="_blank" rel="noopener noreferrer">{t(`organizations.linkTypes.${link.linkType}`)}</a></li>)}
            </ul>
          </section>}
        </article>
        <OrganizationMembers organization={organization} />
        {member && organization.kind === 'band' && <BandWorkspace organization={organization} route={route} />}
        {organization.kind === 'band' && <OrganizationReleases organization={organization} onChanged={resource.reload} />}
        {organization.managed && <OrganizationPosts organization={organization} />}
        <section className="detail-section" aria-labelledby="announcements-heading">
          <h2 className="heading-md" id="announcements-heading">{t('organizations.page.announcements')}</h2>
          {announcements.error && <ErrorState message={announcements.error} onRetry={announcements.reload} />}
          {announcements.data && (announcements.data.announcements.length
            ? <div className="grid">{announcements.data.announcements.map(post => <AnnouncementCard key={post.id} post={post} />)}</div>
            : <p className="body-muted">{t('organizations.page.noAnnouncements')}</p>)}
        </section>
        <OrganizationRelations organization={organization} onChanged={resource.reload} />
        {organization.kind === 'band' && <SimilarBands organization={organization} onChanged={resource.reload} />}
        <OrganizationPhotos organization={organization} onChanged={resource.reload} />
        <PastAndNextEvents subject={{ type: 'organization', id: organization.id }} />
        <OrganizationVerificationRequest organization={organization} />
      </>}
    </div>
  );
}
