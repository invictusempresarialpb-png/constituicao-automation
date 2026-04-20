const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Servidor ativo', 
    timestamp: new Date().toISOString(),
    ip: req.ip,
    location: 'Brasil - Render'
  });
});

// Versão simplificada SEM Playwright (por enquanto)
app.post('/run', async (req, res) => {
  console.log('🚀 Requisição recebida do Supabase');
  
  try {
    const { jobId, credenciais } = req.body;
    
    if (!credenciais?.cpf || !credenciais?.senha) {
      return res.status(400).json({ 
        ok: false, 
        message: 'Credenciais obrigatórias' 
      });
    }

    console.log(`Job ${jobId} - simulando automação...`);

    // Simula processo (sem browser ainda)
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('✅ Teste conexão realizado com sucesso');

    res.json({ 
      ok: true, 
      message: 'Servidor Render brasileiro conectado! (teste sem browser)',
      ip_servidor: 'IP brasileiro via Render',
      jobId: jobId
    });

  } catch (error) {
    console.error('Erro:', error);
    res.status(500).json({ 
      ok: false, 
      message: error.message 
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor ativo na porta ${port}`);
  console.log(`🇧🇷 Rodando com IP brasileiro via Render`);
});
