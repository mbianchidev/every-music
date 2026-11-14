import nucleus from './nucleus.js';

const DEFAULT_TIMEOUT_MS = 12000;

function apiBaseUrl() {
  return import.meta.env?.VITE_API_BASE_URL?.replace(/\/$/, '') || '/realm';
}

export class ApiError extends Error {
  constructor(message, {
    code = 'REQUEST_FAILED',
    status = 0,
    details,
    cause,
  } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class Conduit {
  constructor({
    baseUrl = apiBaseUrl(),
    fetchImpl = globalThis.fetch.bind(globalThis),
    session = nucleus,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.session = session;
    this.timeoutMs = timeoutMs;
    this.refreshPromise = null;
  }

  async request(path, options = {}) {
    const controller = new AbortController();
    const headers = new Headers(options.headers);

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    if (options.auth) {
      const accessToken = this.session.payload.keys?.accessToken;
      if (!accessToken) {
        throw new ApiError('Your session has ended. Sign in again.', {
          code: 'SESSION_REQUIRED',
          status: 401,
        });
      }
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) controller.abort();
    let streaming = false;
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      if (options.stream && response.ok) {
        streaming = true;
        return response;
      }
      const text = await response.text();
      let payload = null;

      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (error) {
          throw new ApiError('The server returned an unreadable response.', {
            code: 'INVALID_RESPONSE',
            status: response.status,
            cause: error,
          });
        }
      }

      if (!response.ok) {
        throw new ApiError(payload?.error?.message || `Request failed with status ${response.status}`, {
          code: payload?.error?.code,
          status: response.status,
          details: payload?.error?.details,
        });
      }

      return payload?.data ?? payload;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (options.signal?.aborted) throw error;

      if (error.name === 'AbortError') {
        throw new ApiError('The request timed out. Check your connection and try again.', {
          code: 'REQUEST_TIMEOUT',
          cause: error,
        });
      }

      throw new ApiError('Unable to reach Every.music. Check your connection and try again.', {
        code: 'NETWORK_ERROR',
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      if (!streaming) options.signal?.removeEventListener('abort', abort);
    }
  }

  async refreshSession() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const refreshToken = this.session.payload.keys?.refreshToken;
    if (!refreshToken) {
      throw new ApiError('Your session has ended. Sign in again.', {
        code: 'SESSION_EXPIRED',
        status: 401,
      });
    }

    this.refreshPromise = this.request('/auth/refresh-token', {
      method: 'POST',
      body: { refreshToken },
    })
      .then((keys) => {
        if (this.session.payload.keys?.refreshToken !== refreshToken) {
          throw new ApiError('Your sign-in changed while this request was running. Try again.', { code: 'SESSION_CHANGED', status: 409 });
        }
        this.session.updateTokens(keys);
        return keys;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  expireSession() {
    this.session.logout();
    globalThis.window?.dispatchEvent(new CustomEvent('everymusic:session-expired'));
  }

  async transmit(path, options = {}) {
    const userId = this.session.payload.persona?.userId;
    const accessToken = this.session.payload.keys?.accessToken;
    const ensureSession = () => {
      if (options.auth && this.session.payload.persona?.userId !== userId) {
        throw new ApiError('Your sign-in changed while this request was running. Try again.', { code: 'SESSION_CHANGED', status: 409 });
      }
    };
    try {
      const result = await this.request(path, options);
      ensureSession();
      return result;
    } catch (error) {
      ensureSession();
      if (!options.auth || error.status !== 401 || options.retry === false) {
        throw error;
      }

      try {
        if (this.session.payload.keys?.accessToken === accessToken) await this.refreshSession();
      } catch (refreshError) {
        ensureSession();
        if (refreshError.status === 401) {
          this.expireSession();
        }
        throw refreshError;
      }

      ensureSession();
      const result = await this.request(path, {
        ...options,
        retry: false,
      });
      ensureSession();
      return result;
    }
  }
}

const conduit = new Conduit();
export default conduit;
