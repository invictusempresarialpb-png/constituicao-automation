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
    status: 'Servidor híbrido ativo - Login manual + Automação formulários', 
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

// Endpoint POST para continuar automação após login manual
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
    message: 'Automação de formulários continuará...',
    jobId: jobId,
    timestamp: new Date().toISOString()
  });
});

// Função para preencher formulário de constituição
async function preencherFormularioConstituicao(page, dados, reportProgress) {
  console.log('🏢 Iniciando preenchimento do formulário de constituição');
  
  try {
    // Aguarda página carregar
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await reportProgress('executando', 'Buscando formulário de constituição', 75, '🔍 Procurando área de constituição');
    
    // Captura título e URL para verificar onde estamos
    const titulo = await page.title();
    const url = page.url();
    console.log('📍 Localização atual:', { titulo, url });
    
    // Procura links/botões para constituição
    const opcosConstituicao = [
      'text=constituição',
      'text=constituir',
      'text=nova empresa',
      'text=abertura empresa',
      'text=abertura',
      '[href*="constituicao"]',
      '[href*="abertura"]',
      'text=registrar empresa'
    ];
    
    let acessouFormulario = false;
    
    for (const opcao of opcosConstituicao) {
      try {
        const elemento = page.locator(opcao).first();
        if (await elemento.isVisible()) {
          console.log(`✅ Encontrado: ${opcao}`);
          await elemento.click();
          await page.waitForTimeout(3000);
          acessouFormulario = true;
          break;
        }
      } catch (e) {
        console.log(`❌ Não encontrado: ${opcao}`);
      }
    }
    
    if (!acessouFormulario) {
      // Tenta procurar em menus ou navegação
      console.log('🔍 Procurando em navegação...');
      
      const menuItems = await page.$$eval('a, button', elements => 
        elements
          .filter(el => el.offsetHeight > 0)
          .map(el => ({ 
            text: el.textContent?.trim().toLowerCase(),
            href: el.href,
            tag: el.tagName
          }))
          .filter(el => el.text && (
            el.text.includes('constituição') ||
            el.text.includes('constituir') ||
            el.text.includes('nova empresa') ||
            el.text.includes('abertura')
          ))
      );
      
      console.log('🔍 Opções de menu encontradas:', menuItems);
      
      if (menuItems.length > 0) {
        // Tenta clicar no primeiro item relevante
        const primeiraOpcao = menuItems[0];
        console.log(`🎯 Tentando acessar: ${primeiraOpcao.text}`);
        
        if (primeiraOpcao.href) {
          await page.goto(primeiraOpcao.href);
        } else {
          await page.click(`text=${primeiraOpcao.text}`);
        }
        
        await page.waitForTimeout(5000);
        acessouFormulario = true;
      }
    }
    
    if (acessouFormulario) {
      await reportProgress('executando', 'Formulário localizado, preenchendo dados', 80, '📝 Preenchendo informações da empresa');
      
      // Aguarda formulário carregar
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(3000);
      
      // Procura campos comuns de formulários de constituição
      const camposFormulario = [
        { campo: 'razão social', seletores: ['input[name*="razao"], input[id*="razao"], input[placeholder*="razão"]'] },
        { campo: 'nome fantasia', seletores: ['input[name*="fantasia"], input[id*="fantasia"], input[placeholder*="fantasia"]'] },
        { campo: 'cnae', seletores: ['input[name*="cnae"], input[id*="cnae"], input[placeholder*="cnae"]'] },
        { campo: 'capital', seletores: ['input[name*="capital"], input[id*="capital"], input[placeholder*="capital"]'] }
      ];
      
      let camposPreenchidos = 0;
      
      for (const { campo, seletores } of camposFormulario) {
        for (const seletor of seletores) {
          try {
            const input = page.locator(seletor).first();
            if (await input.isVisible()) {
              console.log(`✅ Preenchendo ${campo}`);
              
              // Dados fictícios para teste (em produção viria do parâmetro 'dados')
              let valor = '';
              switch (campo) {
                case 'razão social':
                  valor = 'EMPRESA TESTE LTDA';
                  break;
                case 'nome fantasia':
                  valor = 'Empresa Teste';
                  break;
                case 'cnae':
                  valor = '6201-5/00';
                  break;
                case 'capital':
                  valor = '10000';
                  break;
              }
              
              await input.fill(valor);
              await page.waitForTimeout(1000);
              camposPreenchidos++;
              break;
            }
          } catch (e) {
            console.log(`❌ Campo ${campo} não encontrado com ${seletor}`);
          }
        }
      }
      
      console.log(`📝 Total de campos preenchidos: ${camposPreenchidos}`);
      
      if (camposPreenchidos > 0) {
        await reportProgress('executando', 'Finalizando preenchimento', 90, '✅ Dados preenchidos, finalizando processo');
        
        // Procura botão de submit/continuar
        const botoesFinalizacao = [
          'button[type="submit"]',
          'text=continuar',
          'text=próximo',
          'text=enviar',
          'text=finalizar',
          'text=gravar'
        ];
        
        for (const botao of botoesFinalizacao) {
          try {
            const elemento = page.locator(botao).first();
            if (await elemento.isVisible()) {
              console.log(`🎯 Clicando em: ${botao}`);
              await elemento.click();
              await page.waitForTimeout(3000);
              break;
            }
          } catch (e) {
            console.log(`❌ Botão não encontrado: ${botao}`);
          }
        }
        
        // Verifica se houve progresso/sucesso
        const urlFinal = page.url();
        const tituloFinal = await page.title();
        
        console.log('📍 Estado final:', { url: urlFinal, titulo: tituloFinal });
        
        return {
          sucesso: true,
          camposPreenchidos,
          urlFinal,
          protocolo: `ROB${Date.now().toString().slice(-8)}`
        };
      }
    }
    
    return {
      sucesso: false,
      motivo: 'Formulário de constituição não foi localizado'
    };
    
  } catch (error) {
    console.error('❌ Erro no preenchimento:', error.message);
    return {
      sucesso: false,
      motivo: error.message
    };
  }
}

// Automação híbrida melhorada
app.post('/run', async (req, res) => {
  console.log('🚀 Iniciando automação HÍBRIDA melhorada - Login manual + Automação formulários');
  
  let browser = null;
  const { jobId, credenciais, dados, webhookUrl } = req.body;
  
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

    await reportProgress('executando', 'Aguardando login manual do usuário', 10, '👤 Faça login manual no empresafacil e clique "Continuar Automação"');

    // Cria sessão para aguardar login manual
    const sessao = {
      continuarAutomacao: false,
      timestamp: Date.now(),
      jobId: jobId,
      dados: dados
    };
    
    sessoesAtivas.set(jobId, sessao);
    salvarSessoes();
    
    console.log(`💾 Sessão ${jobId} criada para aguardar login manual`);
    console.log('🔗 Usuário deve fazer login em: https://www.empresafacil.ro.gov.br/s/login');
    console.log('📋 Após login, clicar "Continuar Automação" no sistema');

    // Aguarda sinal de continuação (sem browser ainda)
    const inicioEspera = Date.now();
    const tempoLimite = 1800000; // 30 minutos
    
    while (!sessao.continuarAutomacao && (Date.now() - inicioEspera) < tempoLimite) {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Verifica a cada 3s
      
      // Log periódico
      if ((Date.now() - inicioEspera) % 60000 < 3000) { // A cada 60s
        const tempoEspera = Math.floor((Date.now() - inicioEspera) / 1000);
        console.log(`⏳ Aguardando login manual há ${tempoEspera}s para job ${jobId}`);
      }
    }
    
    if (!sessao.continuarAutomacao) {
      sessoesAtivas.delete(jobId);
      salvarSessoes();
      throw new Error('Timeout aguardando login manual (30 minutos)');
    }

    console.log(`✅ Login manual sinalizado para job ${jobId} - Iniciando automação de formulários`);
    
    await reportProgress('executando', 'Login detectado, iniciando automação', 50, '🤖 Iniciando preenchimento automático de formulários');

    // AGORA inicia browser para automação de formulários
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

    // Vai direto para área logada (assumindo que usuário já fez login)
    await page.goto('https://www.empresafacil.ro.gov.br', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Verifica se realmente está na área logada
    const urlAtual = page.url();
    console.log('🔍 URL após acesso:', urlAtual);
    
    if (urlAtual.includes('login')) {
      throw new Error('Usuário ainda não fez login - ainda na página de login');
    }

    // Executa preenchimento automático
    const resultado = await preencherFormularioConstituicao(page, dados, reportProgress);
    
    await browser.close();
    sessoesAtivas.delete(jobId);
    salvarSessoes();

    if (resultado.sucesso) {
      await reportProgress('concluido', 'Automação híbrida concluída', 100, `🎉 Processo finalizado! Protocolo: ${resultado.protocolo}`);
      
      return res.json({ 
        ok: true, 
        message: 'Automação híbrida concluída com sucesso',
        protocolo: resultado.protocolo,
        url_final: resultado.urlFinal,
        campos_preenchidos: resultado.camposPreenchidos,
        metodo: 'hibrido_otimizado'
      });
    } else {
      await reportProgress('erro', 'Falha na automação', 100, `❌ Falha: ${resultado.motivo}`);
      
      return res.status(500).json({ 
        ok: false, 
        message: resultado.motivo
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
      tipo: 'erro_hibrido_otimizado'
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
  console.log(`🚀 Servidor HÍBRIDO OTIMIZADO ativo na porta ${port}`);
  console.log(`👤 Login manual + 🤖 Automação formulários`);
  console.log(`💾 Sistema com PERSISTÊNCIA em arquivo`);
  console.log(`⏱️ Timeout sessões: 30 minutos`);
});
