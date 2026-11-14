import { useI18n } from '../lib/i18n.js';
import { CLIENT_VERSION } from '../lib/app-version.js';

const LINKS = [
  ['#help', 'help'], ['#legal?page=about', 'about'], ['#legal?page=privacy', 'privacy'],
  ['#legal?page=cookies', 'cookies'], ['#legal?page=terms', 'terms'], ['#legal?page=gdpr', 'gdpr'],
];

export default function SiteFooter({ routeName, page }) {
  const { t } = useI18n();
  const current = href => {
    const [name, query = ''] = href.slice(1).split('?');
    return name === routeName && (name !== 'legal' || new URLSearchParams(query).get('page') === page) ? 'page' : undefined;
  };
  return (
    <footer className="site-footer">
      <nav aria-label={t('onboarding.footer.label')}>
        <ul>{LINKS.map(([href, key]) => <li key={key}><a href={href} aria-current={current(href)}>{t(`onboarding.footer.${key}`)}</a></li>)}</ul>
      </nav>
      <p>{t('common.appName')} <span aria-hidden="true">/</span> {t('onboarding.footer.version', { version: CLIENT_VERSION })}</p>
    </footer>
  );
}
