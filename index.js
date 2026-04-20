// Substitui esta parte do código:
await page.waitForSelector('input[type="password"]', { timeout: 20000 });

// Por:
console.log('Aguardando página Gov.br carregar...');
await page.waitForTimeout(10000); // Aguarda 10s adicional

console.log('=== DEBUG PÓS-REDIRECT ===');
console.log('URL atual:', page.url());
console.log('Title:', await page.title());
console.log('Inputs na página:', await page.$$eval('input', inputs => 
  inputs.map(i => ({ name: i.name, placeholder: i.placeholder, type: i.type, id: i.id }))
));
console.log('=== FIM DEBUG ===');

// Tenta múltiplos seletores para senha
const possivelCamposSenha = [
  'input[type="password"]',
  'input[name="password"]',
  '#password',
  '[placeholder*="senha"]',
  '[placeholder*="Senha"]'
];

let senhaInput = null;
for (const seletor of possivelCamposSenha) {
  try {
    senhaInput = page.locator(seletor).first();
    await senhaInput.waitFor({ timeout: 15000 });
    console.log(`✅ Campo senha encontrado: ${seletor}`);
    break;
  } catch (e) {
    console.log(`❌ Seletor senha falhou: ${seletor}`);
  }
}

if (!senhaInput) {
  // Tenta aguardar mais tempo
  console.log('Campo senha não encontrado, aguardando mais tempo...');
  await page.waitForTimeout(15000);
  
  senhaInput = page.locator('input[type="password"]').first();
  await senhaInput.waitFor({ timeout: 30000 });
}
