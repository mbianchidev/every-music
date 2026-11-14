import { realmConfig } from '../../config/realm.js';

// SMS providers implement `send(to, body)` and throw on delivery failure.
// Only Twilio is bundled; SMS is disabled when no provider is configured.
export class TwilioSmsProvider {
  constructor({ accountSid, authToken, fromNumber, messagingServiceSid }, {
    fetchImpl = (...args) => globalThis.fetch(...args),
    baseUrl = 'https://api.twilio.com',
    timeoutMs = 10000,
  } = {}) {
    this.name = 'twilio';
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
    this.messagingServiceSid = messagingServiceSid;
    this.fetchImpl = fetchImpl;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  async send(to, body) {
    const form = new URLSearchParams({ To: to, Body: body });
    if (this.messagingServiceSid) form.set('MessagingServiceSid', this.messagingServiceSid);
    else form.set('From', this.fromNumber);
    const response = await this.fetchImpl(`${this.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const error = new Error(`SMS provider responded with HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
  }
}

export function createSmsGateway(sms = realmConfig.accountTrust?.sms, options = {}) {
  const twilio = sms?.twilio;
  if (twilio?.accountSid && twilio.authToken && (twilio.fromNumber || twilio.messagingServiceSid)) {
    return new TwilioSmsProvider(twilio, options);
  }
  return null;
}
