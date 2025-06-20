import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Emular __dirname em ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helpers de formatação
function somenteDigitos(value) {
  if (value == null) return '';
  return value.toString().replace(/\D/g, '');
}
function formatNum(value, length) {
  const s = somenteDigitos(value);
  // Se vazio, retorna zeros:
  return s.padStart(length, '0').slice(-length);
}
function formatAlpha(value, length) {
  let s = value == null ? '' : value.toString();
  // Remover nova linha, se houver:
  s = s.replace(/[\r\n]/g, ' ');
  if (s.length > length) return s.slice(0, length);
  return s.padEnd(length, ' ');
}
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

export function createEntradaFile(data, sequence) {
  // Código remetente (6 dígitos). Ajuste conforme necessidade:
  const codigoRemetente = process.env.CODIGO_REMETENTE || '1';

  // Valores padrão de agência/conta (4 e 12 dígitos). Configure no .env se tiver:
  const agenciaPadrao = process.env.AGENCIA_PADRAO || '0102';
  const contaPadrao = process.env.CONTA_PADRAO || '653892123456';

  // Data de hoje:
  const hoje = new Date();
  const dateStr = formatDateYYYYMMDD(hoje); // AAAAMMDD
  const seqStr = sequence.toString().padStart(3, '0');
  const filename = `CARD${dateStr}${seqStr}.IN`;

  const dirPath = path.join(__dirname, '../files/entrada');
  fs.mkdirSync(dirPath, { recursive: true });
  const filePath = path.join(dirPath, filename);

  // HEADER: tipo 00 + data + código remetente (6 dígitos)
  const header = '00' + dateStr + formatNum(codigoRemetente, 6) + '\n';

  // BODY: registros tipo 1
  const registros = data.map((item, i) => {
    // Extração de campos:
    const dataSolic = item.data_solicitacao;
    const idTransacao = item.id_transacao ?? item.id;
    let cpfRaw = item.cpf_cliente;
    const nomeCompleto = item.nome_completo || item.name || '';
    const vencimento = item.vencimento;       // DATE ou string
    const senhaHash = item.senha_hash;        // VARCHAR
    
    // Limpeza CPF
    const cpf = somenteDigitos(cpfRaw);
    if (cpf.length !== 11) {
      console.warn(`Registro ${i} CPF inesperado: "${cpfRaw}" → "${cpf}"`);
      // Dependendo do caso, trate erro ou continue com zeros:
      // Aqui, se for inválido, ainda entra com zeros (padStart): formatNum('',11) → '00000000000'
    }

    // Agência/conta: não existem na tabela, usamos padrão, mas logamos aviso:
    if (!process.env.AGENCIA_PADRAO) {
      console.warn(`Registro ${i}: usando AGENCIA_PADRAO="${agenciaPadrao}" pois não há campo real.`);
    }
    if (!process.env.CONTA_PADRAO) {
      console.warn(`Registro ${i}: usando CONTA_PADRAO="${contaPadrao}" pois não há campo real.`);
    }

    // Dia vencimento: extrair dia do campo vencimento se for Date ou string ISO
    let diaVenc = null;
    if (vencimento) {
      const dt = (vencimento instanceof Date)
        ? vencimento
        : new Date(vencimento);
      if (!isNaN(dt)) {
        diaVenc = dt.getDate();
      } else {
        console.warn(`Registro ${i}: vencimento inválido:`, vencimento);
      }
    } else {
      console.warn(`Registro ${i}: sem campo vencimento para extrair dia.`);
    }

    // Monta registro:
    const rec =
      '01'
      + formatDateYYYYMMDD(dataSolic)           // 8 dígitos
      + formatNum(idTransacao, 6)               // 6 dígitos
      + formatNum(agenciaPadrao, 4)             // 4 dígitos (placeholder)
      + formatNum(contaPadrao, 12)              // 12 dígitos (placeholder)
      + formatNum(cpf, 11)                      // 11 dígitos
      + formatAlpha(nomeCompleto, 40)           // 40 chars
      + formatAlpha(nomeCompleto, 40)           // Nome no cartão: aqui usando mesmo nome (ajuste se quiser outro)
      + formatNum(diaVenc, 2)                   // 2 dígitos (se null, vira '00')
      + formatAlpha(senhaHash ? senhaHash.slice(0, 8) : '', 8) // 8 chars
      + '\n';
    return rec;
  });

  // TRAILER: tipo 99 + data + total registros (8 dígitos)
  const totalRegs = registros.length;
  const trailer = '99' + dateStr + formatNum(totalRegs, 8) + '\n';

  fs.writeFileSync(filePath, header + registros.join('') + trailer);
  return filePath;
}

export function createErroFile(erros, sequence) {
  if (!Array.isArray(erros) || erros.length === 0) return null;

  const hoje = new Date();
  const dateStr = formatDateYYYYMMDD(hoje);
  const seqStr = sequence.toString().padStart(3, '0');
  const filenameErr = `CARD${dateStr}${seqStr}.ERR`;

  const dirPath = path.join(__dirname, '../files/entrada');
  fs.mkdirSync(dirPath, { recursive: true });
  const filePathErr = path.join(dirPath, filenameErr);

  // Cada erro deve ter: tipoRegistro (ex.: '01'), dataOriginal (Date ou string), idTransacao, codigoErro, descricao
  const lines = erros.map(e => {
    return e.tipoRegistro
      + formatDateYYYYMMDD(e.dataOriginal)
      + formatNum(e.idTransacao, 6)
      + formatAlpha(e.codigoErro, 10)
      + formatAlpha(e.descricao, 100)
      + '\n';
  });
  fs.writeFileSync(filePathErr, lines.join(''));
  return filePathErr;
}

export async function gerarPreviewCSV(data, sequence) {
  try {
    const { Parser } = await import('json2csv');
    const hoje = new Date();
    const dateStr = formatDateYYYYMMDD(hoje);
    const seqStr = sequence.toString().padStart(3, '0');
    const dirPath = path.join(__dirname, '../files/entrada');
    fs.mkdirSync(dirPath, { recursive: true });

    const previewData = data.map(item => {
      const dataFmt = formatDateYYYYMMDD(item.data_solicitacao);
      const idTrans = item.id_transacao;
      const agencia = process.env.AGENCIA_PADRAO || '';
      const conta = process.env.CONTA_PADRAO || '';
      const cpf = somenteDigitos(item.cpf_cliente);
      const nome = item.nome_completo || item.name || '';
      const nomeCartao = nome;
      const diaVenc = item.vencimento ? (new Date(item.vencimento)).getDate() : '';
      const senha = item.senha_hash ? item.senha_hash.slice(0, 8) : '';
      return {
        Data: dataFmt,
        ID_Transacao: idTrans,
        Agencia: agencia,
        Conta: conta,
        CPF: cpf,
        Nome: nome,
        NomeCartao: nomeCartao,
        DiaVenc: diaVenc,
        Senha: senha
      };
    });
    const parser = new Parser();
    const csv = parser.parse(previewData);
    const previewPath = path.join(dirPath, `CARD${dateStr}${seqStr}_preview.csv`);
    fs.writeFileSync(previewPath, csv);
    console.log('Preview CSV gerado em:', previewPath);
    return previewPath;
  } catch (err) {
    console.error('Erro ao gerar preview CSV:', err);
    return null;
  }
}
