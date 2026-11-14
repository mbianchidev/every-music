import { useI18n } from '../lib/i18n.js';

const digits = value => value.replace(/[^0-9]/g, '');

function contactLinks(contacts, t) {
  const items = [];
  if (contacts.telegramId) {
    items.push({ key: 'telegram', label: t('profileExtras.contacts.telegram'), text: contacts.telegramId,
      href: `https://t.me/${encodeURIComponent(contacts.telegramId.replace(/^@/, ''))}` });
  }
  if (contacts.whatsapp) {
    items.push({ key: 'whatsapp', label: t('profileExtras.contacts.whatsapp'), text: contacts.whatsapp, href: `https://wa.me/${digits(contacts.whatsapp)}` });
  }
  if (contacts.signal) items.push({ key: 'signal', label: t('profileExtras.contacts.signal'), text: contacts.signal });
  if (contacts.phone) items.push({ key: 'phone', label: t('profileExtras.contacts.phone'), text: contacts.phone, href: `tel:${contacts.phone.replace(/[^0-9+]/g, '')}` });
  return items;
}

// Age, open-to status, follower counts, contacts and content links for a
// profile. Owners also see what other musicians can see on their plan.
export default function ProfileExtras({ profile }) {
  const { t, formatNumber } = useI18n();
  const contacts = profile.contacts ? contactLinks(profile.contacts, t) : [];
  const display = profile.publicDisplay;
  const hidden = display ? display.hiddenLinks + display.hiddenProjects : 0;
  return (
    <>
      <div className="profile-facts">
        {profile.openToProjects && <span className="tag tag-open">{t('profileExtras.openToProjects')}</span>}
        {profile.age && <span>{t('profileExtras.age', { age: profile.age })}</span>}
        <span>{t('profileExtras.followers', { count: profile.followersCount ?? 0, formatted: formatNumber(profile.followersCount ?? 0) })}</span>
        <span>{t('profileExtras.following', { count: profile.followingCount ?? 0, formatted: formatNumber(profile.followingCount ?? 0) })}</span>
      </div>
      {contacts.length > 0 && <section className="detail-section">
        <h2 className="heading-md">{t('profileExtras.contacts.heading')}</h2>
        {profile.contactVisibility && <p className="field-hint">{t(`profileExtras.contacts.visibleTo.${profile.contactVisibility}`)}</p>}
        <dl className="contact-list">{contacts.map(item => <div key={item.key}>
          <dt>{item.label}</dt>
          <dd>{item.href ? <a href={item.href} target={item.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">{item.text}</a> : item.text}</dd>
        </div>)}</dl>
      </section>}
      {profile.links?.length > 0 && <section className="detail-section">
        <h2 className="heading-md">{t('profileExtras.links.heading')}</h2>
        <ul className="profile-links">{profile.links.map(link => <li key={link.id}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">{t(`profileExtras.links.types.${link.linkType}`)}</a>
          <span className="field-hint">{(() => { try { return new URL(link.url).hostname; } catch { return ''; } })()}</span>
        </li>)}</ul>
      </section>}
      {hidden > 0 && <p className="status-message">{t('profileExtras.publicLimit', {
        links: display.maxContentShown ?? 0, projects: display.maxProjectsShown ?? 0, hidden,
      })}</p>}
    </>
  );
}
