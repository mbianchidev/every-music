import { realmConfig } from '../../config/realm.js';
import { mailDispatcher } from './mail-dispatcher.js';

const purposes = {
  reauthenticate: ['Confirm it is you', 'Use this code to confirm a sensitive change to your Every.music account'],
  enroll: ['Set up two-step verification', 'Use this code to finish turning on email two-step verification'],
  login: ['Your sign-in code', 'Use this code to finish signing in to Every.music'],
  step_up: ['Confirm it is you', 'Use this code to confirm a change to your two-step verification settings'],
};

// Account security mail. Returns false (and logs) instead of throwing so
// callers can report delivery status without rolling back committed work.
export const accountMailer = {
  available() {
    return Boolean(mailDispatcher.transporter);
  },

  async send(to, subject, text) {
    if (!mailDispatcher.transporter) {
      mailDispatcher.logger.warn('Account email not sent because mail is unavailable');
      return false;
    }
    try {
      await mailDispatcher.transporter.sendMail({ from: realmConfig.mailTransporter.senderAlias, to, subject, text });
      return true;
    } catch (err) {
      mailDispatcher.logger.error({ err }, 'Failed to dispatch account email');
      return false;
    }
  },

  async sendCode(to, purpose, code) {
    const [subject, lead] = purposes[purpose] ?? purposes.reauthenticate;
    return this.send(to, `Every.music: ${subject}`, `${lead}:\n\n${code}\n\nThe code expires in 10 minutes. If you did not request it, change your password and review your security settings.`);
  },

  async sendDeletionConfirmation(to) {
    return this.send(to, 'Every.music: your account was deleted', [
      'Your Every.music account and its personal data have been permanently deleted at your request.',
      'Conversations you took part in were removed for both participants. Database backups kept by the operator expire on their normal rotation.',
      'If you did not request this, contact the service operator.',
    ].join('\n\n'));
  },
};
