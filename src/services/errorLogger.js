import fs from 'fs';
import path from 'path';

export async function logError(data, code) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filePath = path.join(__dirname, '../../files/erro', `CARD${dateStr}001.ERR`);

  const linha = `${data.tipo}${data.data}${data.transacao}${code.padEnd(10)}${'Erro de validação'.padEnd(100)}\n`;
  fs.appendFileSync(filePath, linha);
}


