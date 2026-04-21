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
    status: 'Servidor híbrido ativo - Automação + Manual', 
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

// Endpoint POST para continuar automação após intervenção manual
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
    message: 'Automação continuará em breve...',
    jobId: jobId,
    timestamp: new Date().toISOString()
  });
});

// Automação híbrida Gov.br
app.post('/run', async (req, res) => {
  console.log('🚀 Iniciando automação HÍBRIDA Gov.br com IP brasileiro');
  
  let browser = null;
  const { jobId, credenciais, webhookUrl } = req.body;
  
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

    // Função para aguardar intervenção manual
    const aguardarIntervencaoManual = async (mensagem, tempoLimite = 1800000) => { // 30 minutos
      console.log(`⏸️ Aguardando intervenção manual: ${mensagem}`);
      
      const sessao = {
