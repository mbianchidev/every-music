import { useI18n } from '../lib/i18n.js';

// Instruments, message, and links shared by applicant and owner views.
export default function ApplicationDetails({ application, messageLabel, Heading = 'h3' }) {
  const { t } = useI18n();
  return (
    <div className="application-details">
      {!!application.instruments.length && <div>
        <Heading className="application-label">{t('applications.card.canCover')}</Heading>
        <div className="tag-list">{application.instruments.map(item => <span className="tag" key={item.instrumentId}>{item.name}</span>)}</div>
      </div>}
      {application.message && <div>
        <Heading className="application-label">{messageLabel || t('applications.card.message')}</Heading>
        <p className="detail-text">{application.message}</p>
      </div>}
      {!!application.links.length && <div>
        <Heading className="application-label">{t('applications.card.links')}</Heading>
        <ul className="application-links">{application.links.map((link, index) => (
          <li key={`${link.url}-${index}`}>
            <a href={link.url} target="_blank" rel="noopener noreferrer">{t(`applications.linkTypes.${link.linkType}`)}</a>
            <span className="field-hint">{link.url}</span>
          </li>
        ))}</ul>
      </div>}
    </div>
  );
}
