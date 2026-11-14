import { useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { MEMBER_PERMISSIONS, can } from '../lib/organizations.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import FormField from '../components/FormField.jsx';
import EntityPicker from '../components/EntityPicker.jsx';
import { errorText } from '../lib/error-text.js';

function MemberEditor({ member, actorRole, titleOnly, busy, onSave }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState({
    title: member.title ?? '', joinedOn: member.joinedOn ?? '', leftOn: member.leftOn ?? '',
    role: member.role, permissions: member.permissions,
  });
  const current = ['active', 'invited'].includes(member.status);
  const canPermissions = ['leader', 'admin'].includes(actorRole) && member.role === 'member';
  const canRole = actorRole === 'leader' && member.role !== 'leader' && member.status === 'active';
  const prefix = `member-${member.userId}-${member.status}`;
  const submit = event => {
    event.preventDefault();
    const body = { title: draft.title.trim() || null };
    if (!current) body.memberId = member.memberId;
    if (titleOnly) { onSave(member, body); return; }
    body.joinedOn = draft.joinedOn || null;
    if (!current) body.leftOn = draft.leftOn || null;
    if (canPermissions) body.permissions = draft.permissions;
    if (canRole && draft.role !== member.role) body.role = draft.role;
    onSave(member, body);
  };
  return (
    <details className="selection-panel member-editor">
      <summary>{t('organizations.members.editMember', { name: member.name })}</summary>
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <FormField id={`${prefix}-title`} label={t('organizations.members.titleField')} hint={t('organizations.members.titleHint')}>
            <input className="input" value={draft.title} maxLength="100" disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} />
          </FormField>
          {!titleOnly && <FormField id={`${prefix}-joined`} label={t('organizations.members.joinedOn')}>
            <input className="input" type="date" value={draft.joinedOn} disabled={busy} onChange={event => setDraft({ ...draft, joinedOn: event.target.value })} />
          </FormField>}
          {!current && !titleOnly && <FormField id={`${prefix}-left`} label={t('organizations.members.leftOn')}>
            <input className="input" type="date" value={draft.leftOn} disabled={busy} onChange={event => setDraft({ ...draft, leftOn: event.target.value })} />
          </FormField>}
          {canRole && <FormField id={`${prefix}-role`} label={t('organizations.members.role')}>
            <select className="input" value={draft.role} disabled={busy} onChange={event => setDraft({ ...draft, role: event.target.value })}>
              <option value="member">{t('organizations.roles.member')}</option><option value="admin">{t('organizations.roles.admin')}</option>
            </select>
          </FormField>}
        </div>
        {canPermissions && <fieldset disabled={busy}>
          <legend>{t('organizations.members.permissions')}</legend>
          {MEMBER_PERMISSIONS.map(permission => <label className="checkbox-label" key={permission}>
            <input type="checkbox" checked={draft.permissions.includes(permission)} onChange={event => setDraft({
              ...draft, permissions: event.target.checked ? [...draft.permissions, permission] : draft.permissions.filter(item => item !== permission),
            })} />{t(`organizations.permissions.${permission}`)}
          </label>)}
        </fieldset>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{t('organizations.members.saveMember', { name: member.name })}</button>
      </form>
    </details>
  );
}

export default function OrganizationMembersScreen({ route }) {
  const { t, formatDate } = useI18n();
  const reference = route.query.get('id') || 'missing';
  const page = useResource(`/organizations/${encodeURIComponent(reference)}`, { events: 'organizations.changed' });
  const organization = page.data;
  const list = useResource(organization ? `/organizations/${organization.id}/members` : null, { events: 'organizations.changed' });
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const own = nucleus.payload.persona?.userId;
  const role = organization?.viewer?.role;
  const manageMembers = can(organization, 'manage_members');
  const run = async (operation, success, focus = 'members-heading') => {
    setBusy(true); setError(''); setMessage('');
    try {
      await operation(); setMessage(success); list.reload(); page.reload();
      document.getElementById(focus)?.focus();
      return true;
    } catch (failure) {
      setError(failure.details?.length ? `${errorText(failure)}: ${failure.details.join('; ')}` : errorText(failure));
      return false;
    } finally { setBusy(false); }
  };
  const base = organization ? `/organizations/${organization.id}` : '';
  const members = list.data?.members ?? [];
  const active = members.filter(member => member.status === 'active');
  const organizationHrefFor = item => `#organization?id=${item.id}`;
  const leave = () => {
    if (!window.confirm(t('organizations.members.confirmLeave', { name: organization.name }))) return;
    run(() => conduit.transmit(`${base}/members/${own}`, { method: 'DELETE', auth: true }), t('organizations.members.left'))
      .then(done => { if (done) window.location.hash = organizationHrefFor(organization); });
  };
  return (
    <div className="container">
      <PageHeader eyebrow={t('organizations.members.eyebrow')} title={organization ? t('organizations.members.title', { name: organization.name }) : t('organizations.members.eyebrow')}
        subtitle={t('organizations.members.subtitle')} />
      {page.error && <ErrorState message={page.error} onRetry={page.reload} />}
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {(!organization || !list.data) && !page.error && !list.error ? <Spinner label={t('organizations.members.loading')} /> : organization && list.data && <>
        <p><a href={organizationHrefFor(organization)}>{t('organizations.members.back', { name: organization.name })}</a></p>
        <section className="detail-section" aria-labelledby="members-heading">
          <h2 className="heading-md" id="members-heading" tabIndex="-1">{t('organizations.members.current')}</h2>
          <ul className="member-admin-list">{members.map(member => {
            const self = member.userId === own;
            const editable = manageMembers && (self || role === 'leader' || member.role === 'member');
            const removable = !self && editable && member.role !== 'leader' && ['active', 'invited'].includes(member.status) && (member.role !== 'admin' || role === 'leader');
            return (
              <li className="card" key={member.memberId}>
                <h3><a href={`#musician?id=${member.userId}`}>{member.name}</a></h3>
                <p className="body-muted">{[
                  t(`organizations.roles.${member.role}`), t(`organizations.statuses.${member.status}`), member.title,
                  member.joinedOn && t('organizations.members.since', { date: formatDate(`${member.joinedOn}T00:00:00`) }),
                  member.leftOn && t('organizations.members.until', { date: formatDate(`${member.leftOn}T00:00:00`) }),
                ].filter(Boolean).join(' / ')}</p>
                {member.status === 'active' && member.role === 'member' && <p className="field-hint">{member.permissions.length
                  ? member.permissions.map(permission => t(`organizations.permissions.${permission}`)).join(', ')
                  : t('organizations.members.noPermissions')}</p>}
                {(editable || (self && member.status === 'active')) && <MemberEditor key={JSON.stringify(member)} member={member} actorRole={role} titleOnly={!editable} busy={busy}
                  onSave={(target, body) => run(() => conduit.transmit(`${base}/members/${target.userId}`, { method: 'PATCH', auth: true, body }),
                    t('organizations.members.saved'))} />}
                {removable && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => {
                  if (window.confirm(t(member.status === 'invited' ? 'organizations.members.confirmCancel' : 'organizations.members.confirmRemove', { name: member.name }))) {
                    run(() => conduit.transmit(`${base}/members/${member.userId}`, { method: 'DELETE', auth: true }), t('organizations.members.removed'));
                  }
                }}>{member.status === 'invited' ? t('organizations.members.cancelInvite', { name: member.name }) : t('organizations.members.remove', { name: member.name })}</button>}
              </li>
            );
          })}</ul>
        </section>
        {manageMembers && organization.managed && <section className="detail-section" aria-labelledby="invite-heading">
          <h2 className="heading-md" id="invite-heading" tabIndex="-1">{t('organizations.members.inviteTitle')}</h2>
          <p className="body-muted">{t('organizations.members.inviteIntro')}</p>
          {!invite ? <EntityPicker id="invite-picker" type="musician" label={t('organizations.members.find')} disabled={busy}
            exclude={members.filter(member => ['active', 'invited'].includes(member.status)).map(member => member.userId).concat(own)}
            actionLabel={t('organizations.members.choose')}
            onPick={(userId, name) => setInvite({ userId, name, title: '', role: 'member', permissions: [] })} />
            : <form className="form-stack" onSubmit={async event => {
              event.preventDefault();
              const done = await run(() => conduit.transmit(`${base}/members`, { method: 'POST', auth: true, body: {
                userId: invite.userId, title: invite.title.trim() || null, role: invite.role,
                ...(['leader', 'admin'].includes(role) && invite.role === 'member' ? { permissions: invite.permissions } : {}),
              } }), t('organizations.members.invited', { name: invite.name }));
              if (done) setInvite(null);
            }}>
              <p>{t('organizations.members.inviting', { name: invite.name })}</p>
              <FormField id="invite-title" label={t('organizations.members.titleField')} hint={t('organizations.members.titleHint')}>
                <input className="input" value={invite.title} maxLength="100" disabled={busy} onChange={event => setInvite({ ...invite, title: event.target.value })} />
              </FormField>
              {role === 'leader' && <FormField id="invite-role" label={t('organizations.members.role')}>
                <select className="input" value={invite.role} disabled={busy} onChange={event => setInvite({ ...invite, role: event.target.value })}>
                  <option value="member">{t('organizations.roles.member')}</option><option value="admin">{t('organizations.roles.admin')}</option>
                </select>
              </FormField>}
              {['leader', 'admin'].includes(role) && invite.role === 'member' && <fieldset disabled={busy}>
                <legend>{t('organizations.members.permissions')}</legend>
                {MEMBER_PERMISSIONS.map(permission => <label className="checkbox-label" key={permission}>
                  <input type="checkbox" checked={invite.permissions.includes(permission)} onChange={event => setInvite({
                    ...invite, permissions: event.target.checked ? [...invite.permissions, permission] : invite.permissions.filter(item => item !== permission),
                  })} />{t(`organizations.permissions.${permission}`)}
                </label>)}
              </fieldset>}
              <div className="button-row">
                <button className="btn btn-primary" type="submit" disabled={busy}>{t('organizations.members.sendInvite')}</button>
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setInvite(null)}>{t('organizations.common.cancel')}</button>
              </div>
            </form>}
        </section>}
        {role === 'leader' && active.length > 1 && <section className="detail-section" aria-labelledby="leadership-heading">
          <h2 className="heading-md" id="leadership-heading">{t('organizations.members.transferTitle')}</h2>
          <p className="body-muted">{t('organizations.members.transferIntro')}</p>
          <form className="form-stack" onSubmit={event => {
            event.preventDefault();
            const target = active.find(member => member.userId === event.currentTarget.elements['transfer-target'].value);
            if (!target || !window.confirm(t('organizations.members.confirmTransfer', { name: target.name }))) return;
            run(() => conduit.transmit(`${base}/leadership`, { method: 'POST', auth: true, body: { userId: target.userId } }), t('organizations.members.transferred', { name: target.name }));
          }}>
            <FormField id="transfer-target" label={t('organizations.members.newLeader')}>
              <select className="input" name="transfer-target" disabled={busy}>
                {active.filter(member => member.userId !== own).map(member => <option key={member.userId} value={member.userId}>{member.name}</option>)}
              </select>
            </FormField>
            <button className="btn btn-secondary" type="submit" disabled={busy}>{t('organizations.members.transfer')}</button>
          </form>
        </section>}
        {role && role !== 'leader' && role !== 'maintainer' && <section className="detail-section" aria-labelledby="leave-heading">
          <h2 className="heading-md" id="leave-heading">{t('organizations.members.leaveTitle')}</h2>
          <button className="btn btn-danger" type="button" disabled={busy} onClick={leave}>{t('organizations.members.leave', { name: organization.name })}</button>
        </section>}
      </>}
    </div>
  );
}
