import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { CLIENT_VERSION, detectPlatform } from '../lib/app-version.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import Icon from './Icon.jsx';
import { errorText } from '../lib/error-text.js';

export default function RateApp() {
  const { t } = useI18n();
  const own = useResource('/ratings/me');
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [thanks, setThanks] = useState(null);
  const starsLabel = count => t('help.rating.star', { count });
  const existing = own.data?.ratings.find(item => item.appVersion === CLIENT_VERSION);

  const submit = async event => {
    event.preventDefault();
    if (!stars) { setError(t('help.rating.choose')); return; }
    setBusy(true); setError('');
    try {
      const rating = await conduit.transmit('/ratings', { method: 'POST', auth: true, body: {
        appVersion: CLIENT_VERSION, stars, platform: detectPlatform(), ...(comment.trim() ? { comment } : {}),
      } });
      setThanks(rating);
      own.reload();
    } catch (failure) {
      setError(errorText(failure));
      if (failure.code === 'RATING_EXISTS') own.reload();
    } finally { setBusy(false); }
  };

  if (thanks) {
    return <p className="success" role="status">{t('help.rating.thanks', { version: thanks.appVersion, stars: starsLabel(thanks.stars) })}</p>;
  }
  if (own.error) return <ErrorState message={own.error} onRetry={own.reload} />;
  if (!own.data) return <Spinner label={t('common.actions.loading')} />;
  if (existing) return <p className="status-message">{t('help.rating.already', { version: existing.appVersion, stars: starsLabel(existing.stars) })}</p>;
  return (
    <form className="form-stack" onSubmit={submit}>
      <p className="body-muted">{t('help.rating.intro')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <fieldset className="star-rating" disabled={busy}>
        <legend>{t('help.rating.legend', { version: CLIENT_VERSION })}</legend>
        <div className="star-options">
          {[1, 2, 3, 4, 5].map(value => (
            <label key={value} className={`star-option ${value <= stars ? 'is-filled' : ''}`}>
              <input type="radio" name="app-rating" value={value} checked={stars === value} onChange={() => setStars(value)} />
              <Icon name="star" size={30} />
              <span className="sr-only">{starsLabel(value)}</span>
            </label>
          ))}
        </div>
        <p className="field-hint" aria-live="polite">{stars ? starsLabel(stars) : t('help.rating.choose')}</p>
      </fieldset>
      <FormField id="rating-comment" label={t('help.rating.comment')} hint={t('help.rating.commentHint')}>
        <textarea className="input" maxLength="1000" rows="3" value={comment} disabled={busy} onChange={event => setComment(event.target.value)} />
      </FormField>
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('help.rating.sending') : t('help.rating.submit')}</button>
    </form>
  );
}
