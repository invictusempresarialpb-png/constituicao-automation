const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3001;

const HEADLESS = process.env.HEADLESS !== 'false';

// CORS totalmente aberto para simplificar testes locais (file://)
app.use(
  cors({
    origin: true, // reflete qualquer Origin, inclusive null (file://)
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.options('*', cors());

app.use(express.json({ limit: '1mb' }));

// ---------- Jobs em memória ----------
const jobs = new Map();

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
    status: 'pending',
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

// ---------- Helpers ----------
function normalizarCookies(cookies) {
  if (!cookies) return [];

  if (Array.isArray(cookies)) {
    return cookies
      .filter((c) => c && c.name && c.value)
      .map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain || '.empresafacil.ro.gov.br',
        path: c.path || '/',
        httpOnly: c.httpOnly ?? false,
        secure: c.secure ?? true,
        sameSite: c.sameSite || 'Lax',
      }));
  }

  if (typeof cookies === 'string') {
    return cookies
      .split(';')
      .map((par) => par.trim())
      .filter(Boolean)
      .map((par) => {
        const [name, ...rest] = par.split('=');
        return {
          name: name.trim(),
          value: rest.join('=').trim(),
          domain: 'www.empresafacil.ro.gov.br',
          path: '/',
          httpOnly: false,
          secure: true,
          sameSite: 'Lax',
        };
      });
  }

  return [];
}

// ---------- Rotas ----------
app.get('/', (req, res) => {
  res.json({
    status: 'Sistema REAL — sessão do usuário',
    timestamp: new Date().toISOString(),
    versao: 'sistema-sessao-usuario-v2',
    endpoints: [
      'POST /run-automation         (body: { cookies, dados })',
      'GET  /job-status/:jobId',
    ],
  });
});

async function executarAutomacao(job, payload) {
  const { cookies, dados } = payload;
  let browser = null;

  try {
    job.status = 'running';
    logJob(job, '🚀 Iniciando automação com sessão do usuário');

    const cookiesNormalizados = normalizarCookies(cookies);
    if (cookiesNormalizados.length === 0) {
      throw new Error('Nenhum cookie de sessão fornecido');
    }
    logJob(job, `🍪 ${cookiesNormalizados.length} cookies recebidos: ${cookiesNormalizados.map((c) => c.name).join(', ')}`);

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

    await context.addCookies(cookiesNormalizados);
    logJob(job, '✅ Cookies injetados');

    const page = await context.newPage();

    logJob(job, '🌐 Acessando empresafacil com sessão...');
    await page.goto('https://www.empresafacil.ro.gov.br/', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    logJob(job, `📍 URL resultante: ${page.url()}`);

    // Verifica sessão
    const urlAtual = page.url();
    if (urlAtual.includes('/s/login') || urlAtual.includes('sso.acesso.gov.br')) {
      job.status = 'error';
      job.error = {
        tipo: 'sessao_invalida',
        message:
          'Cookies inválidos, expirados OU Gov.br amarrou a sessão ao IP de origem. ' +
          'O servidor do Render tem IP diferente do seu e o Gov.br pode estar recusando.',
        url_atual: urlAtual,
      };
      logJob(job, '❌ Sessão recusada — redirecionado para login');
      return;
    }

    logJob(job, '✅ Sessão aceita! Procurando formulário de constituição...');

    // Pega o título da página pra debug
    try {
      const title = await page.title();
      logJob(job, `📄 Título: ${title}`);
    } catch {}

    // Por enquanto, só confirma que logou e retorna sucesso
    // TODO: implementar navegação até o formulário de constituição
    const protocolo = `TEST${Date.now().toString().slice(-8)}`;
    logJob(job, `🎉 Teste de sessão concluído! Protocolo fake: ${protocolo}`);

    job.status = 'success';
    job.result = {
      protocolo,
      url_final: page.url(),
      metodo: 'TESTE_SESSAO',
      observacao: 'Apenas teste de injeção de sessão. Implementar navegação ao formulário.',
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

function iniciarJob(req, res) {
  const job = criarJob();
  logJob(job, `📥 Job criado em ${req.method} ${req.path}`);

  if (!req.body?.cookies) {
    job.status = 'error';
    job.error = { tipo: 'sem_cookies', message: 'Body precisa ter "cookies"' };
    job.finishedAt = Date.now();
    return res.status(400).json({
      ok: false,
      jobId: job.id,
      message: 'Body precisa ter "cookies"',
    });
  }

  executarAutomacao(job, req.body).catch((err) => {
    console.error('❌ Erro fatal:', err);
    job.status = 'error';
    job.error = { tipo: 'erro_fatal', message: err.message };
    job.finishedAt = Date.now();
  });

  res.status(202).json({
    ok: true,
    jobId: job.id,
    status: job.status,
    message: 'Job iniciado',
  });
}

app.post('/run-real-automation', iniciarJob);
app.post('/run-automation', iniciarJob);

app.get('/job-status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, message: 'Job não encontrado' });

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

app.post('/check-login', (req, res) => {
  res.json({
    ok: true,
    loggedIn: null,
    message: 'Sistema usa cookies agora. Envie POST /run-automation { cookies }.',
  });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, message: `Rota ${req.method} ${req.path} não encontrada` });
});

app.use((err, req, res, _next) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({ ok: false, message: 'Erro interno' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Sistema com sessão rodando na porta ${port}`);
  console.log(`✅ Headless: ${HEADLESS}`);
  console.log(`🎯 POST /run-automation { cookies, dados }`);
});
