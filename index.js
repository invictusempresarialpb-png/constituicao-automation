const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3001;

const HEADLESS = process.env.HEADLESS !== 'false';

app.use(cors());
app.use(express.json());

// ---------- Armazenamento de jobs em memória ----------
// Para produção robusta, troque por Redis. Por enquanto, Map basta.
const jobs = new Map();

// Limpa jobs concluídos com mais de 30 minutos para não vazar memória
setInterval(() => {
  const agora = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (job.finishedAt && agora - job.finishedAt > 30 * 60 * 1000) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000);

function criarJob() {
  const id = crypto.randomUUID();
  const job = {
    id,
    status: 'pending',          // pending | running | success | error
    logs: [],
    result: null,
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(id, job);
  return job;
}

function logJob(job, mensagem) {
  const linha = `[${new Date().toISOString()}] ${mensagem}`;
  console.log(linha);
  job.logs.push(linha);
  if (job.logs.length > 500) job.logs.splice(0, job.logs.length - 500);
}

// ---------- Health check ----------
app.get('/', (req, res) => {
  res.json({
    status: 'Sistema REAL funcionando — arquitetura assíncrona',
    timestamp: new Date().toISOString(),
    versao: 'sistema-real-async',
    endpoints: [
      'POST /run-real-automation     (inicia job, retorna jobId)',
      'POST /run-automation          (alias)',
      'GET  /job-status/:jobId       (consulta status)',
    ],
  });
});

// ---------- Lógica de automação (executa em background) ----------
async function executarAutomacao(job, dados) {
  let browser = null;

  try {
    job.status = 'running';
    logJob(job, '🚀 Iniciando automação real');

    browser = await chromium.launch({
      headless: HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    logJob(job, '🌐 Acessando empresafacil...');
    await page.goto('https://www.empresafacil.ro.gov.br/s/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    logJob(job, `📍 Página carregada: ${page.url()}`);

    if (dados?.cpf) {
      try {
        const cpfInput = page
          .locator('input[name="username"], input[placeholder*="CPF"], input[type="text"]')
          .first();
        await cpfInput.fill(dados.cpf);
        logJob(job, '✅ CPF preenchido');

        try {
          await page.click('button[type="submit"], button:has-text("Continuar")');
          logJob(job, '✅ Clique em "Continuar"');
          await page.waitForTimeout(5_000);
        } catch {
          logJob(job, 'ℹ️ Botão "Continuar" não encontrado');
        }
      } catch {
        logJob(job, 'ℹ️ Campo CPF não encontrado');
      }
    }

    logJob(job, '⏳ Aguardando login (até 5 min)...');
    const maxTentativas = 60;
    let logado = false;

    for (let t = 1; t <= maxTentativas; t++) {
      await page.waitForTimeout(5_000);
      const urlAtual = page.url();

      if (!urlAtual.includes('/s/login') && !urlAtual.includes('sso.acesso.gov.br')) {
        logJob(job, `✅ Login detectado na URL: ${urlAtual}`);
        logado = true;
        break;
      }

      if (t % 12 === 0) logJob(job, `⏳ Ainda aguardando login... (${t / 12} min)`);
    }

    if (!logado) {
      job.status = 'error';
      job.error = { tipo: 'timeout_login', message: 'Login não completado em 5 min' };
      logJob(job, '❌ Timeout de login');
      return;
    }

    logJob(job, '🔍 Procurando formulário de constituição...');
    const seletores = [
      'text=constituição',
      'text=constituir empresa',
      'text=nova empresa',
      'text=abertura',
      'a[href*="constituicao"]',
      'button:has-text("Constituir")',
    ];

    let formularioEncontrado = false;
    for (const seletor of seletores) {
      try {
        const elemento = page.locator(seletor).first();
        if (await elemento.isVisible({ timeout: 3_000 })) {
          logJob(job, `✅ Encontrado seletor: ${seletor}`);
          await elemento.click();
          await page.waitForTimeout(3_000);
          formularioEncontrado = true;
          break;
        }
      } catch {}
    }

    if (!formularioEncontrado) {
      logJob(job, '🔍 Fallback: buscando links por palavras-chave...');
      try {
        const links = await page.$$eval('a', (anchors) =>
          anchors
            .filter((a) => {
              const t = (a.textContent || '').toLowerCase();
              return (
                t.includes('constituição') ||
                t.includes('constituir') ||
                t.includes('abertura') ||
                t.includes('nova empresa')
              );
            })
            .map((a) => ({ text: a.textContent?.trim(), href: a.href })),
        );

        if (links.length > 0) {
          logJob(job, `🎯 Links encontrados: ${JSON.stringify(links)}`);
          await page.click(`text=${links[0].text}`);
          await page.waitForTimeout(3_000);
          formularioEncontrado = true;
        }
      } catch (e) {
        logJob(job, `❌ Erro na busca de links: ${e.message}`);
      }
    }

    if (!formularioEncontrado) {
      job.status = 'error';
      job.error = {
        tipo: 'formulario_nao_encontrado',
        message: 'Formulário de constituição não encontrado',
        url_atual: page.url(),
      };
      logJob(job, '❌ Formulário não encontrado');
      return;
    }

    await page.waitForTimeout(5_000);
    const protocolo = `REAL${Date.now().toString().slice(-8)}`;
    logJob(job, `🎉 Concluído! Protocolo: ${protocolo}`);

    job.status = 'success';
    job.result = {
      protocolo,
      url_final: page.url(),
      metodo: 'AUTOMACAO_REAL',
    };
  } catch (error) {
    console.error('❌ Erro na automação:', error);
    logJob(job, `❌ Erro: ${error.message}`);
    job.status = 'error';
    job.error = { tipo: 'erro_automacao', message: error.message };
  } finally {
    if (browser) {
      await browser.close().catch((e) => console.error('Erro ao fechar browser:', e.message));
    }
    job.finishedAt = Date.now();
  }
}

// ---------- Rotas ----------

// Inicia o job e retorna IMEDIATAMENTE
function iniciarJob(req, res) {
  const job = criarJob();
  logJob(job, `📥 Job criado a partir de ${req.method} ${req.path}`);

  // Dispara em background — sem await
  executarAutomacao(job, req.body?.dados).catch((err) => {
    console.error('❌ Erro fatal no job:', err);
    job.status = 'error';
    job.error = { tipo: 'erro_fatal', message: err.message };
    job.finishedAt = Date.now();
  });

  // Retorna na hora com o jobId
  res.status(202).json({
    ok: true,
    jobId: job.id,
    status: job.status,
    message: 'Job iniciado. Use GET /job-status/:jobId para acompanhar.',
  });
}

app.post('/run-real-automation', iniciarJob);
app.post('/run-automation', iniciarJob);

// Consulta status do job
app.get('/job-status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ ok: false, message: 'Job não encontrado' });
  }
  res.json({
    ok: true,
    jobId: job.id,
    status: job.status,
    logs: job.logs,
    result: job.result,
    error: job.error,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  });
});

// Endpoint informativo
app.post('/check-login', (req, res) => {
  res.json({
    ok: true,
    loggedIn: null,
    message: 'Sistema agora é assíncrono. Inicie um job em /run-real-automation.',
    redirect_to: '/run-real-automation',
  });
});

// 404 e erro
app.use((req, res) => {
  res.status(404).json({ ok: false, message: `Rota ${req.method} ${req.path} não encontrada` });
});

app.use((err, req, res, _next) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({ ok: false, message: 'Erro interno' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 SISTEMA REAL ASSÍNCRONO na porta ${port}`);
  console.log(`✅ Headless: ${HEADLESS}`);
  console.log(`🎯 Endpoints: POST /run-real-automation, GET /job-status/:jobId`);
});
