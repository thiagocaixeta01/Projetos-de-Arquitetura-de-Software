import { Request, Response } from 'express';
import { OrderService } from '../services/OrderService';
import { AppError } from '../errors/AppError';
import logger from '../lib/logger';
import { injectable, inject } from 'inversify';
import { TYPES } from '../container/types';

const MAX_ID = 2147483647;
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

  getOrder = async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);

      if(!Number.isInteger(id) || id <= 0 || id > MAX_ID){
        throw new AppError('Id inválido', 400);
      }

      const order = await this.orderService.getById(id);
      return res.status(200).json(order);
  
    } catch (error: any) {
      return this.handleError(error, res);
    }
  }

  private handleError(error: any, res: Response){
    if(error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    logger.error(`Erro ao processar requisição: ${error.message}`);
    return res.status(500).json({ error: 'Erro interno' });
  }
}