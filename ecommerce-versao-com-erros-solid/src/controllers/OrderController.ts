import { Request, Response } from 'express';
import { OrderService } from '../services/OrderService';
import { AppError } from '../errors/AppError';
import logger from '../lib/logger';
import { injectable, inject } from 'inversify';
import { TYPES } from '../container/types';


@injectable()
export class OrderController {
  constructor( @inject(TYPES.OrderService) private orderService: OrderService) {}

  processOrder = async (req: Request, res: Response) => {
    try {
      const { customer, items, paymentMethod, paymentDetails } = req.body;

      const result = await this.orderService.execute({
        customer,
        items,
        paymentMethod,
        paymentDetails,
      });

      return res.json({
        message: 'Pedido processado com sucesso',
        orderId: result.orderId,
        emailPreview: result.emailPreview,
      });

    } catch (error: any) {
      if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      logger.error(`Erro ao processar pedido: ${error.message}`);
      return res.status(500).json({ error: 'Erro interno' });
    }
  };
}