import fs from "node:fs";
import path from "node:path";

const DATA_PATH = path.join(process.cwd(), "data.json");
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

if (!fs.existsSync(DATA_PATH)) {
  console.error("data.json não encontrado");
  process.exit(1);
}

if (!fs.existsSync(UPLOAD_DIR)) {
  console.log("Diretório de uploads não existe");
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

// Coletar todas as URLs de mídia referenciadas
const referencedUrls = new Set();

// Mídia geral
if (Array.isArray(data.media)) {
  data.media.forEach((item) => {
    if (item.url) {
      const filename = item.url.replace("/uploads/", "");
      referencedUrls.add(filename);
    }
  });
}

// Mídia de eventos
if (data.eventMedia && typeof data.eventMedia === "object") {
  Object.values(data.eventMedia).forEach((mediaArray) => {
    if (Array.isArray(mediaArray)) {
      mediaArray.forEach((item) => {
        if (item.photoUrl) {
          const url = item.photoUrl.replace(/^.*\/uploads\//, "");
          referencedUrls.add(url);
        }
      });
    }
  });
}

// Avatares de usuários
if (Array.isArray(data.users)) {
  data.users.forEach((user) => {
    if (user.avatar && user.avatar.includes("/uploads/")) {
      const filename = user.avatar.replace(/^.*\/uploads\//, "");
      referencedUrls.add(filename);
    }
  });
}

// Imagens de eventos
if (Array.isArray(data.events)) {
  data.events.forEach((event) => {
    if (event.image && event.image.includes("/uploads/")) {
      const filename = event.image.replace(/^.*\/uploads\//, "");
      referencedUrls.add(filename);
    }
  });
}

// Listar arquivos no diretório de uploads
const files = fs.readdirSync(UPLOAD_DIR);
let removedCount = 0;

files.forEach((filename) => {
  if (!referencedUrls.has(filename)) {
    // Arquivo não referenciado - remover
    try {
      const filepath = path.join(UPLOAD_DIR, filename);
      fs.unlinkSync(filepath);
      removedCount++;
      console.log(`Removido: ${filename}`);
    } catch (error) {
      console.error(`Erro ao remover ${filename}:`, error);
    }
  }
});

console.log(
  `Limpeza de uploads concluída: ${removedCount} arquivos órfãos removidos, ${files.length - removedCount} arquivos mantidos`,
);
