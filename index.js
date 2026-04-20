const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check para o Render
app.get('/', (req, res) => {
  res.json({ 
    status: 'Servidor ativo', 
    timestamp: new Date().toISOString(),
    ip: req.ip,
    location: 'Brasil'
  });
});

// Rota principal de automação
app.post('/run', async (req, res) => {
  console.log('🚀 Iniciando automação constituição empresarial...');
  
  try {
    const { jobId, dados, etapas, credenciais } = req.body;
    
    if (!credenciais?.cpf || !credenciais?.senha) {
      return res.status(400).json({ 
        ok: false, 
        message: 'Credenciais Gov.br obrigatórias' 
      });
    }

    console.log(`Job ${jobId} - Iniciando browser brasileiro...`);

    // Inicia browser com configuração brasileira otimizada
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--lang=pt-BR',
        '--accept-lang=pt-BR,pt,en-US',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor'
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
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8'
      }
    });

    const page = await context.newPage();

    // Remove webdriver detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // Webhook para reportar progresso
    const webhookUrl = process.env.WEBHOOK_URL;
    
    const reportProgress = async (status, etapa, progresso, logMessage) => {
      console.log(`[${jobId}] ${etapa} (${progresso}%)`);
      
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
              log_append: logMessage || `${etapa} (${progresso}%)`
            })
          });
        } catch (e) {
          console.error('Erro webhook:', e.message);
        }
      }
    };

    await reportProgress('executando', 'Navegando para Empresa Fácil RO', 10);

    // Navega para empresa fácil
    console.log('Navegando para empresafacil.ro.gov.br...');
    await page.goto('https://www.empresafacil.ro.gov.br/s/login', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    await reportProgress('executando', 'Preenchendo CPF para redirecionamento', 25);

    // Preenche CPF
    const cpfLimpo = credenciais.cpf.replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    
    console.log(`Preenchendo CPF: ${cpfFormatado.replace(/\d(?=\d{4})/g, '*')}`);
    
    await page.fill('input[name="username"]', cpfFormatado);
    await page.waitForTimeout(2000);
    await page.click('button[type="submit"]');
    
    await reportProgress('executando', 'Aguardando redirecionamento Gov.br', 40);
    
    // Aguarda redirecionamento para gov.br
    await page.waitForTimeout(5000);

    console.log('URL atual:', page.url());

    // Aguarda página gov.br carregar
    await page.waitForSelector('input[type="password"]', { timeout: 20000 });

    await reportProgress('executando', 'Preenchendo credenciais Gov.br', 60);

    // Preenche senha
    console.log('Preenchendo senha Gov.br...');
    await page.fill('input[type="password"]', credenciais.senha);
    await page.waitForTimeout(2000);
    
    // Verifica se tem captcha
    try {
      const captchaElement = page.locator('[data-sitekey], .g-recaptcha, #captcha');
      if (await captchaElement.isVisible()) {
        await reportProgress('executando', '⏳ Captcha detectado - aguardando resolução', 70);
        console.log('Captcha detectado - aguardando...');
        
        // Aguarda resolução do captcha (pode ser manual)
        await page.waitForTimeout(15000);
      }
    } catch (e) {
      console.log('Nenhum captcha detectado');
    }

    // Clica entrar
    console.log('Clicando em Entrar...');
    await page.click('button:has-text("Entrar"), button[type="submit"]');
    
    await reportProgress('executando', 'Processando login Gov.br...', 80);
    
    // Aguarda redirecionamento ou erro
    await page.waitForTimeout(8000);
    
    const urlFinal = page.url();
    console.log('URL final após login:', urlFinal);

    // Verifica se login foi bem-sucedido
    if (urlFinal.includes('empresafacil')) {
      await reportProgress('concluido', '✅ Login Gov.br realizado com sucesso', 100);
      
      await browser.close();
      
      return res.json({ 
        ok: true, 
        message: 'Login Gov.br realizado via IP brasileiro!',
        url: urlFinal,
        ip_servidor: process.env.RENDER_EXTERNAL_IP || 'IP brasileiro'
      });
      
    } else if (urlFinal.includes('gov.br')) {
      // Verifica se há mensagem de erro
      const errorMsg = await page.textContent('body').catch(() => '');
      
      if (errorMsg.includes('senha') || errorMsg.includes('inválid')) {
        await reportProgress('erro', 'Credenciais Gov.br inválidas', 100);
        await browser.close();
        return res.status(401).json({ 
          ok: false, 
          message: 'Credenciais Gov.br inválidas' 
        });
      } else {
        await reportProgress('erro', 'Possível bloqueio detectado', 100);
        await browser.close();
        return res.status(403).json({ 
          ok: false, 
          message: 'Possível bloqueio Gov.br - tentando com IP brasileiro' 
        });
      }
    }

    // URL inesperada
    await reportProgress('erro', 'Redirecionamento inesperado', 100);
    await browser.close();
    
    return res.status(500).json({ 
      ok: false, 
      message: `Redirecionamento inesperado: ${urlFinal}` 
    });

  } catch (error) {
    console.error('❌ Erro na automação:', error);
    
    return res.status(500).json({ 
      ok: false, 
      message: `Erro interno: ${error.message}` 
    });
  }
});

// Rota de upload de contrato
app.post('/upload-contrato', multer().single('arquivo'), (req, res) => {
  try {
    const { jobId } = req.body;
    const arquivo = req.file;
    
    if (!arquivo) {
      return res.status(400).json({ ok: false, message: 'Arquivo não enviado' });
    }
    
    console.log(`Upload contrato job ${jobId}: ${arquivo.originalname}`);
    
    // Aqui normalmente salvaria o arquivo
    // Por agora só confirma recebimento
    
    res.json({ 
      ok: true, 
      message: 'Arquivo recebido',
      filename: arquivo.originalname,
      size: arquivo.size 
    });
    
  } catch (error) {
    console.error('Erro upload:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor constituição empresarial ativo na porta ${port}`);
  console.log(`🇧🇷 Rodando com IP brasileiro via Render`);
  console.log(`📡 Webhook URL: ${process.env.WEBHOOK_URL || 'não configurada'}`);
});
