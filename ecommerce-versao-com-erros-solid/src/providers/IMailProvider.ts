export interface IMailProvider {
  sendMail(data: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<string | null>;
}