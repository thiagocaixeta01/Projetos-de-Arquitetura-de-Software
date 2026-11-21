import { Product } from "../repositories/IProductRepository";
import { DigitalProduct } from "./DigitalProduct";
import { IProduct } from "./IProduct";
import { PhysicalProduct } from "./PhysicalProduct";

export class ProductFactory {
  static createProduct(data: Product): IProduct {
    
    if (data.type === 'physical') {
        return new PhysicalProduct(data.id, data.name, data.price);
    }
    if (data.type === 'digital') {
        return new DigitalProduct(data.id, data.name, data.price);
    }

    throw new Error(`Tipo de produto desconhecido: ${data.type}`);
  }
}