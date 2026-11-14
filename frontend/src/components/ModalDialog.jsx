import { useEffect, useId, useRef } from 'react';
import Icon from './Icon.jsx';

export default function ModalDialog({ title, open, onClose, children, fallbackFocusId = 'main-content' }) {
  const dialog = useRef(null);
  const previous = useRef(null);
  const heading = useId();
  useEffect(() => {
    if (open && !dialog.current.open) {
      previous.current = document.activeElement;
      dialog.current.showModal();
    } else if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  return <dialog ref={dialog} className="modal-dialog" aria-labelledby={heading} onClose={() => {
    onClose();
    if (previous.current?.isConnected) previous.current.focus();
    else document.getElementById(fallbackFocusId)?.focus();
  }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const items = [...event.currentTarget.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter(element => element.getClientRects().length);
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.current.close();
  }}>
    <div className="dialog-heading"><h2 id={heading}>{title}</h2><button className="icon-button" type="button" aria-label={`Close ${title.toLowerCase()}`} onClick={() => dialog.current.close()}><Icon name="close" /></button></div>
    {open && children}
  </dialog>;
}
