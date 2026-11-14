import { useEffect, useState } from 'react';
import nucleus from './nucleus.js';
import conduit from './conduit.js';

const changed = () => Object.assign(new Error('Your sign-in changed. Unlock messaging for the current account.'), { code: 'SESSION_CHANGED' });

export class MessageVault {
  constructor({ session = nucleus, transport = conduit, storage = () => globalThis.localStorage } = {}) {
    this.transport = transport;
    this.storage = storage;
    this.userId = null;
    this.keys = new Map();
    this.listeners = new Set();
    this.revision = 0;
    this.unsubscribeSession = session.subscribe(snapshot => {
      const userId = snapshot.persona?.userId;
      if (userId !== this.userId) {
        this.userId = userId;
        this.lock();
      }
    });
  }

  snapshot() {
    return { userId: this.userId, revision: this.revision, unlockedIds: [...this.keys.keys()] };
  }

  emit() {
    this.revision += 1;
    this.listeners.forEach(listener => listener(this.snapshot()));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  ensure(userId) {
    if (!userId || userId !== this.userId) throw changed();
  }

  lock() {
    this.keys.clear();
    this.emit();
  }

  async unlock(keyId, recoveryKey) {
    const userId = this.userId;
    const record = await this.transport.transmit(`/encryption/me/${keyId}`, { auth: true });
    const crypto = await import('./message-crypto.js');
    const unlocked = await crypto.unlockIdentity(record, recoveryKey);
    this.ensure(userId);
    this.keys.set(record.id, unlocked);
    this.emit();
    return record;
  }

  async create(recoveryKey, replaceKeyId) {
    const userId = this.userId;
    this.ensure(userId);
    const crypto = await import('./message-crypto.js');
    const created = await crypto.createIdentity(userId, recoveryKey);
    this.ensure(userId);
    const record = await this.transport.transmit('/encryption/me', {
      method: 'POST', auth: true, body: { ...created.publication, ...(replaceKeyId ? { replaceKeyId } : {}) },
    });
    this.ensure(userId);
    const unlocked = await crypto.unlockIdentity(record, recoveryKey);
    this.ensure(userId);
    this.keys.set(record.id, unlocked);
    this.emit();
    return record;
  }

  trustRecord(peerId) {
    try {
      const value = this.storage().getItem(`everymusic.message-trust.v1.${this.userId}.${peerId}`);
      const record = value ? JSON.parse(value) : {};
      if (!record || Array.isArray(record) || typeof record !== 'object') throw new Error('Invalid trust record');
      if (Object.entries(record).some(([fingerprint, state]) => !/^[A-Za-z0-9_-]{43}$/.test(fingerprint)
        || !state || typeof state !== 'object' || typeof state.verified !== 'boolean')) throw new Error('Invalid fingerprint record');
      return record;
    } catch {
      throw Object.assign(new Error('Messaging fingerprint storage is unavailable or unreadable. Verify the fingerprint before replacing the trust record.'), { code: 'TRUST_STORAGE_UNAVAILABLE' });
    }
  }

  bindConversation(conversationId, peerId) {
    if (!conversationId) return;
    try {
      const key = `everymusic.conversation-peer.v1.${this.userId}.${conversationId}`;
      const existing = this.storage().getItem(key);
      if (existing && existing !== peerId) throw Object.assign(new Error('This conversation now names a different participant. Do not send; check identities through another channel.'), { code: 'CONVERSATION_IDENTITY_CHANGED' });
      if (!existing) this.storage().setItem(key, peerId);
    } catch (error) {
      if (error.code === 'CONVERSATION_IDENTITY_CHANGED') throw error;
      throw new Error('The conversation identity could not be pinned. Enable browser storage before messaging.');
    }
  }

  async checkPeer(peer, expectedUserId, conversationId) {
    const userId = this.userId;
    this.ensure(userId);
    if (peer.userId !== expectedUserId) throw Object.assign(new Error('The messaging key belongs to a different participant.'), { code: 'INVALID_IDENTITY' });
    const { verifyIdentity } = await import('./message-crypto.js');
    await verifyIdentity(peer);
    this.ensure(userId);
    this.bindConversation(conversationId, expectedUserId);
    const known = this.trustRecord(peer.userId);
    if (!Object.keys(known).length) {
      this.saveTrust(peer, { [peer.fingerprint]: { verified: false } });
      return false;
    }
    if (!Object.hasOwn(known, peer.fingerprint)) {
      throw Object.assign(new Error('This musician has a new messaging fingerprint. Compare it through another channel before sending or trusting messages from the new key.'), { code: 'FINGERPRINT_CHANGED' });
    }
    return known[peer.fingerprint].verified === true;
  }

  saveTrust(peer, value) {
    try { this.storage().setItem(`everymusic.message-trust.v1.${this.userId}.${peer.userId}`, JSON.stringify(value)); }
    catch { throw new Error('The fingerprint could not be saved. Enable browser storage before using encrypted messaging.'); }
  }

  async verifyPeer(peer, expectedUserId, conversationId) {
    const userId = this.userId;
    this.ensure(userId);
    if (peer.userId !== expectedUserId) throw new Error('The messaging key belongs to a different participant.');
    const { verifyIdentity } = await import('./message-crypto.js');
    await verifyIdentity(peer);
    this.ensure(userId);
    this.bindConversation(conversationId, expectedUserId);
    let known;
    try { known = this.trustRecord(peer.userId); }
    catch (error) {
      if (error.code !== 'TRUST_STORAGE_UNAVAILABLE') throw error;
      known = {};
    }
    this.saveTrust(peer, { ...known, [peer.fingerprint]: { verified: true } });
    this.emit();
  }

  dispose() {
    this.unsubscribeSession();
    this.lock();
    this.listeners.clear();
  }
}

export const messageVault = new MessageVault();
if (import.meta.hot) import.meta.hot.dispose(() => messageVault.dispose());
export function useMessageVault() {
  const [snapshot, setSnapshot] = useState(messageVault.snapshot());
  useEffect(() => messageVault.subscribe(setSnapshot), []);
  return snapshot;
}
