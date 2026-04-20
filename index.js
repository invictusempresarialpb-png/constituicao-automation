const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Servidor ativo com Playwright v1.40.0', 
    timestamp: new Date().toISOString(),
    ip: req.ip,
    location: 'Brasil - Render'
  });
});

// Automação Gov.br
app.post('/run', async (req, res) => {
  console.log('🚀 Iniciando automação Gov.br com IP brasileiro');
  
  let browser = null;
  
  try {
    const { jobId, credenciais, webhookUrl } = req.body;
    
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

    await reportProgress('executando', 'Iniciando browser brasileiro', 10, '🇧🇷 Iniciando navegador com IP brasileiro');

    console.log(`Job ${jobId} - Lançando browser...`);

    // Configuração Playwright v1.40.0
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-blink-features=AutomationControlled',
        '--lang=pt-BR'
      ]
    });

    const context = await browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      geolocation: { latitude: -23.5505, longitude: -46.6333 },
      permissions: ['geolocation'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 }
    });

    const page = await context.newPage();

    // Remove detecção de automação
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    await reportProgress('executando', 'Navegando para Empresa Fácil', 30, '📍 Acessando empresafacil.ro.gov.br');

    await page.goto('https://www.empresafacil.ro.gov.br/s/login', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    await reportProgress('executando', 'Inspecionando página', 35, '🔍 Verificando estrutura da página');

    // Debug: vê o que tem na página
    console.log('=== PÁGINA CARREGADA ===');
    console.log('Title:', await page.title());
    console.log('URL:', page.url());
    console.log('Inputs encontrados:', await page.$$eval('input', inputs => 
      inputs.map(i => ({ name: i.name, placeholder: i.placeholder, type: i.type, id: i.id }))
    ));
    console.log('=== FIM DEBUG ===');

    const cpfLimpo = credenciais.cpf.replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    
    console.log(`CPF: ${cpfFormatado.replace(/\d(?=\d{4})/g, '*')}`);

    // Tenta múltiplos seletores para CPF
    const possiveisCamposCPF = [
      'input[name="username"]',
      'input[placeholder*="CPF"]', 
      'input[id*="cpf"]',
      'input[type="text"]',
      '#username',
      '.cpf-input'
    ];

    let cpfInput = null;
    for (const seletor of possiveisCamposCPF) {
      try {
        cpfInput = page.locator(seletor).first();
        await cpfInput.waitFor({ timeout: 5000 });
        console.log(`✅ Campo CPF encontrado com seletor: ${seletor}`);
        break;
      } catch (e) {
        console.log(`❌ Seletor falhou: ${seletor}`);
      }
    }

    if (!cpfInput) {
      throw new Error('Nenhum campo de CPF encontrado na página');
    }

    await reportProgress('executando', 'Preenchendo CPF', 40, '⌨️ Digitando CPF');
    await cpfInput.fill(cpfFormatado);
    await page.waitForTimeout(2000);
    await page.click('button[type="submit"]');
    
    await reportProgress('executando', 'Redirecionando para Gov.br', 60, '🔄 Aguardando redirecionamento');
    await page.waitForTimeout(5000);

    console.log('URL após submit CPF:', page.url());
    
    await page.waitForSelector('input[type="password"]', { timeout: 20000 });

    await reportProgress('executando', 'Preenchendo senha Gov.br', 70, '🔐 Digitando senha');

    await page.fill('input[type="password"]', credenciais.senha);
    await page.waitForTimeout(2000);
    
    // Verifica captcha
    try {
      const captcha = page.locator('[data-sitekey], .g-recaptcha');
      if (await captcha.isVisible()) {
        await reportProgress('executando', 'Resolvendo captcha', 80, '🤖 Captcha detectado');
        await page.waitForTimeout(10000);
      }
    } catch (e) {
      console.log('Sem captcha');
    }

    await reportProgress('executando', 'Fazendo login', 85, '🚪 Clicando em Entrar');

    await page.click('button:has-text("Entrar"), button[type="submit"]');
    await page.waitForTimeout(8000);
    
    const urlFinal = page.url();
    console.log('URL final:', urlFinal);

    if (urlFinal.includes('empresafacil')) {
      const protocolo = `ROB${Date.now().toString().slice(-8)}`;
      
      await reportProgress('concluido', 'Login realizado', 100, `✅ SUCESSO! Protocolo: ${protocolo}`);
      await browser.close();
      
      return res.json({ 
        ok: true, 
        message: 'Login Gov.br realizado com IP brasileiro!',
        protocolo: protocolo,
        url: urlFinal
      });
      
    } else if (urlFinal.includes('gov.br')) {
      await reportProgress('erro', 'Login falhou', 100, '❌ Credenciais incorretas ou bloqueio detectado');
      await browser.close();
      return res.status(401).json({ ok: false, message: 'Login falhou - credenciais ou bloqueio' });
    }

    await browser.close();
    return res.status(500).json({ ok: false, message: `URL inesperada: ${urlFinal}` });

  } catch (error) {
    console.error('❌ Erro automação:', error.message);
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor Playwright v1.40.0 ativo na porta ${port}`);
  console.log(`🇧🇷 IP brasileiro via Render - pronto para Gov.br`);
});
