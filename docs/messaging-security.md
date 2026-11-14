# Messaging privacy and administration

[Usage](usage.md) | [API](api.md) | [Operations](deployment.md)

## What is encrypted

New messages are signed and encrypted on the sending device. The API stores an
authenticated encrypted envelope, participant/key identifiers, client retry ID,
timestamps, and read/archive/block state. It does not receive a compatible
client's routine message plaintext or unencrypted private keys. Both participants
can decrypt their copy; being an application administrator adds no conversation
membership or decryption capability.

This protects new message contents in a database or backup disclosure when
recovery keys and client devices remain secure. It does **not** hide who
communicates, timestamps, message sizes, account information, or read state.
Push and conversation previews contain generic text, not decrypted snippets.

**Legacy messages are not retroactively end-to-end encrypted.** Migration 004
preserves old history with encryption version 0 and the UI labels it as legacy.
The host and older backups can still contain that plaintext. Deleting a message
clears its live body/envelope, not copies already taken or retained in backups.
There is no silent plaintext fallback for new sends.

## Recovery and devices

Before using encrypted messaging, generate a recovery key in Messages or
Settings. It contains 32 cryptographically random bytes, displayed as 43
case-sensitive base64url characters. Save it outside Every.music, for example in
a password manager. The setup requires acknowledging that you saved it.

Private signing and encryption keys are uploaded only as a recovery-key-encrypted
backup. The recovery key is never submitted to the API. Unlocking downloads the
encrypted backup and decrypts it on the device. Unlocked keys stay in page memory,
not local/session storage or the service-worker cache. Lock, logout, account
switch, reload, or closing the page removes access to those in-memory keys.
Sign-in and password recovery cannot recover a lost messaging recovery key.

Use the saved recovery key to unlock on another device or after reloading.
Reset messaging identity only when necessary. Reset preserves old key records
and encrypted history, but old messages still require the corresponding old
recovery key. Select an older key, or use **Unlock key for this message**.
Contacts see a changed fingerprint and cannot automatically trust the new key.
Key changes are limited to five per account per day.

## Fingerprints and trust

Each account identity has a signing-key fingerprint. Its signed identity proof
binds a separate encryption key to that account and fingerprint. Clients verify
the proof before encryption/decryption.

The browser pins a contact's first valid fingerprint as **unverified** and pins
the participant ID associated with an existing conversation. A key owner or
conversation-participant substitution fails closed. Pins are
non-secret, account-scoped browser data; they are not synchronization or
real-world identity verification. Compare both fingerprints through another
trusted channel and use **Verify fingerprint** after actually comparing them.
Changed or invalid keys fail closed. Explicit comparison can accept a new
fingerprint without discarding trusted older fingerprints needed for history.
On a new browser, an older message can require **Compare message fingerprints**.
The key selector shows older fingerprints so both musicians can compare the
specific historical keys instead of mistakenly verifying only the current key.

First-use trust cannot detect a malicious directory substituting keys before
your first contact. Fingerprint comparison is needed for that assurance.
Clearing browser storage or using a new device loses its local trust pins.

## Cryptographic profile and limits

The implementation uses the maintained MIT-licensed `jose` library and platform
Web Crypto, not a custom cipher or manually managed content-encryption nonce.
The browser loads the crypto implementation only when needed.

| Purpose | Profile |
|---|---|
| Signing | Separate P-256 key, ES256 JWS |
| Identity proof | Typed JWS binds account ID and encryption-key JWK thumbprint |
| Message context | Typed signed JWT binds sender, recipient, conversation, client ID, both key IDs/fingerprints, and a 1-4,000-character body |
| Message encryption | General JSON JWE, ECDH-ES+A256KW per participant, fresh A256GCM content encryption |
| Private-key backup | Typed compact JWE, PBES2-HS512+A256KW, fresh 16-byte salt, 600,000 iterations, A256GCM |
| Validation | Fixed algorithm/type allowlists, bounded envelopes, exact participants, signature and context checks before displaying text |

Recovery keys have random 256-bit entropy; password derivation is not a substitute
for that entropy. Do not replace generated recovery keys with memorable passwords.
Message JWTs are historical signed records, not authorization tokens, and have
their own types/audience and signature algorithm.

This is **not a Signal-style ratchet**. It does not provide forward secrecy,
post-compromise security, or deniable authentication. A stolen old private key or
recovery key can expose history encrypted to that key. Resetting keys does not
make already captured history safe.

E2EE cannot protect an unlocked or compromised client, an authorized script
reading client memory, or a malicious server delivering altered web application
code. Use HTTPS, a trusted deployment/build, secure devices and verified
fingerprints. Native clients still need platform-specific verification.
The integration has not received an independent cryptographic security audit;
automated protocol/authorization tests are not such an audit.

Protocol references:
[JWE JSON serialization](https://www.rfc-editor.org/rfc/rfc7516#section-7.2),
[JWA key management](https://www.rfc-editor.org/rfc/rfc7518),
[sign-then-encrypt](https://www.rfc-editor.org/rfc/rfc7519#section-11.2),
and [JWT validation guidance](https://www.rfc-editor.org/rfc/rfc8725).
The bundled library notice is in
[`frontend/public/third-party-notices.txt`](../frontend/public/third-party-notices.txt).

## Reports and moderation

Use **Report musician** on a profile/conversation, or **Report message** on a
received message. The report explicitly asks permission to disclose its details
and the selected decrypted message. Do not include passwords, recovery keys or
unrelated private information.

Reported content is outside routine message confidentiality: administrators and
the host can read the deliberately submitted report. For encrypted messages,
the client supplies the original signed record; the API verifies its sender key
and exact conversation/client/key context. This proves a matching key signed
the content, not a verified real-world identity. Legacy evidence is explicitly
unverified. Administrators do not receive the rest of the conversation or keys.

Administrators can review/dismiss a report, remove only its attached message,
or suspend the reported member account with an internal decision note.
Suspension revokes refresh sessions, stops browser push, closes active event
streams and hides public content. History remains available to other
participants. Suspending oneself or another administrator through this UI is
forbidden. Reinstatement is currently an operator task, not a self-service
appeal or full trust-and-safety case-management system.

Role changes, report access and moderation actions have an administrator-only
audit log containing actor/target/report IDs, action and time, not copied message
contents. Open reports remain for review; resolved report details/evidence expire
after 90 days. Audit metadata expires after 365 days. Operator backup retention
and any applicable deletion duties must be managed separately.

## Administrator provisioning

There is no default admin and no public role-assignment endpoint. An operator
with explicit database access can grant/revoke an active, verified account:

```bash
cd backend
# Export the intended REALM_CONNECTION securely first.
npm run admin -- --user operator@example.test --grant
npm run admin -- --user operator@example.test --revoke
```

`example.test` is a placeholder, not a seeded administrator. Role changes are
audited. API guards consult the live database rather than trusting a client
role or stale JWT claim; revocation takes effect on subsequent requests.
Moderation transactions recheck/lock the actor role to serialize revocation.

## Administrator analytics

Personal analytics remains private to its owner. Platform analytics has a
**separate, default-off opt-in**. Both actor and content owner must enable personal
and platform analytics before new activity contributes to platform aggregates.
Existing personal history is never imported retroactively.

The admin overview shows operational account/report totals, aggregate daily
activity, and reach of opted-in public calls. It does not expose visitor IDs,
individual behavior trails, private conversation IDs or message contents.
These are not unique-visitor or total-traffic figures. Both report windows
retain 30 days.

Disabling platform analytics stops future contributions and deletes platform
totals for the owner's content. Earlier anonymous contributions to somebody
else's aggregates cannot be traced back and selectively removed because actor
identities are not stored. Disabling personal analytics also disables platform
analytics. Operational access logs are separate and may contain client IPs.
