import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import Pagination from './Pagination.jsx';
import Icon from './Icon.jsx';
import { errorText } from '../lib/error-text.js';

function Stars({ value }) {
  const { t, formatNumber } = useI18n();
  return <span className="star-display" role="img" aria-label={t('reviews.outOf', { value: formatNumber(value) })}>
    {[1, 2, 3, 4, 5].map(index => <Icon key={index} name="star" size={16} className={index <= Math.round(value) ? 'is-filled' : ''} />)}
  </span>;
}

function StarInput({ name, value, onChange, legend, disabled }) {
  const { t } = useI18n();
  return (
    <fieldset className="star-rating" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="star-options">
        {[1, 2, 3, 4, 5].map(stars => (
          <label key={stars} className={`star-option ${stars <= value ? 'is-filled' : ''}`}>
            <input type="radio" name={name} value={stars} checked={value === stars} onChange={() => onChange(stars)} />
            <Icon name="star" size={30} />
            <span className="sr-only">{t('reviews.stars', { count: stars })}</span>
          </label>
        ))}
      </div>
      <p className="field-hint" aria-live="polite">{value ? t('reviews.stars', { count: value }) : t('reviews.reviews.choose')}</p>
    </fieldset>
  );
}

function ReviewItem({ review, actions }) {
  const { t, formatDate } = useI18n();
  return (
    <li className="card review-item">
      <p><Stars value={review.stars} /></p>
      <p className="detail-text">{review.body}</p>
      <p className="body-muted">
        <a href={`#musician?id=${review.authorId}`}>{t('reviews.reviews.by', { name: review.authorName })}</a>
        {' / '}<time dateTime={review.updatedAt}>{formatDate(review.updatedAt)}</time>
      </p>
      {actions && <div className="compact-actions">{actions}</div>}
    </li>
  );
}

function Reviews({ profile, own }) {
  const { t, formatNumber } = useI18n();
  const [page, setPage] = useState(1);
  const resource = useResource(`/profiles/${profile.userId}/reviews?page=${page}&pageSize=10`, { events: 'reviews.changed,profiles.changed' });
  const data = resource.data;
  const [draft, setDraft] = useState({ stars: 0, body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (data?.mine) setDraft({ stars: data.mine.stars, body: data.mine.body }); }, [data?.mine?.id, data?.mine?.updatedAt]);
  const act = async (operation, success) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); setMessage(success); resource.reload(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const submit = event => {
    event.preventDefault();
    if (!draft.stars) { setError(t('reviews.reviews.choose')); return; }
    act(() => conduit.transmit(`/profiles/${profile.userId}/review`, { method: 'PUT', auth: true, body: draft }), t('reviews.reviews.sent'));
  };
  const moderate = (review, status) => act(() => conduit.transmit(`/reviews/${review.id}`, { method: 'PATCH', auth: true, body: { status } }), t('reviews.reviews.updated'));
  const remove = review => {
    if (!window.confirm(t('reviews.reviews.deleteConfirm'))) return;
    act(() => conduit.transmit(`/reviews/${review.id}`, { method: 'DELETE', auth: true }), t('reviews.reviews.removed'));
  };
  const removeOwn = () => {
    if (!window.confirm(t('reviews.reviews.removeConfirm'))) return;
    act(async () => {
      await conduit.transmit(`/profiles/${profile.userId}/review`, { method: 'DELETE', auth: true });
      setDraft({ stars: 0, body: '' });
    }, t('reviews.reviews.removed'));
  };
  const name = profile.artistName || t('app.routes.musician');
  return (
    <section className="detail-section" aria-labelledby="reviews-heading" id="reviews">
      <h2 className="heading-md" id="reviews-heading">{t('reviews.reviews.title')}</h2>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!data && !resource.error ? <Spinner label={t('reviews.reviews.loading')} /> : data && <>
        <p>{data.summary.count
          ? <><Stars value={data.summary.average} /> {t('reviews.reviews.summary', { count: data.summary.count, average: formatNumber(data.summary.average) })}</>
          : t('reviews.reviews.none')}</p>
        {own && <div className="review-manage">
          <h3>{t('reviews.reviews.pending')}</h3>
          {!data.manage.pending.length && <p className="body-muted">{t('reviews.reviews.noneWaiting')}</p>}
          <ul className="review-list">{data.manage.pending.map(review => <ReviewItem key={review.id} review={review} actions={<>
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => moderate(review, 'approved')}>{t('reviews.reviews.approve', { name: review.authorName })}</button>
            <button className="text-link" type="button" disabled={busy} onClick={() => moderate(review, 'hidden')}>{t('reviews.reviews.hide', { name: review.authorName })}</button>
            <button className="text-link" type="button" disabled={busy} onClick={() => remove(review)}>{t('reviews.reviews.delete', { name: review.authorName })}</button>
          </>} />)}</ul>
          {data.manage.hidden.length > 0 && <>
            <h3>{t('reviews.reviews.hidden')}</h3>
            <ul className="review-list">{data.manage.hidden.map(review => <ReviewItem key={review.id} review={review} actions={<>
              <button className="text-link" type="button" disabled={busy} onClick={() => moderate(review, 'approved')}>{t('reviews.reviews.show', { name: review.authorName })}</button>
              <button className="text-link" type="button" disabled={busy} onClick={() => remove(review)}>{t('reviews.reviews.delete', { name: review.authorName })}</button>
            </>} />)}</ul>
          </>}
        </div>}
        <ul className="review-list">{data.reviews.map(review => <ReviewItem key={review.id} review={review}
          actions={own ? <>
            <button className="text-link" type="button" disabled={busy} onClick={() => moderate(review, 'hidden')}>{t('reviews.reviews.hide', { name: review.authorName })}</button>
            <button className="text-link" type="button" disabled={busy} onClick={() => remove(review)}>{t('reviews.reviews.delete', { name: review.authorName })}</button>
          </> : null} />)}</ul>
        <Pagination pagination={data.pagination} onPage={setPage} disabled={resource.loading} label={t('reviews.reviews.pages')} />
        {!own && data.mine && <p className="status-message">{t('reviews.reviews.yours')}: {t(`reviews.reviews.status.${data.mine.status}`)}</p>}
        {!own && (data.canReview ? <form className="form-stack review-form" onSubmit={submit}>
          <h3>{data.mine ? t('reviews.reviews.edit') : t('reviews.reviews.write')}</h3>
          <StarInput name="review-stars" value={draft.stars} disabled={busy} legend={t('reviews.reviews.starsLegend')} onChange={stars => setDraft({ ...draft, stars })} />
          <FormField id="review-body" label={t('reviews.reviews.text')} hint={t('reviews.reviews.textHint', { name })} required>
            <textarea className="input" rows="3" maxLength="2000" value={draft.body} disabled={busy} onChange={event => setDraft({ ...draft, body: event.target.value })} />
          </FormField>
          <div className="compact-actions">
            <button className="btn btn-primary" type="submit" disabled={busy || !draft.body.trim()}>
              {busy ? t('reviews.reviews.sending') : data.mine ? t('reviews.reviews.update') : t('reviews.reviews.submit')}
            </button>
            {data.mine && <button className="text-link" type="button" disabled={busy} onClick={removeOwn}>{t('reviews.reviews.remove')}</button>}
          </div>
        </form> : <>
          <p className="field-hint">{t('reviews.reviews.eligibility')}</p>
          {data.mine && <button className="text-link" type="button" disabled={busy} onClick={removeOwn}>{t('reviews.reviews.remove')}</button>}
        </>)}
      </>}
    </section>
  );
}

function Rating({ profile, own }) {
  const { t, formatNumber } = useI18n();
  const resource = useResource(`/profiles/${profile.userId}/rating`, { events: 'ratings.changed' });
  const data = resource.data;
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { setStars(data?.mine?.stars ?? 0); }, [data?.mine?.stars]);
  const save = async (method, success) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/profiles/${profile.userId}/rating`, { method, auth: true, ...(method === 'PUT' ? { body: { stars } } : {}) });
      setMessage(success); resource.reload();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="rating-heading">
      <h2 className="heading-md" id="rating-heading">{t('reviews.rating.title')}</h2>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!data && !resource.error ? <Spinner label={t('reviews.rating.loading')} /> : data && <>
        <p>{data.count
          ? <>{data.average !== null && <><Stars value={data.average} /> {t('reviews.rating.average', { value: formatNumber(data.average) })} / </>}{t('reviews.rating.count', { count: data.count })}</>
          : t('reviews.rating.none')}</p>
        {data.count > 0 && data.average === null && <p className="body-muted">{t('reviews.rating.hiddenAverage', { minimum: data.minimumCount })}</p>}
        <p className="field-hint">{t('reviews.rating.schedule')}</p>
        {!own && data.canRate && <form className="form-stack" onSubmit={event => { event.preventDefault(); if (stars) save('PUT', t('reviews.rating.saved')); }}>
          {data.mine && <p className="status-message">{t('reviews.rating.yours', { stars: t('reviews.stars', { count: data.mine.stars }) })}</p>}
          <StarInput name="profile-rating" value={stars} disabled={busy} legend={t('reviews.rating.legend')} onChange={setStars} />
          <div className="compact-actions">
            <button className="btn btn-secondary" type="submit" disabled={busy || !stars}>{t('reviews.rating.save')}</button>
            {data.mine && <button className="text-link" type="button" disabled={busy} onClick={() => save('DELETE', t('reviews.rating.removed'))}>{t('reviews.rating.remove')}</button>}
          </div>
        </form>}
      </>}
    </section>
  );
}

// Reviews (named, approved by the artist) and anonymous star ratings on an
// artist profile. Rendered for the owner too, who manages incoming reviews.
export default function ProfileReviews({ profile }) {
  if (!profile?.userId) return null;
  const own = profile.userId === nucleus.payload.persona?.userId;
  return <>
    <Reviews profile={profile} own={own} />
    <Rating profile={profile} own={own} />
  </>;
}
