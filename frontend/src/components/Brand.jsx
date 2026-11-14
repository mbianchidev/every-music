import Icon from './Icon.jsx';

export default function Brand({ href = '#feed' }) {
  return <a className="brand-link" href={href}><span className="brand-emblem"><Icon name="wave" size={21} /></span><span>Every<span className="brand-dot">.</span>music</span></a>;
}
