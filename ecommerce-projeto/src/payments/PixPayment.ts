import { IPaymentMethod } from "./IPaymentMethod";
import logger from '../lib/logger';
import { injectable } from "inversify";

@injectable()
export class PixPayment implements IPaymentMethod {
  readonly name = 'pix';

  async process(amount: number): Promise<void> {
    logger.info(`Processando Pix no valor de ${amount}`);
  }
}