export type Order = {
  id: number;
  customer: string;
  items: string;
  total: number;
  status: string;
  createdAt: Date;
}

export interface IOrderRepository {
  create(data: {
    customer: string;
    items: string;
    total: number;
    status: string;
  }): Promise<Order>;

  findById(id: number): Promise<Order | null>;
}
