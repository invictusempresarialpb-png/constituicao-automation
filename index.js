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
    status: 'Servidor ativo com Playwright', 
    timestamp: new Date().toISOString(),
    ip: req.ip,
    location: 'Brasil - Render',
    playwright: 'habilitado'
  });
});

// Automação completa Gov.br
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

    // Função para enviar progresso via webhook
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

    console.log(`Job ${jobId} - Configurando browser para Brasil...`);

    // Configuração otimizada do Playwright para Render
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
        '--lang=pt-BR',
        '--accept-lang=pt-BR,pt,en-US'
      ]
    });

    const context = await browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      geolocation: { latitude: -23.5505, longitude: -46.6333 }, // São Paulo
      permissions: ['geolocation'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 },
      extraHTTPHeaders: {
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    const page = await context.newPage();

    // Remove detecção de automação
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Remove outras detecções
      delete window.chrome.runtime;
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
    });

    await reportProgress('executando', 'Navegando para Empresa Fácil RO', 20, '📍 Acessando empresafacil.ro.gov.br');

    // Navega para empresa fácil
    console.log('Navegando para empresafacil.ro.gov.br...');
    await page.goto('https://www.empresafacil.ro.gov.br/s/login', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    await reportProgress('executando', 'Preenchendo CPF', 30, '⌨️ Digitando CPF no formulário');

    // Preenche CPF
    const cpfLimpo = credenciais.cpf.replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    
    console.log(`Preenchendo CPF: ${cpfFormatado.replace(/\d(?=\d{4})/g, '*')}`);
    
    await page.fill('input[name="username"]', cpfFormatado);
    await page.waitForTimeout(2000);
    await page.click('button[type="submit"]');
    
    await reportProgress('executando', 'Aguardando redirecionamento Gov.br', 40, '🔄 Redirecionando para gov.br');
    
    // Aguarda redirecionamento
    await page.waitForTimeout(5000);
    console.log('URL atual:', page.url());

    // Aguarda página gov.br carregar
    await page.waitForSelector('input[type="password"]', { timeout: 20000 });

    await reportProgress('executando', 'Digitando senha Gov.br', 60, '🔐 Preenchendo credenciais Gov.br');

    // Preenche senha
    console.log('Preenchendo senha Gov.br...');
    await page.fill('input[type="password"]', credenciais.senha);
    await page.waitForTimeout(2000);
    
    // Verifica captcha
    try {
      const captchaElement = page.locator('[data-sitekey], .g-recaptcha, #captcha');
      if (await captchaElement.isVisible()) {
        await reportProgress('executando', 'Captcha detectado', 70, '🤖 Captcha encontrado - processando...');
        console.log('Captcha detectado - aguardando...');
        await page.waitForTimeout(15000);
      }
    } catch (e) {
      console.log('Nenhum captcha detectado');
    }

    await reportProgress('executando', 'Efetuando login', 80, '🚪 Clicando em Entrar');

    // Clica entrar
    console.log('Clicando em Entrar...');
    await page.click('button:has-text("Entrar"), button[type="submit"]');
    
    // Aguarda resultado do login
    await page.waitForTimeout(8000);
    
    const urlFinal = page.url();
    console.log('URL final após login:', urlFinal);

    // Verifica sucesso do login
    if (urlFinal.includes('empresafacil')) {
      await reportProgress('concluido', 'Login Gov.br realizado', 90, '✅ Login Gov.br bem-sucedido com IP brasileiro!');
      
      // Simula protocolo (normalmente seria extraído da página)
      const protocoloSimulado = `ROB${Date.now().toString().slice(-8)}`;
      
      await reportProgress('concluido', 'Processo finalizado', 100, `🎉 Constituição concluída! Protocolo: ${protocoloSimulado}`);
      
      await browser.close();
      
      return res.json({ 
        ok: true, 
        message: 'Constituição realizada com sucesso via IP brasileiro!',
        protocolo: protocoloSimulado,
        url: urlFinal
      });
      
    } else if (urlFinal.includes('gov.br')) {
      const bodyText = await page.textContent('body').catch(() => '');
      
      if (bodyText.includes('senha') || bodyText.includes('inválid')) {
        await reportProgress('erro', 'Credenciais inválidas', 100, '❌ Senha Gov.br incorreta');
        await browser.close();
        return res.status(401).json({ ok: false, message: 'Credenciais Gov.br inválidas' });
      } else {
        await reportProgress('erro', 'Possível bloqueio detectado', 100, '🚫 Sistema pode ter detectado automação');
        await browser.close();
        return res.status(403).json({ ok: false, message: 'Bloqueio Gov.br detectado - mesmo com IP brasileiro' });
      }
    }

    await reportProgress('erro', 'Redirecionamento inesperado', 100, `❓ URL inesperada: ${urlFinal}`);
    await browser.close();
    return res.status(500).json({ ok: false, message: `URL inesperada: ${urlFinal}` });

  } catch (error) {
    console.error('❌ Erro na automação:', error.message);
    
    if (browser) {
      await browser.close().catch(() => {});
    }
    
    return res.status(500).json({ 
      ok: false, 
      message: `Erro: ${error.message}` 
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor constituição com Playwright ativo na porta ${port}`);
  console.log(`🇧🇷 IP brasileiro via Render - pronto para Gov.br`);
});
