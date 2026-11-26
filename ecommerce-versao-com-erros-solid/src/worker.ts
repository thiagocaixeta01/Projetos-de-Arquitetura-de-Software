import 'reflect-metadata';
import 'dotenv/config';

import { container } from './container/container';
import { TYPES } from './container/types';
import { NotificationService } from './services/NotificationService';
import { OrderMessage } from './queues/IOrderQueue';
import { ORDER_EMAIL_QUEUE } from './queues/queueNames';
import { redis, connectRedis } from './lib/redis';
import logger from './lib/logger';

const BRPOP_TIMEOUT_SECONDS = 5;

const RETRY_DELAY_MS = 1000;

let running = true;

function requestStop(signal: string) {
  logger.info(`Sinal ${signal} recebido: o worker vai encerrar depois do pedido em andamento.`);
  running = false;
}
process.on('SIGTERM', () => requestStop('SIGTERM'));
process.on('SIGINT', () => requestStop('SIGINT'));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForMessage(): Promise<string | null> {
  const result = await redis.brPop(ORDER_EMAIL_QUEUE, BRPOP_TIMEOUT_SECONDS);
  return result ? result.element : null;
}

async function main() {
  const notificationService = container.get<NotificationService>(TYPES.NotificationService);

  await connectRedis();

  logger.info(`Worker iniciado, aguardando pedidos na lista "${ORDER_EMAIL_QUEUE}"...`);

  while (running) {
    let raw: string | null = null;
    try {
      raw = await waitForMessage();
    } catch (error: any) {
      logger.error(`Falha ao ler a fila: ${error.message}`);
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    if (raw === null) {
      continue;
    }

    try {
      const message: OrderMessage = JSON.parse(raw);

      const preview = await notificationService.sendOrderConfirmationFromMessage(message);

      logger.info(`Email do pedido #${message.id} enviado: ${preview ?? 'sem link de preview'}`);
    } catch (error: any) {
      logger.error(`Falha ao enviar o e-mail (${error.message}). Mensagem: ${raw}`);
    }
  }

  if (redis.isOpen) {
    await redis.quit();
  }
  logger.info('Worker encerrado.');
}

main().catch((error) => {
  logger.error(`Worker encerrou com erro: ${error.message}`);
  process.exit(1);
});