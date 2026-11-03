import { Container } from "inversify";
import { TYPES } from "./types";

import { IMailProvider } from "../providers/IMailProvider";
import { IOrderRepository } from "../repositories/IOrderRepository";
import { IProductRepository } from "../repositories/IProductRepository";
import { IPaymentMethod } from "../payments/IPaymentMethod";

import { EtherealMailProvider } from "../providers/EtherealMailProvider";
import { PrismaOrderRepository } from "../repositories/PrismaOrderRepository";
import { PrismaProductRepository } from "../repositories/PrismaProductRepository";

import { ConsoleMailProvider } from "../providers/ConsoleMailProvider";
import { InMemoryOrderRepository } from "../repositories/InMemoryOrderRepository";

import { CreditCardPayment } from "../payments/CreditCardPayment";
import { DebitCardPayment } from "../payments/DebitCardPayment";
import { PixPayment } from "../payments/PixPayment";

import { PaymentMethodRegistry } from "../payments/PaymentMethodRegistry";
import { NotificationService } from "../services/NotificationService";
import { OrderService } from "../services/OrderService";
import { OrderController } from "../controllers/OrderController";

const mode = process.env.APP_ENV ?? 'dev';

if (mode !== 'dev' && mode !== 'test') {
    throw new Error(`APP_ENV inválido: "${mode}". Use "dev" ou "test".`);
}

const container = new Container();

if (mode === 'test') {
    container.bind<IMailProvider>(TYPES.MailProvider).to(ConsoleMailProvider).inSingletonScope();
    container.bind<IOrderRepository>(TYPES.OrderRepository).to(InMemoryOrderRepository).inSingletonScope();
} else {
    container.bind<IMailProvider>(TYPES.MailProvider).to(EtherealMailProvider).inSingletonScope();
    container.bind<IOrderRepository>(TYPES.OrderRepository).to(PrismaOrderRepository).inSingletonScope();
}

container.bind<IProductRepository>(TYPES.ProductRepository).to(PrismaProductRepository).inSingletonScope();

container.bind<IPaymentMethod>(TYPES.PaymentMethod).to(CreditCardPayment);
container.bind<IPaymentMethod>(TYPES.PaymentMethod).to(DebitCardPayment);
container.bind<IPaymentMethod>(TYPES.PaymentMethod).to(PixPayment);

container.bind<PaymentMethodRegistry>(TYPES.PaymentMethodRegistry).to(PaymentMethodRegistry).inSingletonScope();
container.bind<NotificationService>(TYPES.NotificationService).to(NotificationService).inSingletonScope();
container.bind<OrderService>(TYPES.OrderService).to(OrderService).inSingletonScope();
container.bind<OrderController>(TYPES.OrderController).to(OrderController).inSingletonScope();

export { container };