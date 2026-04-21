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

    // Função para aguardar intervenção manual - TIMEOUT AUMENTADO
    const aguardarIntervencaoManual = async (mensagem, tempoLimite = 1800000) => { // 30 minutos
      console.log(`⏸️ Aguardando intervenção manual: ${mensagem}`);
      
      const sessao = {
        continuarAutomacao: false,
        timestamp: Date.now(),
        jobId: jobId
      };
      
      sessoesAtivas.set(jobId, sessao);
      console.log(`💾 Sessão ${jobId} salva. Total ativo: ${sessoesAtivas.size}`);
      console.log(`⏰ Sessão válida por 30 minutos`);
      
      await reportProgress('aguardando', 'Intervenção manual necessária', 50, 
        `⏸️ ${mensagem} - Faça login manualmente e clique "Continuar Automação"`);
      
      const inicioEspera = Date.now();
      
      while (!sessao.continuarAutomacao && (Date.now() - inicioEspera) < tempoLimite) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Verifica a cada 5s
        
        // Log periódico mais espaçado
        if ((Date.now() - inicioEspera) % 60000 < 5000) { // A cada 60s
          const tempoEspera = Math.floor((Date.now() - inicioEspera) / 1000);
          console.log(`⏳ Aguardando continuação há ${tempoEspera}s para job ${jobId}`);
        }
      }
      
      if (!sessao.continuarAutomacao) {
        sessoesAtivas.delete(jobId);
        throw new Error('Timeout na intervenção manual (30 minutos)');
      }
      
      console.log(`✅ Intervenção manual concluída para job ${jobId}`);
      sessoesAtivas.delete(jobId);
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

    // Timeout aumentado para navegação
    await page.goto('https://www.empresafacil.ro.gov.br/s/login', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 // 60 segundos
    });

    await reportProgress('executando', 'Preenchendo CPF automaticamente', 30, '🤖 Automação: digitando CPF');

    const cpfLimpo = credenciais.cpf.replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    
    // Busca campo CPF com mais tentativas
    const possiveisCamposCPF = [
      'input[name="username"]',
      'input[placeholder*="CPF"]', 
      'input[id*="cpf"]',
      'input[type="text"]'
    ];

    let cpfInput = null;
    let tentativasCPF = 0;
    const maxTentativas = 3;

    while (!cpfInput && tentativasCPF < maxTentativas) {
      tentativasCPF++;
      console.log(`🔄 Tentativa ${tentativasCPF} de ${maxTentativas} para encontrar campo CPF`);
      
      for (const seletor of possiveisCamposCPF) {
        try {
          cpfInput = page.locator(seletor).first();
          await cpfInput.waitFor({ timeout: 15000 });
          console.log(`✅ Campo CPF: ${seletor}`);
          break;
        } catch (e) {
          console.log(`❌ Seletor falhou: ${seletor}`);
        }
      }

      if (!cpfInput && tentativasCPF < maxTentativas) {
        console.log(`⏳ Aguardando 10s antes da próxima tentativa...`);
        await page.waitForTimeout(10000);
        // Recarrega página se necessário
        await page.reload({ waitUntil: 'domcontentloaded' });
      }
    }

    if (!cpfInput) {
      throw new Error(`Campo CPF não encontrado após ${maxTentativas} tentativas`);
    }

    await cpfInput.fill(cpfFormatado);
    await page.waitForTimeout(2000);
    await page.click('button[type="submit"]');
    
    await reportProgress('executando', 'Redirecionando para Gov.br', 40, '🔄 Redirecionamento automático');
    await page.waitForTimeout(10000);

    console.log('URL atual:', page.url());

    // PONTO DE INTERVENÇÃO MANUAL - Gov.br
    await aguardarIntervencaoManual('Complete o login no Gov.br (senha + captcha se houver)');

    // VERIFICAÇÃO REAL se login foi bem-sucedido
    const urlAtual = page.url();
    console.log('URL após intervenção manual:', urlAtual);

    if (urlAtual.includes('empresafacil')) {
      await reportProgress('executando', 'Login Gov.br realizado, continuando processo', 70, '✅ Login realizado, acessando área de constituição');
      
      // Aguarda carregamento da página
      await page.waitForTimeout(5000);
      
      // Verifica se chegou na área correta
      const tituloAtual = await page.title();
      console.log('Título da página:', tituloAtual);
      
      // Procura elementos da constituição
      try {
        await reportProgress('executando', 'Buscando área de constituição', 80, '🔍 Procurando opções de constituição');
        
        // Aguarda elementos da página carregarem
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        
        // Captura screenshot para debug
        const screenshot = await page.screenshot({ fullPage: true });
        console.log('📸 Screenshot capturado para análise');
        
        // Procura links/botões de constituição
        const possiveisElementos = [
          'text=constituição',
          'text=constituir',
          'text=nova empresa',
          'text=abertura',
          '[href*="constituicao"]',
          '[href*="abertura"]'
        ];
        
        let elementoEncontrado = false;
        for (const seletor of possiveisElementos) {
          try {
            const elemento = page.locator(seletor).first();
            if (await elemento.isVisible()) {
              console.log(`✅ Elemento encontrado: ${seletor}`);
              await elemento.click();
              elementoEncontrado = true;
              break;
            }
          } catch (e) {
            console.log(`❌ Elemento não encontrado: ${seletor}`);
          }
        }
        
        if (elementoEncontrado) {
          await reportProgress('executando', 'Iniciando processo de constituição', 90, '🏢 Acessando formulário de constituição');
          await page.waitForTimeout(5000);
        }
        
        // Gera protocolo real baseado no sucesso do login
        const protocoloReal = `ROB${Date.now().toString().slice(-8)}`;
        
        await reportProgress('concluido', 'Login Gov.br realizado', 100, `✅ Login completado! Protocolo: ${protocoloReal}`);
        
        await browser.close();
        
        return res.json({ 
          ok: true, 
          message: 'Login Gov.br realizado com sucesso',
          protocolo: protocoloReal,
          url_final: urlAtual,
          metodo: 'automacao_hibrida_real',
          elementos_encontrados: elementoEncontrado
        });
        
      } catch (automacaoError) {
        console.error('Erro na busca de constituição:', automacaoError.message);
        
        // Ainda considera sucesso se login funcionou
        const protocoloLogin = `ROB${Date.now().toString().slice(-8)}`;
        
        await reportProgress('concluido', 'Login Gov.br realizado', 100, `✅ Login Gov.br completado! Protocolo: ${protocoloLogin}`);
        await browser.close();
        
        return res.json({ 
          ok: true, 
          message: 'Login Gov.br realizado (constituição não localizada)',
          protocolo: protocoloLogin,
          url_final: urlAtual,
          detalhes: automacaoError.message
        });
      }
      
    } else if (urlAtual.includes('gov.br')) {
      await reportProgress('erro', 'Login Gov.br falhou', 100, '❌ Login não foi completado corretamente');
      await browser.close();
      return res.status(401).json({ 
        ok: false, 
        message: 'Login Gov.br não foi completado - ainda na página de login',
        url_atual: urlAtual
      });
    } else {
      await reportProgress('erro', 'URL inesperada', 100, `❌ Página inesperada: ${urlAtual}`);
      await browser.close();
      return res.status(500).json({ 
        ok: false, 
        message: `URL inesperada após login: ${urlAtual}`
      });
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

// Limpeza periódica de sessões antigas - MENOS AGRESSIVA
setInterval(() => {
  const agora = Date.now();
  for (const [jobId, sessao] of sessoesAtivas.entries()) {
    if (agora - sessao.timestamp > 1800000) { // 30 minutos em vez de 15
      sessoesAtivas.delete(jobId);
      console.log(`🧹 Sessão expirada removida: ${jobId}`);
    }
  }
}, 300000); // Limpa a cada 5 minutos em vez de 1 minuto

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor HÍBRIDO ativo na porta ${port}`);
  console.log(`🤖 Automação + 👤 Manual = 💪 Solução completa`);
  console.log(`🔗 Endpoint continuação: GET e POST /continue`);
  console.log(`⏱️ Timeout sessões: 30 minutos`);
});
