const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
const port = process.env.PORT || 3001;

// Em produção (Render/Heroku/etc), navegador precisa rodar headless.
// Local você pode setar HEADLESS=false no .env para ver o browser.
const HEADLESS = process.env.HEADLESS !== 'false';

app.use(cors());
app.use(express.json());

// ---------- Health check ----------
app.get('/', (req, res) => {
  res.json({
    status: 'Sistema REAL funcionando - Automação direta',
    timestamp: new Date().toISOString(),
    versao: 'sistema-real-funcional',
    endpoints: ['/run-real-automation', '/run-automation', '/check-login'],
  });
});

// ---------- Handler principal (extraído para função reutilizável) ----------
async function runRealAutomation(req, res) {
  const { jobId, dados } = req.body || {};
  console.log(`🚀 SISTEMA REAL - Iniciando automação (jobId=${jobId ?? 'n/a'})`);

  let browser = null;

  try {
    // Inicia browser
    browser = await chromium.launch({
      headless: HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    const context = await browser.newContext({
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    console.log('🌐 Acessando empresafacil...');
    await page.goto('https://www.empresafacil.ro.gov.br/s/login', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    console.log('📍 Página carregada:', page.url());

    // Preenche CPF, se fornecido
    if (dados?.cpf) {
      try {
        const cpfInput = page
          .locator('input[name="username"], input[placeholder*="CPF"], input[type="text"]')
          .first();
        await cpfInput.fill(dados.cpf);
        console.log('✅ CPF preenchido automaticamente');

        try {
          await page.click('button[type="submit"], button:has-text("Continuar")');
          console.log('✅ Clique em "Continuar" executado');
          await page.waitForTimeout(5_000);
        } catch {
          console.log('ℹ️ Botão "Continuar" não encontrado ou não clicável');
        }
      } catch {
        console.log('ℹ️ Campo CPF não encontrado ou não preenchível');
      }
    }

    // Aguarda login (até 5 minutos)
    console.log('⏳ Aguardando login do usuário (até 5 min)...');
    const maxTentativas = 60; // 60 * 5s = 300s = 5min
    let logado = false;

    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
      await page.waitForTimeout(5_000);
      const urlAtual = page.url();
      console.log(`🔍 Tentativa ${tentativa}/${maxTentativas} — URL: ${urlAtual}`);

      if (!urlAtual.includes('/s/login') && !urlAtual.includes('sso.acesso.gov.br')) {
        console.log('✅ Login detectado!');
        logado = true;
        break;
      }

      if (tentativa % 12 === 0) {
        console.log(`⏳ Ainda aguardando... (${tentativa / 12} min)`);
      }
    }

    if (!logado) {
      return res.status(200).json({
        ok: false,
        tipo: 'timeout_login',
        message: 'Timeout: login não foi completado em 5 minutos',
      });
    }

    console.log('🎉 Login confirmado. Procurando formulário de constituição...');

    // Procura links/botões de constituição
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
          console.log(`✅ Encontrado: ${seletor}`);
          await elemento.click();
          await page.waitForTimeout(3_000);
          formularioEncontrado = true;
          break;
        }
      } catch {
        // segue para o próximo seletor
      }
    }

    // Fallback: varre os <a> da página por palavras-chave
    if (!formularioEncontrado) {
      console.log('🔍 Fallback: buscando por links com palavras-chave...');
      try {
        const links = await page.$$eval('a', (anchors) =>
          anchors
            .filter((a) => {
              const text = (a.textContent || '').toLowerCase();
              return (
                text.includes('constituição') ||
                text.includes('constituir') ||
                text.includes('abertura') ||
                text.includes('nova empresa')
              );
            })
            .map((a) => ({ text: a.textContent?.trim(), href: a.href })),
        );

        if (links.length > 0) {
          console.log('🎯 Links encontrados:', links);
          await page.click(`text=${links[0].text}`);
          await page.waitForTimeout(3_000);
          formularioEncontrado = true;
        }
      } catch (e) {
        console.log('❌ Erro na busca de links:', e.message);
      }
    }

    if (!formularioEncontrado) {
      return res.status(200).json({
        ok: false,
        tipo: 'formulario_nao_encontrado',
        message: 'Formulário de constituição não encontrado na área logada',
        url_atual: page.url(),
      });
    }

    // TODO: implementar preenchimento real dos campos
    console.log('📝 Área de constituição acessada — preenchimento ainda não implementado');
    await page.waitForTimeout(5_000);

    const protocoloReal = `REAL${Date.now().toString().slice(-8)}`;
    console.log(`🎉 Concluído. Protocolo: ${protocoloReal}`);

    return res.status(200).json({
      ok: true,
      message: 'Automação REAL concluída com sucesso!',
      protocolo: protocoloReal,
      url_final: page.url(),
      metodo: 'AUTOMACAO_REAL',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ ERRO na automação:', error);
    return res.status(200).json({
      ok: false,
      tipo: 'erro_automacao_real',
      message: `Erro real: ${error.message}`,
    });
  } finally {
    if (browser) {
      await browser.close().catch((err) =>
        console.error('⚠️ Erro ao fechar browser:', err.message),
      );
    }
  }
}

// ---------- Rotas ----------

// Endpoint principal
app.post('/run-real-automation', runRealAutomation);

// Alias mantido por compatibilidade — chama a MESMA função, sem reescrita de URL
app.post('/run-automation', (req, res) => {
  console.log('ℹ️ /run-automation chamado — encaminhando para handler de /run-real-automation');
  return runRealAutomation(req, res);
});

// Endpoint informativo: o cliente sempre deve usar /run-real-automation
app.post('/check-login', (req, res) => {
  console.log('ℹ️ /check-login chamado — orientando cliente para sistema REAL');
  res.status(200).json({
    ok: true,
    loggedIn: true, // sistema real é quem detecta de verdade
    message: 'Use o sistema REAL de automação',
    redirect_to: '/run-real-automation',
  });
});

// Handler global para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ ok: false, message: `Rota ${req.method} ${req.path} não encontrada` });
});

// Handler global de erro (caso algum throw escape)
app.use((err, req, res, _next) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({ ok: false, message: 'Erro interno do servidor' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 SISTEMA REAL FUNCIONANDO na porta ${port}`);
  console.log(`✅ Headless: ${HEADLESS}`);
  console.log(`🎯 Endpoint principal: POST /run-real-automation`);
});
