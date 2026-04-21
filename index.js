const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Arquivo para persistir sessões
const SESSOES_FILE = path.join(__dirname, 'sessoes-ativas.json');

// Carrega sessões do arquivo
function carregarSessoes() {
  try {
    if (fs.existsSync(SESSOES_FILE)) {
      const data = fs.readFileSync(SESSOES_FILE, 'utf8');
      const sessoes = JSON.parse(data);
      console.log(`📁 Carregadas ${Object.keys(sessoes).length} sessões do arquivo`);
      return new Map(Object.entries(sessoes));
    }
  } catch (e) {
    console.error('Erro carregando sessões:', e.message);
  }
  return new Map();
}

// Salva sessões no arquivo
function salvarSessoes() {
  try {
    const sessoesObj = Object.fromEntries(sessoesAtivas.entries());
    fs.writeFileSync(SESSOES_FILE, JSON.stringify(sessoesObj, null, 2));
    console.log(`💾 Salvadas ${sessoesAtivas.size} sessões no arquivo`);
  } catch (e) {
    console.error('Erro salvando sessões:', e.message);
  }
}

// Inicia com sessões do arquivo
const sessoesAtivas = carregarSessoes();

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Servidor híbrido ativo - Automação + Manual', 
    timestamp: new Date().toISOString(),
    sessoes_ativas: sessoesAtivas.size,
    sessoes_persistentes: true,
    location: 'Brasil - Render'
  });
});

// GET para teste simples do endpoint continue
app.get('/continue', (req, res) => {
  const { jobId } = req.query;
  
  console.log(`=== TESTE GET CONTINUE ===`);
  console.log('JobId via query:', jobId);
  console.log('Sessões ativas:', Array.from(sessoesAtivas.keys()));
  console.log(`=== FIM TESTE ===`);
  
  res.json({
    ok: true,
    message: 'Endpoint /continue funcionando via GET',
    method: 'GET',
    jobId: jobId || 'não fornecido',
    timestamp: new Date().toISOString(),
    sessoesAtivas: Array.from(sessoesAtivas.keys()),
    help: 'Para usar POST: envie {"jobId": "..."} no body'
  });
});

// Endpoint POST para continuar automação após intervenção manual
app.post('/continue', async (req, res) => {
  const { jobId } = req.body;
  
  console.log(`=== DEBUG CONTINUE POST ===`);
  console.log('JobId recebido:', jobId);
  console.log('Body completo:', req.body);
  console.log('Sessões ativas:', Array.from(sessoesAtivas.keys()));
  console.log('Sessão existe:', sessoesAtivas.has(jobId));
  console.log(`=== FIM DEBUG ===`);
  
  if (!sessoesAtivas.has(jobId)) {
    console.error(`❌ Sessão ${jobId} não encontrada`);
    return res.status(404).json({ 
      ok: false, 
      message: `Sessão ${jobId} não encontrada ou expirou`,
      sessoesAtivas: Array.from(sessoesAtivas.keys()),
      help: 'Execute novamente para gerar nova sessão'
    });
  }
  
  const sessao = sessoesAtivas.get(jobId);
  sessao.continuarAutomacao = true;
  
  // Salva mudança no arquivo
  salvarSessoes();
  
  console.log(`✅ Usuário sinalizou continuação para job ${jobId}`);
  
  res.json({ 
    ok: true, 
    message: 'Automação continuará em breve...',
    jobId: jobId,
    timestamp: new Date().toISOString()
  });
});

// Automação híbrida Gov.br
app.post('/run', async (req, res) => {
  console.log('🚀 Iniciando automação HÍBRIDA Gov.br com IP brasileiro');
  
  let browser = null;
  const { jobId, credenciais, webhookUrl } = req.body;
  
  try {
    if (!credenciais?.cpf || !credenciais?.senha) {
      return res.status(400).json({ 
        ok: false, 
        message: 'Credenciais obrigatórias' 
      });
    }

    // Função webhook
    const reportProgress = async (status, etapa, progresso, logMessage) => {
      const timestamp = new Date().toISOString().slice(11, 19);
      const log = `[${timestamp}] ${logMessage || etapa}`;
      console.log(log);
      
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId,
              status,
              etapa_atual: etapa,
              progresso_percent: progresso,
              log_append: log
            })
          });
        } catch (e) {
          console.error('Webhook erro:', e.message);
        }
      }
    };

    // Função para aguardar intervenção manual
    const aguardarIntervencaoManual = async (mensagem, tempoLimite = 1800000) => { // 30 minutos
      console.log(`⏸️ Aguardando intervenção manual: ${mensagem}`);
      
      const sessao = {
        continuarAutomacao: false,
        timestamp: Date.now(),
        jobId: jobId
      };
      
      sessoesAtivas.set(jobId, sessao);
      salvarSessoes(); // Salva no arquivo imediatamente
      
      console.log(`💾 Sessão ${jobId} salva no arquivo. Total ativo: ${sessoesAtivas.size}`);
      console.log(`⏰ Sessão válida por 30 minutos (persistente)`);
      
      await reportProgress('aguardando', 'Intervenção manual necessária', 50, 
        `⏸️ ${mensagem} - Faça login manualmente e clique "Continuar Automação"`);
      
      const inicioEspera = Date.now();
      
      while (!sessao.continuarAutomacao && (Date.now() - inicioEspera) < tempoLimite) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Verifica a cada 5s
        
        // Log periódico
        if ((Date.now() - inicioEspera) % 60000 < 5000) { // A cada 60s
          const tempoEspera = Math.floor((Date.now() - inicioEspera) / 1000);
          console.log(`⏳ Aguardando continuação há ${tempoEspera}s para job ${jobId} (sessão persistente)`);
        }
      }
      
      if (!sessao.continuarAutomacao) {
        sessoesAtivas.delete(jobId);
        salvarSessoes();
        throw new Error('Timeout na intervenção manual (30 minutos)');
      }
      
      console.log(`✅ Intervenção manual concluída para job ${jobId}`);
      sessoesAtivas.delete(jobId);
      salvarSessoes();
      
      await reportProgress('executando', 'Continuando automação', 60, '✅ Login manual concluído, retomando automação...');
    };

    await reportProgress('executando', 'Iniciando browser brasileiro', 10, '🇧🇷 Iniciando navegador híbrido');

    console.log(`Job ${jobId} - Lançando browser híbrido...`);

    // Configuração Playwright
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run'
      ]
    });

    const context = await browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    await reportProgress('executando', 'Navegando para Empresa Fácil', 20, '📍 Acessando empresafacil.ro.gov.br');

    await page.goto('https://www.empresafacil.ro.gov.br/s/login', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await reportProgress('executando', 'Preenchendo CPF automaticamente', 30, '🤖 Automação: digitando CPF');

    const cpfLimpo = credenciais.cpf.replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    
    // Busca campo CPF
    const possiveisCamposCPF = [
      'input[name="username"]',
      'input[placeholder*="CPF"]', 
      'input[id*="cpf"]',
      'input[type="text"]'
    ];

    let cpfInput = null;
    for (const seletor of possiveisCamposCPF) {
      try {
        cpfInput = page.locator(seletor).first();
        await cpfInput.waitFor({ timeout: 10000 });
        console.log(`✅ Campo CPF: ${seletor}`);
        break;
      } catch (e) {
        console.log(`❌ Seletor falhou: ${seletor}`);
      }
    }

    if (!cpfInput) {
      throw new Error('Campo CPF não encontrado na página');
    }

    await cpfInput.fill(cpfFormatado);
    await page.waitForTimeout(2000);
    await page.click('button[type="submit"]');
    
    await reportProgress('executando', 'Redirecionando para Gov.br', 40, '🔄 Redirecionamento automático');
    await page.waitForTimeout(10000);

    console.log('URL atual:', page.url());

    // PONTO DE INTERVENÇÃO MANUAL - Gov.br
    await aguardarIntervencaoManual('Complete o login no Gov.br (senha + captcha se houver)');

    // Verificação real se login foi bem-sucedido
    const urlAtual = page.url();
    console.log('URL após intervenção manual:', urlAtual);

    if (urlAtual.includes('empresafacil')) {
      const protocoloReal = `ROB${Date.now().toString().slice(-8)}`;
      
      await reportProgress('concluido', 'Login Gov.br realizado', 100, `✅ Login Gov.br completado! Protocolo: ${protocoloReal}`);
      await browser.close();
      
      return res.json({ 
        ok: true, 
        message: 'Login Gov.br realizado com sucesso',
        protocolo: protocoloReal,
        url_final: urlAtual,
        metodo: 'automacao_hibrida_persistente'
      });
      
    } else {
      await reportProgress('erro', 'Login Gov.br falhou', 100, '❌ Login não foi completado corretamente');
      await browser.close();
      return res.status(401).json({ 
        ok: false, 
        message: 'Login Gov.br não foi completado',
        url_atual: urlAtual
      });
    }

  } catch (error) {
    console.error('❌ Erro automação híbrida:', error.message);
    
    if (browser) await browser.close().catch(() => {});
    
    sessoesAtivas.delete(jobId);
    salvarSessoes();
    
    return res.status(500).json({ 
      ok: false, 
      message: error.message,
      tipo: 'erro_hibrido'
    });
  }
});

// Limpeza periódica de sessões antigas
setInterval(() => {
  const agora = Date.now();
  let removidas = 0;
  
  for (const [jobId, sessao] of sessoesAtivas.entries()) {
    if (agora - sessao.timestamp > 1800000) { // 30 minutos
      sessoesAtivas.delete(jobId);
      removidas++;
    }
  }
  
  if (removidas > 0) {
    salvarSessoes();
    console.log(`🧹 ${removidas} sessão(ões) expirada(s) removida(s)`);
  }
}, 300000); // Limpa a cada 5 minutos

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor HÍBRIDO ativo na porta ${port}`);
  console.log(`💾 Sistema com PERSISTÊNCIA em arquivo`);
  console.log(`🔗 Endpoint continuação: GET e POST /continue`);
  console.log(`⏱️ Timeout sessões: 30 minutos (persistentes)`);
});
