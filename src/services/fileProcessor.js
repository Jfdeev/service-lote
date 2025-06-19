async function processLine(data) {
    try {
      // simulação de regra da API
        if (data.cpf.length !== 11) throw new Error('1202C - CPF inválido');
        if (data.nome.length < 5) throw new Error('1203C - Nome inválido');
        if (data.valor <= 0) throw new Error('1204C - Valor inválido');
        if (data.vencimento < new Date().toISOString().slice(0, 10)) throw new Error('1205C - Vencimento inválido');
        // Simula processamento bem-sucedido
        console.log(`Processado com sucesso: ${data.nome} - ${data.valor}`);
    } catch (err) {
        await logError(data, err.message);
        console.error(`Erro ao processar ${data.nome}: ${err.message}`);

    }
}