import { createClient } from "redis";
import logger from "./logger";

const url = process.env.REDIS_URL;

if (!url) {
    throw new Error('REDIS_URL não está definida no ambiente. Verifique o arquivo .env');
}

export const redis = createClient({ url });

redis.on('error', (error) => logger.error(`Erro no cliente Redis: ${error.message}`));

export async function connectRedis(): Promise<void> {
    if(!redis.isOpen) {
        await redis.connect();
        logger.info('Conectado ao Redis');
    }
}