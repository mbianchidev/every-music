import { useI18n } from '../lib/i18n.js';
import Avatar from './Avatar.jsx';

function period(t, formatDate, member) {
  const from = member.joinedOn ? formatDate(`${member.joinedOn}T00:00:00`, { year: 'numeric', month: 'short' }) : null;
  const to = member.leftOn ? formatDate(`${member.leftOn}T00:00:00`, { year: 'numeric', month: 'short' }) : null;
  if (from && to) return t('organizations.members.between', { from, to });
  if (from) return t('organizations.members.since', { date: from });
  if (to) return t('organizations.members.until', { date: to });
  return '';
}

// Public line-up and member timeline of a page.
export default function OrganizationMembers({ organization }) {
  const { t, formatDate } = useI18n();
  const row = member => (
    <li key={member.memberId} className="member-row">
      <Avatar name={member.name} src={member.pictureUrl} />
      <div>
        <a href={`#musician?id=${member.userId}`}>{member.name}</a>
        <p className="body-muted">{[member.title, member.role !== 'member' && t(`organizations.roles.${member.role}`), period(t, formatDate, member)].filter(Boolean).join(' / ')}</p>
      </div>
    </li>
  );
  if (!organization.members.length && !organization.history.length) return null;
  return (
    <section className="detail-section" aria-labelledby="members-heading">
      <h2 className="heading-md" id="members-heading">{organization.kind === 'band' ? t('organizations.members.lineup') : t('organizations.members.team')}</h2>
      <ul className="member-list">{organization.members.map(row)}</ul>
      {!!organization.history.length && <>
        <h3>{t('organizations.members.history')}</h3>
        <ul className="member-list">{organization.history.map(row)}</ul>
      </>}
    </section>
  );
}
