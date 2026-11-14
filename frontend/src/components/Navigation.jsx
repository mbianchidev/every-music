import { useEffect, useRef, useState } from 'react';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import { useI18n } from '../lib/i18n.js';

const sections = [
  { id: 'discover', items: [
    { id: 'feed', icon: 'feed', labelKey: 'app.nav.feed' },
    { id: 'musicians', icon: 'people', labelKey: 'app.nav.musicians' },
    { id: 'marketplace', icon: 'tag', labelKey: 'marketplace.nav.marketplace' },
    { id: 'organizations', icon: 'wave', labelKey: 'organizations.nav.discover' },
    { id: 'events', icon: 'calendar', labelKey: 'events.nav.events' },
    { id: 'messages', icon: 'message', labelKey: 'app.nav.messages' },
    { id: 'notifications', icon: 'bell', labelKey: 'app.nav.notifications' },
  ] },
  { id: 'yourSpace', items: [
    { id: 'my-posts', icon: 'post', labelKey: 'app.nav.myPosts' },
    { id: 'applications', icon: 'inbox', labelKey: 'applications.nav' },
    { id: 'saved', icon: 'bookmark', labelKey: 'app.nav.saved' },
    { id: 'your-pages', icon: 'feed', labelKey: 'organizations.nav.yours' },
    { id: 'calendar', icon: 'calendar', labelKey: 'calendar.nav.myCalendar' },
    { id: 'profile', icon: 'user', labelKey: 'app.nav.profile' },
    { id: 'analytics', icon: 'chart', labelKey: 'app.nav.analytics' },
    { id: 'store', icon: 'star', labelKey: 'monetization.nav.store' },
    { id: 'invite', icon: 'people', labelKey: 'monetization.nav.invite' },
    { id: 'help', icon: 'help', labelKey: 'app.nav.help' },
    { id: 'settings', icon: 'settings', labelKey: 'app.nav.settings' },
  ] },
];

export default function Navigation({ routeName, unreadCount = 0, isAdmin = false }) {
  const { t } = useI18n();
  const dialog = useRef(null);
  const trigger = useRef(null);
  const navigating = useRef(false);
  const [open, setOpen] = useState(false);
  const groups = [sections[0], { ...sections[1], items: [
    ...sections[1].items.slice(0, -1), { id: 'reports', icon: 'shield', labelKey: 'app.nav.reports' },
    ...(isAdmin ? [{ id: 'admin', icon: 'shield', labelKey: 'app.nav.admin' }] : []),
    sections[1].items.at(-1),
  ] }];
  useEffect(() => { if (dialog.current?.open) dialog.current.close(); }, [isAdmin]);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)');
    const resize = () => { if (wide.matches && dialog.current?.open) dialog.current.close(); };
    wide.addEventListener('change', resize);
    return () => wide.removeEventListener('change', resize);
  }, []);
  const current = ({ musician: 'musicians', announcement: 'feed', 'edit-profile': 'profile', 'edit-announcement': 'my-posts',
    listing: 'marketplace', 'new-listing': 'marketplace', 'edit-listing': 'marketplace', 'my-listings': 'marketplace', 'saved-listings': 'marketplace',
    organization: 'organizations', 'create-organization': 'your-pages', 'edit-organization': 'your-pages', 'organization-members': 'your-pages',
    wallet: 'store', event: 'events', 'new-event': 'events', 'edit-event': 'events', 'my-events': 'events' })[routeName] || routeName;
  const close = () => dialog.current.close();
  const navigate = event => {
    navigating.current = event.currentTarget.hash !== window.location.hash;
    close();
  };
  const link = (item, mobile = false) => (
    <a key={item.id} className={`nav-item ${current === item.id ? 'nav-item-active' : ''}`} href={`#${item.id}`}
      aria-current={routeName === item.id ? 'page' : undefined} onClick={mobile ? navigate : undefined}>
      <Icon name={item.icon} /><span>{t(item.labelKey)}</span>
      {item.id === 'notifications' && unreadCount > 0 && <span className="nav-badge" aria-label={t('app.nav.unread', { count: unreadCount })}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </a>
  );
  const links = (mobile = false) => groups.map(section => <div className="nav-group" key={section.id}>
    <p className="nav-group-label">{t(`app.nav.sections.${section.id}`)}</p>
    {section.items.map(item => link(item, mobile))}
  </div>);
  return (
    <>
      <aside className="sidebar">
        <Brand />
        <p className="sidebar-caption">{t('app.nav.caption')}</p>
        <a className="btn btn-primary nav-publish" href="#create" aria-current={routeName === 'create' ? 'page' : undefined}><Icon name="plus" />{t('app.nav.post')}</a>
        <nav className="desktop-nav" aria-label={t('app.nav.primary')}>{links()}</nav>
        <div className="sidebar-footer"><Icon name="wave" size={16} /><span>{t('app.nav.footer')}</span></div>
      </aside>
      <nav className="mobile-nav" aria-label={t('app.nav.primary')}>
        {link({ id: 'feed', icon: 'feed', labelKey: 'app.nav.feed' })}
        {link({ id: 'musicians', icon: 'people', labelKey: 'app.nav.musicians' })}
        {link({ id: 'create', icon: 'plus', labelKey: 'app.nav.post' })}
        {link({ id: 'messages', icon: 'message', labelKey: 'app.nav.messages' })}
        <button ref={trigger} className={`nav-item ${groups[1].items.some(item => item.id === current) || current === 'notifications' ? 'nav-item-active' : ''}`} type="button" aria-label={t('app.nav.moreLabel')} aria-haspopup="dialog"
          aria-expanded={open} aria-controls="workspace-navigation"
          onClick={() => { dialog.current.showModal(); setOpen(true); }}><Icon name="more" /><span>{t('app.nav.more')}</span>{unreadCount > 0 && <span className="mobile-unread" aria-hidden="true" />}</button>
      </nav>
      <dialog ref={dialog} id="workspace-navigation" className="nav-dialog" aria-labelledby="navigation-title" onClose={() => {
        setOpen(false);
        if (navigating.current) document.getElementById('main-content')?.focus();
        else if (window.matchMedia('(min-width: 1024px)').matches) {
          const target = document.querySelector('.sidebar [aria-current="page"], .desktop-nav .nav-item-active') || document.getElementById('main-content');
          target?.focus();
        }
        else trigger.current?.focus();
        navigating.current = false;
      }}
        onKeyDown={event => {
          if (event.key !== 'Tab') return;
          const items = event.currentTarget.querySelectorAll('a[href], button:not(:disabled)');
          const first = items[0];
          const last = items[items.length - 1];
          // A scrollable native dialog can otherwise join its own tab order.
          if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault(); last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
          }
        }}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
        }}>
        <div className="dialog-heading"><h2 id="navigation-title">{t('app.nav.workspace')}</h2><button className="icon-button" type="button" onClick={close} aria-label={t('app.nav.close')}><Icon name="close" /></button></div>
        <a className="btn btn-primary nav-publish" href="#create" onClick={navigate}><Icon name="plus" />{t('app.nav.postCall')}</a>
        <nav aria-label={t('app.nav.all')}>{links(true)}</nav>
      </dialog>
    </>
  );
}
