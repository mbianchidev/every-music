const EMPTY_STATE = {
  persona: null,
  keys: null,
  tools: [],
  sounds: [],
};

function isSession(value) {
  return value
    && typeof value === 'object'
    && typeof value.persona === 'object'
    && typeof value.keys?.accessToken === 'string'
    && typeof value.keys?.refreshToken === 'string';
}

export class Nucleus {
  constructor({
    storage = globalThis.sessionStorage,
    storageId = 'everymusic.session.v1',
  } = {}) {
    this.storage = storage;
    this.storageId = storageId;
    this.payload = { ...EMPTY_STATE };
    this.listeners = new Set();
    this.rehydrate();
  }

  get authorized() {
    return Boolean(this.payload.persona && this.payload.keys?.accessToken);
  }

  snapshot() {
    return {
      ...this.payload,
      authorized: this.authorized,
    };
  }

  rehydrate() {
    if (!this.storage) {
      return;
    }

    try {
      const cached = this.storage.getItem(this.storageId);
      if (!cached) {
        return;
      }

      const unpacked = JSON.parse(cached);
      if (!isSession(unpacked)) {
        this.storage.removeItem(this.storageId);
        return;
      }

      this.payload = {
        ...EMPTY_STATE,
        persona: unpacked.persona,
        keys: unpacked.keys,
      };
    } catch (error) {
      console.warn('Discarding unreadable session state', error);
      this.storage.removeItem(this.storageId);
    }
  }

  persist() {
    if (!this.storage) {
      return;
    }

    if (!this.authorized) {
      this.storage.removeItem(this.storageId);
      return;
    }

    this.storage.setItem(this.storageId, JSON.stringify({
      persona: this.payload.persona,
      keys: this.payload.keys,
    }));
  }

  emit() {
    this.persist();
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  login(persona, keys) {
    this.payload = {
      ...this.payload,
      persona,
      keys,
    };
    this.emit();
  }

  updateTokens(keys) {
    if (!this.payload.persona) {
      return;
    }

    this.payload = {
      ...this.payload,
      keys: {
        ...this.payload.keys,
        ...keys,
      },
    };
    this.emit();
  }

  logout() {
    this.payload = { ...EMPTY_STATE };
    this.emit();
  }

  mutate(persona) {
    this.payload = {
      ...this.payload,
      persona,
    };
    this.emit();
  }
}

const nucleus = new Nucleus();
export default nucleus;
