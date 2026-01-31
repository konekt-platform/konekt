import fs from 'node:fs';
import path from 'node:path';

const DATA_PATH = path.join(process.cwd(), 'data.json');
const INACTIVITY_MS = 24 * 60 * 60 * 1000; // 1 dia

if (!fs.existsSync(DATA_PATH)) {
  console.error('data.json não encontrado');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

if (!data.tokens || !Array.isArray(data.tokens)) {
  console.log('Nenhum token encontrado');
  process.exit(0);
}

const now = new Date();
let removedCount = 0;

const cleanedTokens = data.tokens.filter((token) => {
  const lastActivity = token.lastActivity ? new Date(token.lastActivity) : new Date(token.createdAt);
  const inactiveTime = now - lastActivity;
  
  if (inactiveTime > INACTIVITY_MS) {
    removedCount++;
    return false; // Remove token expirado
  }
  
  return true; // Mantém token ativo
});

data.tokens = cleanedTokens;

fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

console.log(`Limpeza de tokens concluída: ${removedCount} tokens expirados removidos, ${cleanedTokens.length} tokens mantidos`);





