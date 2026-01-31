import fs from 'node:fs';
import path from 'node:path';

const DATA_PATH = path.join(process.cwd(), 'data.json');
const BACKUP_DIR = path.join(process.cwd(), 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

if (!fs.existsSync(DATA_PATH)) {
  console.error('data.json não encontrado');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(BACKUP_DIR, `data.${timestamp}.json`);

try {
  fs.copyFileSync(DATA_PATH, backupPath);
  console.log(`Backup criado: ${backupPath}`);
} catch (error) {
  console.error('Erro ao criar backup:', error);
  process.exit(1);
}





