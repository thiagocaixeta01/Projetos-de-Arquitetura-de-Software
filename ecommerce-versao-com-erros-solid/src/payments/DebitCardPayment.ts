import { IPaymentMethod } from "./IPaymentMethod";
import logger from '../lib/logger';
import { injectable } from "inversify";

@injectable()
export class DebitCardPayment implements IPaymentMethod {
  readonly name = 'debit_card'

  async process(amount: number): Promise<void> {
    logger.info(`Processando débito no valor de ${amount}`);
  }
}