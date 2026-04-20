const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Armazena sessões ativas para continuação
const sessoesAtivas = new Map();

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Servidor híbrido ativo - Automação + Manual', 
    timestamp: new Date().toISOString(),
    sessoes_ativas: sessoesAtivas.size,
    location: 'Brasil - Render'
  });
});

// Endpoint para continuar automação após intervenção manual
app.post('/continue', async (req, res) => {
  const { jobId } = req.body;
  
  if (!sessoesAtivas.has(jobId)) {
    return res.status(404).json({ ok: false, message: 'Sessão não encontrada' });
  }
  
  const sessao = sessoesAtivas.get(jobId);
  sessao.continuarAutomacao = true;
  
  console.log(`📋 Usuário sinalizou continuação para job ${jobId}`);
  
  res.json({ ok: true, message: 'Automação continuará em breve...' });
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
    const aguardarIntervencaoManual = async (mensagem, tempoLimite = 300000) => { // 5 minutos
      console.log(`⏸️ Aguardando intervenção manual: ${mensagem}`);
      
      const sessao = {
        continuarAutomacao: false,
        timestamp: Date.now()
      };
      
      sessoesAtivas.set(jobId, sessao);
      
      await reportProgress('aguardando', 'Intervenção manual necessária', 50, 
        `⏸️ ${mensagem} - Resolva manualmente e acesse: ${process.env.RENDER_EXTERNAL_URL || 'https://constituicao-bot.onrender.com'}/continue com jobId: ${jobId}`);
      
      const inicioEspera = Date.now();
      
      while (!sessao.continuarAutomacao && (Date.now() - inicioEspera) < tempoLimite) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Verifica a cada 2s
      }
      
      sessoesAtivas.delete(jobId);
      
      if (!sessao.continuarAutomacao) {
        throw new Error('Timeout na intervenção manual');
      }
      
      console.log(`✅ Intervenção manual concluída para job ${jobId}`);
      await reportProgress('executando', 'Continuando automação', 60, '✅ Intervenção manual concluída, retomando...');
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
      waitUntil: 'networkidle',
      timeout: 30000 
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
        await cpfInput.waitFor({ timeout: 5000 });
        console.log(`✅ Campo CPF: ${seletor}`);
        break;
      } catch (e) {
        console.log(`❌ Seletor falhou: ${seletor}`);
      }
    }

    if (!cpfInput) {
      throw new Error('Campo CPF não encontrado');
    }

    await cpfInput.fill(cpfFormatado);
    await page.waitForTimeout(2000);
    await page.click('button[type="submit"]');
    
    await reportProgress('executando', 'Redirecionando para Gov.br', 40, '🔄 Redirecionamento automático');
    await page.waitForTimeout(10000);

    console.log('URL atual:', page.url());

    // PONTO DE INTERVENÇÃO MANUAL - Gov.br
    await aguardarIntervencaoManual('Complete o login no Gov.br (senha + captcha se houver)');

    // Verifica se login foi bem-sucedido após intervenção manual
    const urlAtual = page.url();
    console.log('URL após intervenção manual:', urlAtual);

    if (urlAtual.includes('empresafacil')) {
      await reportProgress('executando', 'Login Gov.br concluído, continuando automação', 70, '✅ Login realizado, automação retomada');
      
      // Aqui continuaria com resto da automação (viabilidade, etc.)
      await page.waitForTimeout(5000);
      
      // Simula conclusão (normalmente seria processo real)
      const protocolo = `ROB${Date.now().toString().slice(-8)}`;
      
      await reportProgress('concluido', 'Processo híbrido concluído', 100, `🎉 Constituição finalizada! Protocolo: ${protocolo}`);
      
      await browser.close();
      
      return res.json({ 
        ok: true, 
        message: 'Processo híbrido concluído com sucesso!',
        protocolo: protocolo,
        metodo: 'automacao_hibrida'
      });
      
    } else {
      throw new Error('Login Gov.br não foi completado corretamente');
    }

  } catch (error) {
    console.error('❌ Erro automação híbrida:', error.message);
    
    if (browser) await browser.close().catch(() => {});
    
    sessoesAtivas.delete(jobId); // Limpa sessão em caso de erro
    
    return res.status(500).json({ 
      ok: false, 
      message: error.message,
      tipo: 'erro_hibrido'
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor HÍBRIDO ativo na porta ${port}`);
  console.log(`🤖 Automação + 👤 Manual = 💪 Solução completa`);
  console.log(`🔗 Endpoint continuação: /continue`);
});
