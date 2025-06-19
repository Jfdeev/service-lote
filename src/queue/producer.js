import amqp from 'amqplib';

export async function publishMessage(message) {
  const conn = await amqp.connect(process.env.RABBIT_URL);
  const ch = await conn.createChannel();
  const queue = 'lote_queue';

  await ch.assertQueue(queue);
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(message)));
}


