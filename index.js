const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ 
    status: 'Servidor ativo - SEM Playwright', 
    timestamp: new Date().toISOString(),
    location: 'Brasil - Render'
  });
});

app.post('/run', async (req, res) => {
  console.log('🚀 Simulando automação (SEM browser)');
  
  const { jobId, credenciais, webhookUrl } = req.body;
  
  if (!credenciais?.cpf || !credenciais?.senha) {
    return res.status(400).json({ 
      ok: false, 
      message: 'Credenciais obrigatórias' 
    });
  }

  // Simula processo
  await new Promise(resolve => setTimeout(resolve, 5000));

  res.json({ 
    ok: true, 
    message: 'Servidor brasileiro funcionando! (sem automação real)',
    ip: 'IP brasileiro',
    teste: true
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor simples ativo na porta ${port}`);
});
