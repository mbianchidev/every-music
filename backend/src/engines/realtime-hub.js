import { PassThrough } from 'node:stream';
import { requestError } from './request-error.js';

export class RealtimeHub {
  constructor(connector, logger) {
    this.connector = connector;
    this.logger = logger;
    this.clients = new Set();
    this.starting = null;
    this.stopListening = null;
    this.closed = false;
  }

  async start() {
    if (this.closed) throw requestError(503, 'EVENTS_UNAVAILABLE', 'Live updates are restarting');
    if (this.stopListening) return;
    if (!this.starting) {
      this.starting = this.connector.listen('everymusic_events', event => {
        for (const client of this.clients) {
          if (client.stream.destroyed || client.stream.writableEnded) { this.clients.delete(client); continue; }
          if (!event.userId || event.userId === client.userId) {
            if (!client.stream.write(`data: ${JSON.stringify(event)}\n\n`)) client.stream.destroy();
            else if (event.type === 'account.changed') { this.clients.delete(client); client.stream.end(); }
          }
        }
      }, () => {
        this.stopListening = null;
        for (const client of this.clients) client.stream.destroy();
      }).then(stop => { this.stopListening = stop; })
        .finally(() => { this.starting = null; });
    }
    await this.starting;
  }

  async subscribe({ userId, expiresAt }) {
    await this.start();
    if (this.closed) throw requestError(503, 'EVENTS_UNAVAILABLE', 'Live updates are restarting');
    if (this.clients.size >= 1000 || [...this.clients].filter(client => client.userId === userId).length >= 3) {
      throw requestError(429, 'EVENT_CONNECTION_LIMIT', 'Too many live connections; close another tab and retry');
    }
    const stream = new PassThrough({ highWaterMark: 16384 });
    const client = { stream, userId };
    this.clients.add(client);
    stream.write('data: {"type":"connected"}\n\n');
    const timer = setInterval(() => {
      if (!stream.write(': heartbeat\n\n')) {
        stream.destroy();
      }
    }, 15000);
    timer.unref();
    const expiration = setTimeout(() => stream.end(), Math.max(1, expiresAt * 1000 - Date.now()));
    expiration.unref();
    stream.once('close', () => {
      clearInterval(timer);
      clearTimeout(expiration);
      this.clients.delete(client);
    });
    return stream;
  }

  async close() {
    this.closed = true;
    for (const client of this.clients) client.stream.destroy();
    await this.starting;
    await this.stopListening?.();
    this.stopListening = null;
  }
}
