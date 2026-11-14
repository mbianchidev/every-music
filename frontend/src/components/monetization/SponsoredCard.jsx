import conduit from '../../lib/conduit.js';
import ManagedImage from '../ManagedImage.jsx';
import { safeExternalUrl } from '../../lib/monetization.js';
import { useI18n } from '../../lib/i18n.js';

// A first-party sponsored card. Clicks are counted as anonymous daily totals.
export default function SponsoredCard({ card }) {
  const { t } = useI18n();
  const link = safeExternalUrl(card.linkUrl);
  const count = () => {
    conduit.transmit(`/sponsored/${card.id}/click`, { method: 'POST' })
      .catch(failure => console.warn('The sponsored card click was not counted', failure));
  };
  return (
    <article className="card sponsored-card" aria-label={t('monetization.sponsored.region', { title: card.title })}>
      <p className="sponsored-byline"><span className="tag tag-sponsored">{t('monetization.sponsored.label')}</span>
        <span>{t('monetization.sponsored.by', { sponsor: card.sponsorName })}</span></p>
      <div className="call-card-heading">
        <h2 className="heading-md">{card.title}</h2>
        {card.imageUrl && <ManagedImage className="call-thumbnail" src={card.imageUrl} alt={card.imageAlt || ''} width="72" height="72" loading="lazy" />}
      </div>
      <p className="announcement-description">{card.body}</p>
      <div className="card-footer">
        {link && <a className="text-link" href={link} target="_blank" rel="sponsored noopener noreferrer" onClick={count}>
          {card.linkLabel || t('monetization.sponsored.learnMore')}<span className="sr-only"> {t('monetization.sponsored.newTab')}</span>
        </a>}
        {card.rewarded && <a className="btn btn-secondary" href={`#wallet?video=${encodeURIComponent(card.id)}`}>
          {t('monetization.sponsored.watch', { points: card.rewardPoints })}</a>}
      </div>
    </article>
  );
}
