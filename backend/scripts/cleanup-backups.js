import fs from "node:fs";
import path from "node:path";

const BACKUP_DIR = path.join(process.cwd(), "backups");
const KEEP_BACKUPS = 3;

if (!fs.existsSync(BACKUP_DIR)) {
  console.log("Diretório de backups não existe");
  process.exit(0);
}

const files = fs
  .readdirSync(BACKUP_DIR)
  .filter((f) => f.startsWith("data.") && f.endsWith(".json"))
  .map((f) => ({
    name: f,
    path: path.join(BACKUP_DIR, f),
    time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
  }))
  .sort((a, b) => b.time - a.time); // Mais recente primeiro

if (files.length <= KEEP_BACKUPS) {
  console.log(`Apenas ${files.length} backups, mantendo todos`);
  process.exit(0);
}

const toDelete = files.slice(KEEP_BACKUPS);
console.log(`Removendo ${toDelete.length} backups antigos...`);

toDelete.forEach((file) => {
  try {
    fs.unlinkSync(file.path);
    console.log(`Removido: ${file.name}`);
  } catch (error) {
    console.error(`Erro ao remover ${file.name}:`, error);
  }
});

console.log(`Mantidos ${KEEP_BACKUPS} backups mais recentes`);
