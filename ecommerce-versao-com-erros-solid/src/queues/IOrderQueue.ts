export type OrderMessage = {
    id: number;
    customer: string;
    items: string;
    total: number;
    status: string;
    createdAt: Date;
}

export interface IOrderQueue {
    publish(order: OrderMessage): Promise<void>;
}