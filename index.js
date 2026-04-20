const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Variável para controlar se Playwright foi instalado
let playwrightReady = false;

// Instala Playwright na inicialização
async function setupPlaywright() {
  try {
    console.log('🔧 Instalando Playwright browsers...');
    
    // Força reinstalação do Chromium
    await execAsync('npx playwright install chromium --with-deps');
    
    console.log('✅ Playwright browsers instalados com sucesso');
    playwrightReady = true;
    
  } catch (error) {
    console.error('❌ Erro ao instalar Playwright:', error.message);
    
    // Fallback: tenta instalar versão específica
    try {
      await execAsync('npx playwright install chromium');
      playwrightReady = true;
      console.log('✅ Playwright instalado com fallback');
    } catch (fallbackError) {
      console.error('❌ Fallback falhou:', fallbackError.message);
    }
  }
}

// Inicia instalação do Playwright
setupPlaywright();

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Servidor ativo', 
    timestamp: new Date().toISOString(),
    playwright: playwrightReady ? 'pronto' : 'instalando...',
    location: 'Brasil - Render'
  });
});

// Automação Gov.br
app.post('/run', async (req, res) => {
  console.log('🚀 Requisição de automação recebida');
  
  // Verifica se Playwright está pronto
  if (!playwrightReady) {
    return res.status(503).json({ 
      ok: false, 
      message: 'Playwright ainda instalando, aguarde alguns segundos...' 
    });
  }
  
  let browser = null;
  
  try {
    // Importa Playwright apenas quando necessário
    const { chromium } = require('playwright');
    
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

    console.log(`Job ${jobId} - Lançando browser Chromium...`);

    // Configuração simplificada mas robusta
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
        '--disable-blink-features=AutomationControlled'
      ]
    });

    console.log('✅ Browser lançado com sucesso!');

    const context = await browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    await reportProgress('executando', 'Navegando para Empresa Fácil', 30, '📍 Acessando empresafacil.ro.gov.br');

    await page.goto('https://www.empresafacil.ro.gov.br/s/login', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    await reportProgress('executando', 'Preenchendo CPF', 50, '⌨️ Digitando CPF');

    const cpfLimpo = credenciais.cpf.replace(/\D/g, '');
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    
    await page.fill('input[name="username"]', cpfFormatado);
    await page.waitForTimeout(2000);
    await page.click('button[type="submit"]');
    
    await reportProgress('executando', 'Redirecionando para Gov.br', 70, '🔄 Aguardando redirecionamento');
    
    await page.waitForTimeout(5000);
    await page.waitForSelector('input[type="password"]', { timeout: 15000 });

    await reportProgress('executando', 'Preenchendo senha Gov.br', 80, '🔐 Digitando senha');

    await page.fill('input[type="password"]', credenciais.senha);
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Entrar"), button[type="submit"]');
    
    await page.waitForTimeout(8000);
    
    const urlFinal = page.url();
    console.log('URL final:', urlFinal);

    if (urlFinal.includes('empresafacil')) {
      const protocolo = `ROB${Date.now().toString().slice(-8)}`;
      
      await reportProgress('concluido', 'Login realizado', 100, `✅ Sucesso! Protocolo: ${protocolo}`);
      await browser.close();
      
      return res.json({ 
        ok: true, 
        message: 'Login Gov.br realizado com IP brasileiro!',
        protocolo: protocolo,
        url: urlFinal
      });
    } else {
      await reportProgress('erro', 'Login falhou', 100, '❌ Credenciais incorretas ou bloqueio detectado');
      await browser.close();
      return res.status(401).json({ ok: false, message: 'Login falhou' });
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ ok: false, message: error.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor ativo na porta ${port}`);
  console.log(`🇧🇷 IP brasileiro via Render`);
  console.log(`🎭 Playwright: ${playwrightReady ? 'pronto' : 'instalando...'}`);
});
