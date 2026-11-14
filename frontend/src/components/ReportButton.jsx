import { useState } from 'react';
import conduit from '../lib/conduit.js';
import FormField from './FormField.jsx';
import ModalDialog from './ModalDialog.jsx';

export default function ReportButton({ userId, name = 'this musician', message }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('spam');
  const [details, setDetails] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await conduit.transmit('/reports', { method: 'POST', auth: true, body: {
        reportedUserId: userId, category, details, consent,
        ...(message ? { messageId: message.id, ...(message.signedEvidence ? { signedEvidence: message.signedEvidence } : {}) } : {}),
      } });
      setOpen(false); setDetails(''); setConsent(false);
      setSuccess('Report submitted. You can check its status in Your reports.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <>
    <button className="text-link" type="button" aria-haspopup="dialog" onClick={() => { setOpen(true); setConsent(false); setError(''); setSuccess(''); }}>{message ? 'Report message' : 'Report musician'}</button>
    {success && <p className="field-hint" role="status">{success} <a href="#reports">Your reports</a></p>}
    <ModalDialog title={message ? 'Report message' : 'Report musician'} open={open} onClose={() => setOpen(false)}>
      <p>Report a concern about {name}. Administrators receive only your report and any selected message, not access to the rest of the conversation.</p>
      {message && <blockquote className="reported-excerpt">{message.body}</blockquote>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="form-stack" onSubmit={submit}>
        <FormField id={`report-category-${message?.id || userId}`} label="Reason" required>
          <select className="input" value={category} onChange={event => setCategory(event.target.value)} disabled={busy}>
            <option value="spam">Spam</option><option value="harassment">Harassment</option><option value="threats">Threats</option><option value="other">Other concern</option>
          </select>
        </FormField>
        <FormField id={`report-details-${message?.id || userId}`} label="Describe the concern" required hint="5-2,000 characters. Do not include passwords, recovery keys, or unrelated private information.">
          <textarea className="input" value={details} onChange={event => setDetails(event.target.value)} minLength="5" maxLength="2000" disabled={busy} />
        </FormField>
        <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={busy} />
          I agree to share these report details{message ? ' and this selected decrypted message' : ''} with administrators
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy || !consent || details.trim().length < 5}>{busy ? 'Submitting...' : 'Submit report'}</button>
      </form>
    </ModalDialog>
  </>;
}
