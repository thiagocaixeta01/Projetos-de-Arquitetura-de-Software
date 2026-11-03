import nodemailer from 'nodemailer';
import { getMailClient } from '../lib/mail';
import { IMailProvider } from './IMailProvider';
import { injectable } from 'inversify';

@injectable()
export class EtherealMailProvider implements IMailProvider {
  async sendMail(data: { to: string; subject: string; text: string; html: string }): Promise<string | null> {
    const mailer = await getMailClient();

    const info = await mailer.sendMail({
      from: '"DevStore" <noreply@devstore.com>',
      to: data.to,
      subject: data.subject,
      text: data.text,
      html: data.html,
    });

    return nodemailer.getTestMessageUrl(info) || null;
  }
}