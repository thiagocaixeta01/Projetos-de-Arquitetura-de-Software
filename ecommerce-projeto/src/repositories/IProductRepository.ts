export type Product = {
  id: number;
  name: string;
  type: string; // "physical" or "digital"
  price: number;
};

export interface IProductRepository {
  findById(id: number): Promise<Product | null>;
}