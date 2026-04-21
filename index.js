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
                  valor = '10000'
