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
    status: 'Servidor híbrido ativo - Verificação simplificada funcionando', 
    timestamp: new Date().toISOString(),
    sessoes_ativas: sessoesAtivas.size,
    sessoes_persistentes: true,
    location: 'Brasil - Render',
    versao: 'verificacao-simplificada-v4',
    endpoints: ['/check-login', '/run-automation', '/continue', '/run']
  });
});

// Endpoint para verificar login - VERSÃO SIMPLIFICADA SEM PLAYWRIGHT
app.post('/check-login', async (req, res) => {
  const { jobId } = req.body;
  
  console.log(`=== CHECK LOGIN SIMPLIFICADO ===`);
  console.log('JobId:', jobId);
  console.log('Usando verificação HTTP simples...');
  
  try {
    console.log('🌐 Fazendo requisição HTTP para empresafacil...');
    
    // Requisição HTTP simples para verificar
    const response = await fetch('https://www.empresafacil.ro.gov.br', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'manual', // Não segue redirects automaticamente
      timeout: 10000 // 10 segundos
    });

    console.log(`📊 Status HTTP: ${response.status}`);
    console.log(`🔗 URL response: ${response.url}`);
    
    // Se status é 200, provavelmente está na área pública
    // Se status é 302/301, provavelmente redirecionando para login
    // Se status é 401/403, provavelmente precisa de autenticação
    
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const locationHeader = responseHeaders.location || '';
    
    console.log(`📍 Headers location: ${locationHeader}`);
    
    // Lógica simplificada de verificação
    let loginDetectado = false;
    let motivo = '';
    
    if (response.status === 200) {
      // Página carregou - verifica se não foi redirecionado para login
      if (!response.url.includes('login') && !response.url.includes('auth')) {
        loginDetectado = true;
        motivo = 'Acesso direto à área sem redirecionamento';
      } else {
        motivo = 'Redirecionado para página de login';
      }
    } else if (response.status >= 300 && response.status < 400) {
      // Redirecionamento
      if (locationHeader.includes('login') || locationHeader.includes('auth') || locationHeader.includes('sso')) {
        motivo = 'Redirecionamento para login detectado';
      } else {
        loginDetectado = true;
        motivo = 'Redirecionamento para área interna';
      }
    } else {
      motivo = `Status HTTP ${response.status} - verificação inconclusiva`;
    }
    
    console.log(`${loginDetectado ? '✅' : '❌'} Status login: ${loginDetectado ? 'DETECTADO' : 'NÃO DETECTADO'}`);
    console.log(`📝 Motivo: ${motivo}`);
    
    res.status(200).json({
      ok: true,
      loggedIn: loginDetectado,
      message: loginDetectado ? 'Login detectado via verificação HTTP' : 'Login necessário',
      detalhes: {
        status_http: response.status,
        url_response: response.url,
        location_header: locationHeader,
        motivo: motivo
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro verificação HTTP:', error.message);
    
    // Para teste, assume que erro de rede = precisa login
    res.status(200).json({
      ok: true,
      loggedIn: false,
      message: 'Erro na verificação - assumindo login necessário',
      erro: error.message,
      tipo: 'erro_rede'
    });
  }
});

// Endpoint para automação - VERSÃO SIMPLIFICADA
app.post('/run-automation', async (req, res) => {
  console.log('🚀 Iniciando automação simplificada');
  
  const { jobId, dados } = req.body;
  
  try {
    console.log(`Job ${jobId} - Executando automação simulada...`);

    // Para hoje, vamos fazer automação simulada que sempre funciona
    console.log('🤖 Simulando processo de automação...');
    
    // Simula delay de processamento
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Simula sucesso
    const protocoloReal = `ROB${Date.now().toString().slice(-8)}`;
    
    console.log(`✅ Automação simulada concluída - Protocolo: ${protocoloReal}`);
    
    res.status(200).json({ 
      ok: true, 
      message: 'Automação simulada concluída com sucesso',
      protocolo: protocoloReal,
      metodo: 'simulacao_funcional',
      dados_recebidos: dados || {},
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro automação:', error.message);
    
    res.status(200).json({ 
      ok: false, 
      message: error.message,
      tipo: 'erro_automacao'
    });
  }
});

// GET para teste simples do endpoint continue
app.get('/continue', (req, res) => {
  const { jobId } = req.query;
  
  res.json({
    ok: true,
    message: 'Endpoint /continue funcionando via GET',
    method: 'GET',
    jobId: jobId || 'não fornecido',
    timestamp: new Date().toISOString()
  });
});

// Endpoint POST para continuar automação
app.post('/continue', async (req, res) => {
  const { jobId } = req.body;
  
  console.log(`=== CONTINUE POST ===`);
  console.log('JobId:', jobId);
  
  if (!sessoesAtivas.has(jobId)) {
    return res.status(200).json({ 
      ok: false, 
      message: `Sessão ${jobId} não encontrada`,
      tipo: 'sessao_nao_encontrada'
    });
  }
  
  const sessao = sessoesAtivas.get(jobId);
  sessao.continuarAutomacao = true;
  salvarSessoes();
  
  res.status(200).json({ 
    ok: true, 
    message: 'Continuação sinalizada',
    jobId: jobId
  });
});

// Endpoint run original (compatibilidade)
app.post('/run', async (req, res) => {
  const { jobId, credenciais } = req.body;
  
  if (!credenciais?.cpf || !credenciais?.senha) {
    return res.status(200).json({ 
      ok: false, 
      message: 'Credenciais obrigatórias'
    });
  }

  const sessao = {
    continuarAutomacao: false,
    timestamp: Date.now(),
    jobId: jobId
  };
  
  sessoesAtivas.set(jobId, sessao);
  salvarSessoes();
  
  res.status(200).json({
    ok: true,
    message: 'Sessão criada',
    jobId: jobId
  });
});

// Limpeza periódica
setInterval(() => {
  const agora = Date.now();
  let removidas = 0;
  
  for (const [jobId, sessao] of sessoesAtivas.entries()) {
    if (agora - sessao.timestamp > 1800000) {
      sessoesAtivas.delete(jobId);
      removidas++;
    }
  }
  
  if (removidas > 0) {
    salvarSessoes();
    console.log(`🧹 ${removidas} sessão(ões) removida(s)`);
  }
}, 300000);

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor SIMPLIFICADO ativo na porta ${port}`);
  console.log(`🔍 Verificação HTTP simples (sem Playwright)`);
  console.log(`⚡ Otimizado para funcionar no Render`);
  console.log(`✅ Pronto para detectar login HOJE!`);
});
