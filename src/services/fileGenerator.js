import fs from 'fs';
import path from 'path';

function formatFixed(value, length) {
    return value.toString().padEnd(length).substring(0, length);
}

export function createEntradaFile(data, sequence) {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `CARD${dateStr}${sequence}.IN`;
    const filePath = path.join(__dirname, '../../files/entrada', filename);
  
    const header = `00${dateStr}000001\n`;
    const trailer = `99${dateStr}${formatFixed(data.length, 8)}\n`;
  
    const registros = data.map(item => {
      return `01${item.data}${item.transacao}${item.agencia}${item.conta}${item.cpf}${formatFixed(item.nome, 40)}${formatFixed(item.nomeCartao, 40)}${item.vencimento}${item.senha}\n`;
    });
  
    fs.writeFileSync(filePath, header + registros.join('') + trailer);
    return filePath;
}
