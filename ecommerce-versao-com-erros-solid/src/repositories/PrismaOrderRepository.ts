import { IOrderRepository, Order } from "./IOrderRepository";
import { prisma } from '../lib/prisma';
import { injectable } from "inversify";

@injectable()
export class PrismaOrderRepository implements IOrderRepository {

  async create(data: { 
    customer: string; 
    items: string; 
    total: number; 
    status: string 
  }): Promise<Order> {
    return await prisma.order.create({ data });
  }

  async findById(id: number): Promise<Order | null> {
    return await prisma.order.findUnique({ where: { id } });
  }
}