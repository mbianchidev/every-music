import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import nucleus from '../lib/nucleus.js';
import PageHeader from '../components/PageHeader.jsx';

export const LEGAL_PAGES = {
  about: ['what', 'how', 'who', 'brand'],
  work: ['intro', 'contribute', 'apply'],
  gdpr: ['controller', 'rights', 'exercise', 'deletion', 'complaints'],
  privacy: ['controller', 'data', 'purposes', 'sharing', 'retention', 'security', 'rights', 'children', 'changes'],
  cookies: ['summary', 'session', 'local', 'cache', 'third', 'control'],
  terms: ['agreement', 'eligibility', 'account', 'content', 'conduct', 'messaging', 'moderation', 'availability', 'liability', 'termination', 'changes', 'law'],
};
const SOURCE_URL = 'https://github.com/mbianchidev/every-music';

// Bodies are plain text: blank lines separate paragraphs and "- " lines form a list.
function Body({ text }) {
  return text.split('\n\n').map((block, index) => {
    const lines = block.split('\n');
    if (lines.every(line => line.startsWith('- '))) {
      return <ul key={index}>{lines.map(line => <li key={line}>{line.slice(2)}</li>)}</ul>;
    }
    return <p key={index}>{block}</p>;
  });
}

function actions(page, t, legal) {
  const authorized = nucleus.authorized;
  const link = (href, label, external = false) => <li key={href}>
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{label}{external && <span className="sr-only"> {t('legal.newTab')}</span>}</a>
  </li>;
  const email = legal?.operator.contactEmail;
  switch (page) {
    case 'about': return [link('#help?view=contact', t('legal.actions.contact')), link('/third-party-notices.txt', t('legal.actions.notices'), true), link(SOURCE_URL, t('legal.actions.source'), true)];
    case 'work': return [link('#help?view=work', t('legal.actions.apply')), link(`${SOURCE_URL}/blob/master/CONTRIBUTING.md`, t('legal.actions.source'), true)];
    case 'gdpr': return [
      authorized ? link('#settings', t('legal.actions.settings')) : link('#login', t('legal.actions.signInForSettings')),
      ...(authorized ? [link('#edit-profile', t('legal.actions.editProfile'))] : []),
      email ? link(`mailto:${email}`, t('legal.actions.emailOperator')) : link('#help?view=contact', t('legal.actions.contact')),
      link('#legal?page=privacy', t('help.links.privacy')),
    ];
    case 'privacy': return [link('#legal?page=gdpr', t('help.links.gdpr')), link('#legal?page=cookies', t('help.links.cookies'))];
    case 'cookies': return [link('#legal?page=privacy', t('help.links.privacy'))];
    default: return [link('#legal?page=privacy', t('help.links.privacy')), link('#help?view=contact', t('legal.actions.contact'))];
  }
}

export default function LegalScreen({ route }) {
  const { t, formatDate } = useI18n();
  const requested = route.query.get('page');
  const page = Object.hasOwn(LEGAL_PAGES, requested) ? requested : 'about';
  const legal = useResource('/legal', { auth: false });
  const missing = t('legal.notConfigured');
  const data = legal.data;
  const params = {
    name: data?.operator.name || missing,
    email: data?.operator.contactEmail || missing,
    jurisdiction: data?.operator.jurisdiction || missing,
    date: data?.effectiveDate ? formatDate(`${data.effectiveDate}T00:00:00Z`, { dateStyle: 'long', timeZone: 'UTC' }) : missing,
    version: data?.termsVersion || missing,
  };
  const base = `legal.pages.${page}`;
  return (
    <div className="container legal-page">
      <PageHeader eyebrow={t('legal.eyebrow')} title={t(`${base}.title`)} subtitle={t(`${base}.subtitle`)} />
      <nav className="discovery-tabs legal-tabs" aria-label={t('legal.nav')}>
        {Object.keys(LEGAL_PAGES).map(key => <a key={key} href={`#legal?page=${key}`} aria-current={key === page ? 'page' : undefined}>
          {t(`help.links.${key}`)}
        </a>)}
      </nav>
      <p className="status-message legal-template" role="note">{t('legal.template')}</p>
      <p className="body-muted">{t('legal.operator', params)}</p>
      {legal.error && <p className="field-error" role="alert">{t('legal.loadFailed')} {legal.error} <button className="text-link" type="button" onClick={legal.reload}>{t('common.actions.retry')}</button></p>}
      {!['about', 'work'].includes(page) && <dl className="legal-meta">
        <div><dt>{t('legal.effectiveLabel')}</dt><dd>{params.date}</dd></div>
        <div><dt>{t('legal.termsVersionLabel')}</dt><dd>{params.version}</dd></div>
      </dl>}
      <article className="legal-body">
        {LEGAL_PAGES[page].map(section => <section key={section} aria-labelledby={`legal-${section}`}>
          <h2 className="heading-md" id={`legal-${section}`}>{t(`${base}.sections.${section}.heading`)}</h2>
          <Body text={t(`${base}.sections.${section}.body`, params)} />
        </section>)}
      </article>
      <section className="detail-section" aria-labelledby="legal-related">
        <h2 className="heading-md" id="legal-related">{t('legal.related')}</h2>
        <ul className="link-list">{actions(page, t, data)}</ul>
      </section>
    </div>
  );
}
