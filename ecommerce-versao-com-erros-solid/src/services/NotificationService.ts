import { IMailProvider } from '../providers/IMailProvider';
import { IProduct } from '../domain/IProduct';
import { inject, injectable } from 'inversify';
import { TYPES } from '../container/types';

@injectable()
export class NotificationService {
  constructor( @inject(TYPES.MailProvider) private mailProvider: IMailProvider) {}

  async sendOrderConfirmation(
    customer: string,
    orderId: number,
    total: number,
    products: IProduct[],
  ): Promise<string | null> {
    const subject = `Confirmação do Pedido #${orderId}`;
    const text = `Olá, seu pedido #${orderId} no valor de R$ ${total} foi confirmado.`;
    const html = `
      <h1>Pedido Confirmado!</h1>
      <p>Olá, seu pedido <b>#${orderId}</b> foi processado com sucesso.</p>
      <p>Total: <strong>R$ ${total}</strong></p>
      <ul>
        ${products.map(product => `<li>${product.name}</li>`).join('')}
      </ul>
    `;

    const info = await this.mailProvider.sendMail({
      to: customer,
      subject,
      text,
      html,
    });

    return info || null;
  }
}