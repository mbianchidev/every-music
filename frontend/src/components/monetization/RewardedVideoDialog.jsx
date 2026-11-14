import { useEffect, useRef, useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useI18n } from '../../lib/i18n.js';
import { videoSource } from '../../lib/monetization.js';
import ModalDialog from '../ModalDialog.jsx';
import Spinner from '../Spinner.jsx';
import { errorText } from '../../lib/error-text.js';

function Player({ video, onEarned }) {
  const { t, formatNumber } = useI18n();
  const [view, setView] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [ended, setEnded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    conduit.transmit(`/rewards/videos/${video.id}/views`, { method: 'POST', auth: true })
      .then(data => setView({ ...data, issuedAt: Date.now() }))
      .catch(failure => setError(errorText(failure)));
  }, [video.id]);
  useEffect(() => {
    if (!view || result) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [view, result]);
  const remaining = view ? Math.max(0, Math.ceil(view.minimumSeconds - (now - view.issuedAt) / 1000)) : null;
  const claim = async () => {
    setBusy(true); setError('');
    try {
      const data = await conduit.transmit('/rewards/views/complete', { method: 'POST', auth: true, body: { token: view.token } });
      setResult(data);
      onEarned?.(data);
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <div className="form-stack">
      <p className="body-muted">{t('monetization.video.sponsor', { sponsor: video.sponsorName })}</p>
      <p>{t('monetization.video.intro', { points: formatNumber(video.rewardPoints), seconds: formatNumber(video.minimumSeconds) })}</p>
      {!view && !error && <Spinner label={t('monetization.video.starting')} />}
      {view && <video className="rewarded-video" src={videoSource(video.videoUrl)} controls playsInline preload="metadata"
        aria-describedby="rewarded-video-description" onEnded={() => setEnded(true)}>
        {t('monetization.video.unsupported')}
      </video>}
      <section aria-labelledby="rewarded-video-description-heading">
        <h3 id="rewarded-video-description-heading">{t('monetization.video.description')}</h3>
        <p id="rewarded-video-description" className="detail-text"><strong>{video.title}</strong> {video.body}</p>
      </section>
      {view && !result && <>
        {!ended && <p>{t('monetization.video.finish')}</p>}
        {ended && remaining > 0 && <p>{t('monetization.video.wait', { count: remaining })}</p>}
        <button className="btn btn-primary" type="button" disabled={busy || !ended || remaining > 0} onClick={claim}>
          {busy ? t('monetization.video.claiming') : t('monetization.video.claim', { points: formatNumber(video.rewardPoints) })}
        </button>
      </>}
      {result && <p className="success" role="status">
        {t('monetization.video.claimed', { points: formatNumber(result.points), balance: formatNumber(result.balance) })}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

// Rewarded sponsored video. The server issues a view token when the dialog
// opens and only credits points after the minimum watch time has passed.
export default function RewardedVideoDialog({ video, onClose, onEarned }) {
  const { t } = useI18n();
  return <ModalDialog title={t('monetization.video.title')} open={Boolean(video)} onClose={onClose}>
    {video && <Player key={video.id} video={video} onEarned={onEarned} />}
  </ModalDialog>;
}
