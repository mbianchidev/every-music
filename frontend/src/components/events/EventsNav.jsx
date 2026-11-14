import { useI18n } from '../../lib/i18n.js';
import Icon from '../Icon.jsx';

export default function EventsNav() {
  const { t } = useI18n();
  const current = window.location.hash.slice(1).split('?')[0];
  const link = (id, label, className, icon) => <a className={`btn ${className}`} href={`#${id}`} aria-current={current === id ? 'page' : undefined}>
    {icon && <Icon name={icon} size={17} />}{label}</a>;
  return (
    <nav className="marketplace-toolbar events-toolbar" aria-label={t('events.toolbar.label')}>
      {link('new-event', t('events.toolbar.create'), 'btn-primary', 'plus')}
      {link('events', t('events.toolbar.discover'), 'btn-secondary', 'search')}
      {link('my-events', t('events.toolbar.mine'), 'btn-secondary', 'calendar')}
    </nav>
  );
}
