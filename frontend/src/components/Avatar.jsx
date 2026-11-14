import { mediaUrl } from '../lib/media.js';

export default function Avatar({ name = 'Musician', src, large = false }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  return <span className={`avatar ${large ? 'avatar-large' : ''}`} aria-hidden="true">
    {src ? <img src={mediaUrl(src)} alt="" /> : initials || 'M'}
  </span>;
}
