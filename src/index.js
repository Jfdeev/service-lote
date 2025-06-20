import db from './database/neonClient.js';
import { createEntradaFile, createErroFile, gerarPreviewCSV } from './services/fileGenerator.js';
import dotenv from 'dotenv';
import { publishMessage } from './queue/producer.js';
import fs from 'fs';
import path from 'path';


dotenv.config();

/**
 * Formata data Date ou string para AAAAMMDD
 * (duplicado ou importe do fileGenerator se disponível externamente)
 */
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

/**
 * Determina a sequência diária de arquivo, contando arquivos já gerados hoje.
 * Procura em src/files/entrada arquivos com prefixo CARDYYYYMMDDXXX.IN
 */
function determineSequence() {
  const hoje = new Date();
  const dateStr = formatDateYYYYMMDD(hoje);
  const dirPath = path.join(new URL('.', import.meta.url).pathname, '../files/entrada');
  let count = 0;
  try {
    const files = fs.readdirSync(dirPath);
    const regex = new RegExp(`^CARD${dateStr}(\\d{3})\\.IN$`);
    files.forEach(name => {
      if (regex.test(name)) count++;
    });
  } catch (err) {
    // Diretório pode não existir ainda
    count = 0;
  }
  return count + 1;
}

async function main() {
  try {
    // 1. Query para registros de solicitacao_cartao com status SOLICITADO
    const result = await db.query(`
      SELECT
        sc.id AS id_transacao,
        sc.data_solicitacao,
        sc.cpf_cliente,
        c.name AS nome_completo,
        ct.vencimento AS vencimento,
        ct.senha_hash AS senha_hash
      FROM solicitacao_cartao sc
      JOIN cliente c ON c.cpf = sc.cpf_cliente
      JOIN cartao ct ON ct.id = sc.cartao_id
      WHERE sc.status = 'SOLICITADO'
    `);

    const rows = result.rows;
    console.log(`Total de registros lidos: ${rows.length}`);
    if (rows.length === 0) {
      console.log('Não há registros SOLICITADO para processar.');
      return;
    }

    // 2. Validar registros e coletar erros
    const validRows = [];
    const erros = [];

    rows.forEach((item, i) => {
      const dataSolic = item.data_solicitacao;
      const idTransacao = item.id_transacao;
      const cpfRaw = item.cpf_cliente;
      const nomeCompleto = item.nome_completo;
      const vencimento = item.vencimento;
      const senhaHash = item.senha_hash;

      // Limpeza e validação básica de CPF
      const cpf = cpfRaw ? cpfRaw.toString().replace(/\D/g, '') : '';
      if (!cpfRaw || cpf.length !== 11) {
        erros.push({ tipoRegistro: '01', dataOriginal: dataSolic, idTransacao, codigoErro: '1202C', descricao: `CPF inválido ou ausente: "${cpfRaw}"` });
        return;
      }
      // Data de solicitação obrigatória
      if (!dataSolic) {
        erros.push({ tipoRegistro: '01', dataOriginal: dataSolic, idTransacao, codigoErro: 'XXXXA', descricao: `Data de solicitação ausente` });
        return;
      }
      // Nome completo obrigatório
      if (!nomeCompleto) {
        erros.push({ tipoRegistro: '01', dataOriginal: dataSolic, idTransacao, codigoErro: '1504E', descricao: `Nome completo ausente` });
        return;
      }
      // Vencimento obrigatório
      if (!vencimento) {
        erros.push({ tipoRegistro: '01', dataOriginal: dataSolic, idTransacao, codigoErro: 'XXXXB', descricao: `Vencimento do cartão ausente` });
        return;
      }
      // Senha criptografada obrigatória
      if (!senhaHash) {
        erros.push({ tipoRegistro: '01', dataOriginal: dataSolic, idTransacao, codigoErro: 'XXXXC', descricao: `Senha criptografada ausente` });
        return;
      }
      // Se passou em todas as validações:
      validRows.push(item);
    });

    // 3. Determinar sequência diária
    const sequence = determineSequence();

    // 4. Gerar arquivos
    if (validRows.length > 0) {
      const fileInPath = createEntradaFile(validRows, sequence);
      console.log(`Arquivo .IN gerado em: ${fileInPath}`);
      // Gera preview CSV
      gerarPreviewCSV(validRows, sequence);
    } else {
      console.log('Nenhum registro válido para gerar .IN');
    }
    if (erros.length > 0) {
      const fileErrPath = createErroFile(erros, sequence);
      console.log(`Arquivo .ERR gerado em: ${fileErrPath}`);
    } else {
      console.log('Nenhum erro de validação – não será gerado .ERR');
    }

    // 5. Publicar registros válidos no RabbitMQ
    if (validRows.length > 0) {
      for (const registro of validRows) {
        try {
          await publishMessage(registro);
          // Opcional: atualizar status no banco para evitar reprocessamento
          // await db.query('UPDATE solicitacao_cartao SET status = $1 WHERE id = $2', ['PROCESSADO', registro.id_transacao]);
        } catch (pubErr) {
          console.error(`Falha ao publicar registro ${registro.id_transacao}:`, pubErr);
          // Opcional: coletar falhas de publicação para arquivo de erro ou retry
        }
      }
      console.log(`Publicação finalizada: ${validRows.length} envios tentados.`);
    } else {
      console.log('Nenhum registro válido para publicar no RabbitMQ.');
    }

  } catch (error) {
    console.error('Erro durante o processamento:', error);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main().catch(err => console.error('Erro não capturado na execução principal:', err));