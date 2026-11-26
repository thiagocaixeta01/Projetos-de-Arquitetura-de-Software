import { injectable } from "inversify";
import { IOrderQueue, OrderMessage } from "./IOrderQueue";
import { connectRedis, redis } from "../lib/redis";
import { ORDER_EMAIL_QUEUE } from "./queueNames";

@injectable()
export class RedisOrderQueue implements IOrderQueue {
    async publish(order: OrderMessage): Promise<void> {
        await connectRedis();
        const message = JSON.stringify(order);
        await redis.lPush(ORDER_EMAIL_QUEUE, message);
    }
}