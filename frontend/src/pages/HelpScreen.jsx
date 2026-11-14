import { useState } from 'react';
import nucleus from '../lib/nucleus.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { CLIENT_VERSION, versionStatus } from '../lib/app-version.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import Pagination from '../components/Pagination.jsx';
import Icon from '../components/Icon.jsx';
import SupportForm from '../components/SupportForm.jsx';
import RateApp from '../components/RateApp.jsx';
import UpdateInstructions from '../components/UpdateInstructions.jsx';
import { LEGAL_PAGES } from './LegalScreen.jsx';

const FORMS = ['bug', 'contact', 'work'];
const VIEWS = [...FORMS, 'requests', 'updates', 'rate'];
const SIGNED_IN_VIEWS = new Set(['requests', 'rate']);

function SignInPrompt() {
  const { t } = useI18n();
  return <p className="status-message">{t('help.requests.signIn')} <a href="#login">{t('help.requests.signInLink')}</a></p>;
}

function SupportRequests() {
  const { t, formatDate } = useI18n();
  const [page, setPage] = useState(1);
  const resource = useResource(`/support/me?page=${page}&pageSize=10`, { events: 'support.changed' });
  if (resource.error) return <ErrorState message={resource.error} onRetry={resource.reload} />;
  if (!resource.data) return <Spinner label={t('common.actions.loading')} />;
  if (!resource.data.requests.length) return <p>{t('help.requests.empty')}</p>;
  return <>
    <ul className="support-requests">
      {resource.data.requests.map(item => <li className="card" key={item.id}>
        <h2 className="heading-md">{item.subject}</h2>
        <p className="support-meta">
          <span>{t(`help.kinds.${item.kind}`)}</span><span>{t(`help.status.${item.status}`)}</span>
          <time dateTime={item.createdAt}>{t('help.requests.sent', { date: formatDate(item.createdAt) })}</time>
        </p>
        {item.replyNote ? <>
          <h3>{t('help.requests.reply')}</h3>
          <p className="detail-text">{item.replyNote}</p>
          {item.answeredAt && <p className="field-hint">{t('help.requests.answered', { date: formatDate(item.answeredAt) })}</p>}
        </> : <p className="body-muted">{t('help.requests.noReply')}</p>}
      </li>)}
    </ul>
    <Pagination pagination={resource.data.pagination} onPage={setPage} disabled={resource.loading} label={t('help.requests.pages')} />
  </>;
}

function VersionDetails() {
  const { t } = useI18n();
  const resource = useResource('/app/version', { auth: false });
  const status = versionStatus(resource.data);
  return <>
    <ul className="link-list version-facts">
      <li>{t('help.version.client', { version: CLIENT_VERSION })}</li>
      {resource.data && <li>{t('help.version.server', { version: resource.data.serverVersion })}</li>}
    </ul>
    {resource.error && <p className="field-error" role="alert">{t('help.version.unknown')} {resource.error} <button className="text-link" type="button" onClick={resource.reload}>{t('common.actions.retry')}</button></p>}
    {resource.data && <p className={status === 'current' ? 'success' : 'status-message'} role="status">
      {status === 'available' || status === 'required' ? t('help.version.available', { version: resource.data.latestClientVersion || resource.data.minimumClientVersion }) : t('help.version.current')}
    </p>}
    <UpdateInstructions updateUrl={resource.data?.updateUrl} />
  </>;
}

function Home({ authorized }) {
  const { t } = useI18n();
  return <>
    <section className="detail-section" aria-labelledby="help-contact">
      <h2 className="heading-md" id="help-contact">{t('help.sections.contact')}</h2>
      <ul className="help-options">
        {FORMS.map(kind => <li key={kind}>
          <a href={`#help?view=${kind}`}><span className="help-option-title">{t(`help.cards.${kind}.title`)}</span>
            <span className="help-option-body">{t(`help.cards.${kind}.body`)}</span><Icon name="chevron" size={18} /></a>
        </li>)}
      </ul>
    </section>
    {authorized && <section className="detail-section" aria-labelledby="help-account">
      <h2 className="heading-md" id="help-account">{t('help.sections.account')}</h2>
      <ul className="link-list">
        <li><button className="text-link" type="button" onClick={() => window.dispatchEvent(new CustomEvent('everymusic:start-tour'))}>{t('help.account.tour')}</button>
          <span className="field-hint"> {t('help.account.tourHint')}</span></li>
        <li><a href="#help?view=requests">{t('help.account.requests')}</a></li>
        <li><a href="#help?view=rate">{t('help.account.rate')}</a></li>
        <li><a href="#settings">{t('help.account.data')}</a><span className="field-hint"> {t('help.account.dataHint')}</span></li>
      </ul>
    </section>}
    <section className="detail-section" aria-labelledby="help-policies">
      <h2 className="heading-md" id="help-policies">{t('help.sections.policies')}</h2>
      <ul className="link-list">
        {Object.keys(LEGAL_PAGES).map(page => <li key={page}><a href={`#legal?page=${page}`}>{t(`help.links.${page}`)}</a></li>)}
      </ul>
    </section>
    <section className="detail-section" aria-labelledby="help-version">
      <h2 className="heading-md" id="help-version">{t('help.sections.version')}</h2>
      <p>{t('help.version.client', { version: CLIENT_VERSION })} <a href="#help?view=updates">{t('help.version.updates')}</a></p>
    </section>
  </>;
}

export default function HelpScreen({ route }) {
  const { t } = useI18n();
  const requested = route.query.get('view');
  const view = VIEWS.includes(requested) ? requested : null;
  const authorized = nucleus.authorized;
  const title = view ? t(`help.views.${view}`) : t('help.title');
  return (
    <div className="container help-page">
      <PageHeader eyebrow={t('help.eyebrow')} title={title} subtitle={view ? undefined : t('help.subtitle')} />
      {!view && <Home authorized={authorized} />}
      {FORMS.includes(view) && <SupportForm key={view} kind={view} authorized={authorized} />}
      {SIGNED_IN_VIEWS.has(view) && !authorized && <SignInPrompt />}
      {view === 'requests' && authorized && <SupportRequests />}
      {view === 'rate' && authorized && <RateApp />}
      {view === 'updates' && <VersionDetails />}
    </div>
  );
}
