import { useI18n } from '../../lib/i18n.js';
import Icon from '../Icon.jsx';

export default function MarketplaceNav({ tab }) {
  const { t } = useI18n();
  const current = window.location.hash.slice(1).split('?')[0];
  return <>
    <nav className="discovery-tabs marketplace-tabs" aria-label={t('marketplace.tabs.label')}>
      {['gear', 'lessons', 'services', 'endorsements'].map(id => <a key={id} href={`#marketplace?tab=${id}`}
        aria-current={tab === id ? 'page' : undefined}>{t(`marketplace.tabs.${id}`)}</a>)}
    </nav>
    <nav className="marketplace-toolbar" aria-label={t('marketplace.toolbar.label')}>
      <a className="btn btn-primary" href="#new-listing" aria-current={current === 'new-listing' ? 'page' : undefined}>
        <Icon name="plus" size={17} />{t('marketplace.toolbar.newListing')}</a>
      <a className="btn btn-secondary" href="#my-listings" aria-current={current === 'my-listings' ? 'page' : undefined}>{t('marketplace.toolbar.myListings')}</a>
      <a className="btn btn-secondary" href="#saved-listings" aria-current={current === 'saved-listings' ? 'page' : undefined}>
        <Icon name="bookmark" size={15} />{t('marketplace.toolbar.savedListings')}</a>
    </nav>
  </>;
}
