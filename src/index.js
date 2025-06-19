import { createEntradaFile } from './services/fileGenerator.js';
import db  from './database/neonClient.js';
import { publishMessage } from './queue/producer.js';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    try {
      // 1. Busca os dados do banco
      const result = await db.query('SELECT * FROM solicitacao_cartao');
  
      // 2. Gera o arquivo .IN com base nos dados
      const filePath = await createEntradaFile(result.rows, '001');
      console.log(`Arquivo gerado em: ${filePath}`);
  
      // 3. Publica cada linha no RabbitMQ
      for (const row of result.rows) {
        await publishMessage(row);
      }
  
      console.log('Todos os registros foram enviados para o RabbitMQ.');
    } catch (error) {
      console.error('Erro durante o processamento:', error);
      process.exit(1);
    } finally {
      // 4. Encerra conexão com o banco de dados
      await db.end();
    }
}

main().catch(error => {
    console.error('Erro na execução principal:', error);
    process.exit(1);
});