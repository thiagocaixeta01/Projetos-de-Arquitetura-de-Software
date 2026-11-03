import { IOrderRepository } from "./IOrderRepository";
import { prisma } from '../lib/prisma';
import { injectable } from "inversify";

@injectable()
export class PrismaOrderRepository implements IOrderRepository {
    async create(data: { customer: string; items: string; total: number; status: string }) {
    return await prisma.order.create({ data });
  }
}