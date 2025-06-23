// src/services/loteService.js
import db from '../database/neonClient.js';
import { createEntradaFile, createErroFile, gerarPreviewCSV } from './fileGenerator.js';
import { publishMessage } from '../queue/producer.js';
import fs from 'fs';
import path from 'path';

function formatDateYYYYMMDD(value) {
  if (!value) return '00000000';
  if (value instanceof Date) {
    const yyyy = value.getFullYear().toString().padStart(4, '0');
    const mm = (value.getMonth() + 1).toString().padStart(2, '0');
    const dd = value.getDate().toString().padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }
  const s = value.toString();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}${match[2]}${match[3]}`;
  }
  if (/^\d{8}$/.test(s)) {
    return s;
  }
  return '00000000';
}

function determineSequence() {
  const hoje = new Date();
  const dateStr = formatDateYYYYMMDD(hoje);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  let count = 0;
  try {
    const files = fs.readdirSync(dirPath);
    const regex = new RegExp(`^CARD${dateStr}(\\d{3})\\.IN$`);
    files.forEach(name => {
      if (regex.test(name)) count++;
    });
  } catch {
    count = 0;
  }
  return count + 1;
}

export async function processarLote() {
  try {
    const result = await db.query(`
      SELECT
        sc.id AS id_transacao,
        sc.data_solicitacao,
        sc.cpf_cliente,
        c.name AS nome_completo,
        ct.vencimento,
        ct.senha_hash
      FROM solicitacao_cartao sc
      JOIN cliente c ON c.cpf = sc.cpf_cliente
      JOIN cartao ct ON ct.id = sc.cartao_id
      WHERE sc.status = 'SOLICITADO'
    `);

    const rows = result.rows;
    console.log(`Total de registros lidos: ${rows.length}`);
    if (rows.length === 0) {
      console.log('Nenhum registro com status SOLICITADO.');
      return;
    }

    const validRows = [];
    const erros = [];

    rows.forEach(item => {
      const { data_solicitacao, id_transacao, cpf_cliente, name, vencimento, senha_hash } = item;

      const cpf = cpf_cliente ? cpf_cliente.toString().replace(/\D/g, '') : '';
      if (!cpf || cpf.length !== 11) {
        erros.push({ tipoRegistro: '01', dataOriginal: data_solicitacao, idTransacao: id_transacao, codigoErro: '1202C', descricao: `CPF inválido: "${cpf_cliente}"` });
        return;
      }
      if (!data_solicitacao) {
        erros.push({ tipoRegistro: '01', dataOriginal: null, idTransacao: id_transacao, codigoErro: 'XXXXA', descricao: 'Data de solicitação ausente' });
        return;
      }
      if (!name) {
        erros.push({ tipoRegistro: '01', dataOriginal: data_solicitacao, idTransacao: id_transacao, codigoErro: '1504E', descricao: 'Nome completo ausente' });
        return;
      }
      if (!vencimento) {
        erros.push({ tipoRegistro: '01', dataOriginal: data_solicitacao, idTransacao: id_transacao, codigoErro: 'XXXXB', descricao: 'Vencimento ausente' });
        return;
      }
      if (!senha_hash) {
        erros.push({ tipoRegistro: '01', dataOriginal: data_solicitacao, idTransacao: id_transacao, codigoErro: 'XXXXC', descricao: 'Senha ausente' });
        return;
      }

      validRows.push(item);
    });

    const sequence = determineSequence();

    if (validRows.length > 0) {
      const fileInPath = createEntradaFile(validRows, sequence);
      console.log(`.IN gerado em: ${fileInPath}`);
      gerarPreviewCSV(validRows, sequence);
    } else {
      console.log('Nenhum registro válido para .IN');
    }

    if (erros.length > 0) {
      const fileErrPath = createErroFile(erros, sequence);
      console.log(`.ERR gerado em: ${fileErrPath}`);
    }

    for (const row of validRows) {
      try {
        await publishMessage(row);
        // await db.query('UPDATE solicitacao_cartao SET status = $1 WHERE id = $2', ['PROCESSADO', row.id_transacao]);
      } catch (err) {
        console.error(`Erro ao publicar registro ${row.id_transacao}:`, err);
      }
    }

    console.log(`Publicação concluída para ${validRows.length} registros.`);
  } catch (err) {
    console.error('Erro ao processar lote:', err);
  } finally {
    db.end();
    console.log('Conexão com o banco de dados encerrada.');
  }
}
