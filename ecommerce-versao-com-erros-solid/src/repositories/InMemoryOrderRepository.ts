import { injectable } from "inversify";
import { IOrderRepository } from "./IOrderRepository";

@injectable()
export class InMemoryOrderRepository implements IOrderRepository {
    private orders: any[] = [];

    async create(data: { customer: string; items: string; total: number; status: string; }): Promise<{ id: number; }> {
        const id = this.orders.length + 1;
        
        const order = {id, ...data};
        
        this.orders.push(order);
        
        return {id}
    }
}