import express from 'express';
import { container } from './container/container';
import { TYPES } from './container/types';
import { OrderController } from './controllers/OrderController';

const app = express();
app.use(express.json());

const orderController = container.get<OrderController>(TYPES.OrderController);

app.post('/orders', orderController.processOrder);
app.get('/orders/:id', orderController.getOrder);

export default app;