import { IProductRepository } from "../repositories/IProductRepository";
import { IOrderRepository } from "../repositories/IOrderRepository";
import { NotificationService } from "./NotificationService";
import { IPaymentMethod } from "../payments/IPaymentMethod";
import { IProduct } from "../domain/IProduct";
import { AppError } from "../errors/AppError";
import { ProductFactory } from "../domain/ProductFactory";
import { PaymentMethodRegistry } from "../payments/PaymentMethodRegistry";
import { inject, injectable } from "inversify";
import { TYPES } from "../container/types";

@injectable()
export class OrderService {
  constructor(
    @inject(TYPES.ProductRepository) private productRepository: IProductRepository,
    @inject(TYPES.OrderRepository) private orderRepository: IOrderRepository,
    @inject(TYPES.NotificationService) private notificationService: NotificationService,
    @inject(TYPES.PaymentMethodRegistry) private paymentMethodRegistry: PaymentMethodRegistry
  ) {}

  async execute(input: {
    customer: string;
    items: { productId: number; quantity: number }[];
    paymentMethod: string;
    paymentDetails?: any;
  }) {
    // 1. VALIDAR
    if (!input.items || input.items.length === 0) {
      throw new AppError("Carrinho vazio", 400);
    }

    const method = this.paymentMethodRegistry.get(input.paymentMethod);

    // 2. TOTAL
    let total = 0;
    const products: IProduct[] = [];
    const productsDetails: any[] = [];

    for (const item of input.items) {
    const product = await this.productRepository.findById(item.productId);

    if (!product) {
        throw new AppError(`Produto ${item.productId} não encontrado`, 400);
    }

    const richProduct = ProductFactory.createProduct(product);  

    products.push(richProduct);
    productsDetails.push({ ...product, quantity: item.quantity });

    total += richProduct.price * item.quantity + richProduct.calculateFreight();   
    }

    // 3. PAGAR
    await method.process(total, input.paymentDetails);

    // 4. SALVAR
    const order = await this.orderRepository.create({
      customer: input.customer,
      items: JSON.stringify(productsDetails),
      total,
      status: "confirmed",
    });

    // 5. NOTIFICAR
    const emailPreview = await this.notificationService.sendOrderConfirmation(
    input.customer,
    order.id,   
    total,
    products,   
    );

    // 6. RETORNAR
    return { orderId: order.id, emailPreview };
    }
}