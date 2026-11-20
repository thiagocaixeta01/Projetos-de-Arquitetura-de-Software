import { IPaymentMethod } from "./IPaymentMethod";
import logger from '../lib/logger';
import { injectable } from "inversify";

@injectable()
export class CreditCardPayment implements IPaymentMethod {
  readonly name = 'credit_card';

  async process(amount: number, details: { cardNumber: string; cvv: string }): Promise<void> {
    
    logger.info(`Processando cartão final ${details.cardNumber.slice(-4)}`);

    if (details.cvv === '000') {
      throw new Error('Cartão recusado');
    }

    logger.info(`Pagamento de cartão processado no valor de ${amount}`);
  }
}