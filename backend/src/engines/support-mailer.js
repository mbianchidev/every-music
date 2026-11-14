import { mailDispatcher } from './mail-dispatcher.js';

const labels = { bug: 'Bug report', contact: 'Contact request', work: 'Work with us' };
const oneLine = value => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 160);

export function supportMessage({ id, userId, request }) {
  const lines = [
    `${labels[request.kind]} ${id}`,
    `Account: ${userId ? `signed-in user ${userId}` : 'not signed in'}`,
    `Name: ${request.contactName || 'not provided'}`,
    `Email: ${request.contactEmail || 'not provided (reply in the admin inbox)'}`,
    '',
    `Subject: ${request.subject}`,
    '',
    request.message,
  ];
  if (request.steps) lines.push('', 'Steps to reproduce:', request.steps);
  if (request.link) lines.push('', `Link: ${request.link}`);
  if (request.diagnostics) {
    lines.push('', 'Technical details shared with consent:');
    for (const [key, value] of Object.entries(request.diagnostics)) lines.push(`${key}: ${value}`);
  }
  return {
    subject: `[Every.music] ${labels[request.kind]}: ${oneLine(request.subject)}`,
    text: lines.join('\n'),
  };
}

// Forwards a stored request to SUPPORT_EMAIL through the shared SMTP
// transport. Returns false when forwarding is disabled or mail is unavailable.
export async function forwardSupportRequest({ config, logger, id, userId, request, dispatcher = mailDispatcher }) {
  if (!config.support?.email) return false;
  if (!dispatcher.transporter) {
    logger.warn({ supportRequestId: id }, 'Support request stored but not forwarded because mail is unavailable');
    return false;
  }
  const message = supportMessage({ id, userId, request });
  await dispatcher.transporter.sendMail({
    from: config.mailTransporter.senderAlias,
    to: config.support.email,
    replyTo: request.contactEmail || undefined,
    subject: message.subject,
    text: message.text,
  });
  return true;
}
