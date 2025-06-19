import amqp from 'amqplib';
import { processLine } from '../services/fileProcessor.js';

export async function consume() {
  const conn = await amqp.connect(process.env.RABBIT_URL);
  const ch = await conn.createChannel();
  const queue = 'lote_queue';

  await ch.assertQueue(queue);
  ch.consume(queue, async (msg) => {
    if (msg !== null) {
      const data = JSON.parse(msg.content.toString());
      await processLine(data);
      ch.ack(msg);
    }
  });
}

