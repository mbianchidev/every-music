import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { TOUR_STEPS, cardPosition, localTourStatus, rememberTour, resolveTarget, shouldStartTour } from '../lib/tour.js';

const CARD_WIDTH = 360;
const PADDING = 6;

export default function ProductTour({ userId, onError }) {
  const { t } = useI18n();
  const onboarding = useResource('/onboarding', { reconnect: false });
  const dialog = useRef(null);
  const card = useRef(null);
  const next = useRef(null);
  const returnFocus = useRef(null);
  const started = useRef(false);
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState(null);
  const [viewport, setViewport] = useState(0);
  const { reload } = onboarding;

  const start = () => {
    returnFocus.current = document.activeElement;
    setIndex(0);
    setLayout(null);
    setActive(true);
  };

  const save = async status => {
    rememberTour(userId, status);
    try {
      await conduit.transmit('/onboarding/tour', { method: 'PUT', auth: true, body: { status } });
    } catch (error) {
      console.error('Tour progress could not be saved to the account', error);
      onError(t('onboarding.tour.saveFailed'));
    }
  };

  const finish = status => {
    setActive(false);
    void save(status);
    const target = returnFocus.current?.isConnected ? returnFocus.current : document.getElementById('main-content');
    requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (onboarding.error) console.warn('The welcome tour status could not be loaded', onboarding.error);
  }, [onboarding.error]);

  useEffect(() => {
    const status = onboarding.data?.tour.status;
    if (!onboarding.data || started.current) return;
    started.current = true;
    const local = localTourStatus(userId);
    if (shouldStartTour(status, local)) requestAnimationFrame(start);
    else if (local && status === 'pending') void save(local);
  }, [onboarding.data, userId]);

  useEffect(() => {
    const replay = () => start();
    const changed = () => { started.current = false; reload(); };
    window.addEventListener('everymusic:start-tour', replay);
    window.addEventListener('everymusic:onboarding-changed', changed);
    return () => {
      window.removeEventListener('everymusic:start-tour', replay);
      window.removeEventListener('everymusic:onboarding-changed', changed);
    };
  }, [reload]);

  useEffect(() => {
    if (!active) return undefined;
    if (!dialog.current.open) dialog.current.showModal();
    next.current?.focus();
    const resize = () => setViewport(value => value + 1);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      if (dialog.current?.open) dialog.current.close();
    };
  }, [active]);

  useLayoutEffect(() => {
    if (!active || !card.current) return;
    const step = TOUR_STEPS[index];
    const target = resolveTarget(step);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    const box = target?.getBoundingClientRect();
    const rect = box && {
      top: box.top - PADDING, left: box.left - PADDING, width: box.width + PADDING * 2, height: box.height + PADDING * 2,
      right: box.right + PADDING, bottom: box.bottom + PADDING,
    };
    const size = card.current.getBoundingClientRect();
    setLayout({
      rect,
      more: Boolean(target?.matches('[aria-controls="workspace-navigation"]')),
      card: cardPosition(rect, { width: CARD_WIDTH, height: size.height }, { width: window.innerWidth, height: window.innerHeight }),
    });
  }, [active, index, viewport]);

  if (!active) return null;
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;
  return (
    <dialog ref={dialog} className={`tour-dialog ${layout?.rect ? '' : 'tour-dialog-centered'}`} aria-labelledby="tour-label"
      aria-describedby="tour-step" onCancel={event => { event.preventDefault(); finish('skipped'); }}>
      {layout?.rect && <div className="tour-highlight" aria-hidden="true"
        style={{ top: layout.rect.top, left: layout.rect.left, width: layout.rect.width, height: layout.rect.height }} />}
      <section ref={card} className="tour-card" style={layout ? { top: layout.card.top, left: layout.card.left, width: layout.card.width } : { visibility: 'hidden' }}>
        <p className="tour-progress"><span id="tour-label">{t('onboarding.tour.label')}</span>
          <span>{t('onboarding.tour.progress', { current: index + 1, total: TOUR_STEPS.length })}</span></p>
        <div id="tour-step" aria-live="polite">
          <h2 className="heading-md">{t(`onboarding.tour.steps.${step.id}.title`)}</h2>
          <p>{t(`onboarding.tour.steps.${step.id}.body`)}</p>
          {layout?.more && <p className="field-hint">{t('onboarding.tour.mobileMore')}</p>}
        </div>
        <div className="tour-actions">
          <button className="btn btn-ghost" type="button" onClick={() => finish('skipped')}>{t('onboarding.tour.skip')}</button>
          <span className="tour-step-buttons">
            <button className="btn btn-secondary" type="button" disabled={index === 0} onClick={() => {
              if (index === 1) next.current?.focus();
              setIndex(value => value - 1);
            }}>{t('onboarding.tour.back')}</button>
            <button ref={next} className="btn btn-primary" type="button" onClick={() => (last ? finish('completed') : setIndex(value => value + 1))}>
              {t(last ? 'onboarding.tour.finish' : 'onboarding.tour.next')}
            </button>
          </span>
        </div>
      </section>
    </dialog>
  );
}
