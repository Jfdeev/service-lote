import dotenv from 'dotenv';
import cron from 'node-cron';
import { processarLote } from './services/loteService.js';

dotenv.config();


cron.schedule('0 3 * * *', async () => {
  console.log(`[CRON] Executando processamento de lote às ${new Date().toLocaleString()}`);
  await processarLote();
});


processarLote();
