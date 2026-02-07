import nodemailer from 'nodemailer';
import { realmConfig } from '../../config/realm.js';

class MailDispatcher {
  constructor() {
    this.transporter = null;
  }

  async initialize() {
    this.transporter = nodemailer.createTransport({
      host: realmConfig.mailTransporter.gateway,
      port: realmConfig.mailTransporter.port,
      secure: false,
      auth: {
        user: realmConfig.mailTransporter.identity,
        pass: realmConfig.mailTransporter.credential,
      },
    });

    try {
      await this.transporter.verify();
      console.log('✓ Mail dispatcher ready');
    } catch (err) {
      console.warn('⚠ Mail dispatcher unavailable:', err.message);
    }
  }

  async dispatchVerification(recipientEmail, verificationToken) {
    if (!this.transporter) {
      console.warn('Mail dispatcher not initialized');
      return false;
    }

    const verificationLink = `${realmConfig.boundaries.portalOrigin}/verify-email?token=${verificationToken}`;
    
    const mailContent = {
      from: realmConfig.mailTransporter.senderAlias,
      to: recipientEmail,
      subject: '🎵 Verify your Every.music account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to Every.music!</h2>
          <p>Thank you for joining our community of musicians.</p>
          <p>Please verify your email address by clicking the button below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verificationLink}" 
               style="background-color: #6366f1; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Verify Email
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Or copy this link: <br/>
            <a href="${verificationLink}">${verificationLink}</a>
          </p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This link expires in 24 hours. If you didn't create an account, please ignore this email.
          </p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailContent);
      return true;
    } catch (err) {
      console.error('Failed to dispatch verification mail:', err);
      return false;
    }
  }

  async dispatchPasswordReset(recipientEmail, resetToken) {
    if (!this.transporter) {
      return false;
    }

    const resetLink = `${realmConfig.boundaries.portalOrigin}/reset-password?token=${resetToken}`;
    
    const mailContent = {
      from: realmConfig.mailTransporter.senderAlias,
      to: recipientEmail,
      subject: '🔒 Reset your Every.music password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>We received a request to reset your password.</p>
          <p>Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #ef4444; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Or copy this link: <br/>
            <a href="${resetLink}">${resetLink}</a>
          </p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            This link expires in 1 hour. If you didn't request this, please ignore this email.
          </p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailContent);
      return true;
    } catch (err) {
      console.error('Failed to dispatch reset mail:', err);
      return false;
    }
  }
}

export const mailDispatcher = new MailDispatcher();
