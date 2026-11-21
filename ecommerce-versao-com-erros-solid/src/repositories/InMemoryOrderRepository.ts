import { injectable } from "inversify";
import { IOrderRepository, Order } from "./IOrderRepository";

@injectable()
export class InMemoryOrderRepository implements IOrderRepository {
    private orders: Order[] = [];

    async create(data: { 
        customer: string; 
        items: string; 
        total: number; 
        status: string;
    }): Promise<Order> {
        
        const id = this.orders.length + 1;
        
        const order = {
            id,
            customer: data.customer,
            items: data.items,
            total: data.total,
            status: data.status,
            createdAt: new Date(),
        };     
        
        this.orders.push(order);
        return order;
    }

    async findById(id: number): Promise<Order | null> {
        return this.orders.find((order) => order.id === id) ?? null;
    }    
}