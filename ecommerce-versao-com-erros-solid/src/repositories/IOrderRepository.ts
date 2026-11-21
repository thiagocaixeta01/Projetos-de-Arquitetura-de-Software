export interface IOrderRepository {
  create(data: {
    customer: string;
    items: string;
    total: number;
    status: string;
  }): Promise<{ id: number }>;
}