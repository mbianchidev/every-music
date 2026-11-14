import { useEffect, useRef, useState } from 'react';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';

const sections = [
  { label: 'Discover', items: [
    { id: 'feed', icon: 'feed', label: 'Feed' },
    { id: 'musicians', icon: 'people', label: 'Musicians' },
    { id: 'messages', icon: 'message', label: 'Messages' },
    { id: 'notifications', icon: 'bell', label: 'Notifications' },
  ] },
  { label: 'Your space', items: [
    { id: 'my-posts', icon: 'post', label: 'My calls' },
    { id: 'saved', icon: 'bookmark', label: 'Saved' },
    { id: 'profile', icon: 'user', label: 'Profile' },
    { id: 'analytics', icon: 'chart', label: 'Analytics' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ] },
];

export default function Navigation({ routeName, unreadCount = 0 }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const navigating = useRef(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)');
    const resize = () => { if (wide.matches && dialog.current?.open) dialog.current.close(); };
    wide.addEventListener('change', resize);
    return () => wide.removeEventListener('change', resize);
  }, []);
  const current = ({ musician: 'musicians', announcement: 'feed', 'edit-profile': 'profile', 'edit-announcement': 'my-posts' })[routeName] || routeName;
  const close = () => dialog.current.close();
  const navigate = event => {
    navigating.current = event.currentTarget.hash !== window.location.hash;
    close();
  };
  const link = (item, mobile = false) => (
    <a key={item.id} className={`nav-item ${current === item.id ? 'nav-item-active' : ''}`} href={`#${item.id}`}
      aria-current={routeName === item.id ? 'page' : undefined} onClick={mobile ? navigate : undefined}>
      <Icon name={item.icon} /><span>{item.label}</span>
      {item.id === 'notifications' && unreadCount > 0 && <span className="nav-badge" aria-label={`${unreadCount} unread`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </a>
  );
  const links = (mobile = false) => sections.map(section => <div className="nav-group" key={section.label}>
    <p className="nav-group-label">{section.label}</p>
    {section.items.map(item => link(item, mobile))}
  </div>);
  return (
    <>
      <aside className="sidebar">
        <Brand />
        <p className="sidebar-caption">Find your next sound.</p>
        <a className="btn btn-primary nav-publish" href="#create" aria-current={routeName === 'create' ? 'page' : undefined}><Icon name="plus" />Post</a>
        <nav className="desktop-nav" aria-label="Primary">{links()}</nav>
        <div className="sidebar-footer"><Icon name="wave" size={16} /><span>Made for making music.</span></div>
      </aside>
      <nav className="mobile-nav" aria-label="Primary">
        {link({ id: 'feed', icon: 'feed', label: 'Feed' })}
        {link({ id: 'musicians', icon: 'people', label: 'Musicians' })}
        {link({ id: 'create', icon: 'plus', label: 'Post' })}
        {link({ id: 'messages', icon: 'message', label: 'Messages' })}
        <button ref={trigger} className={`nav-item ${sections[1].items.some(item => item.id === current) || current === 'notifications' ? 'nav-item-active' : ''}`} type="button" aria-label="More navigation" aria-haspopup="dialog"
          aria-expanded={open} aria-controls="workspace-navigation"
          onClick={() => { dialog.current.showModal(); setOpen(true); }}><Icon name="more" /><span>More</span>{unreadCount > 0 && <span className="mobile-unread" aria-hidden="true" />}</button>
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
        <div className="dialog-heading"><h2 id="navigation-title">Your workspace</h2><button className="icon-button" type="button" onClick={close} aria-label="Close navigation"><Icon name="close" /></button></div>
        <a className="btn btn-primary nav-publish" href="#create" onClick={navigate}><Icon name="plus" />Post a call</a>
        <nav aria-label="All sections">{links(true)}</nav>
      </dialog>
    </>
  );
}
