import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { hashPassword, comparePassword, isHashed } from "./utils/password.js";

const DATA_PATH = path.join(process.cwd(), "data.json");
const DEFAULTS_PATH = path.join(process.cwd(), "data.defaults.json");
const UPLOAD_DIR = path.join(process.cwd(), "uploads");

if (!fs.existsSync(DATA_PATH)) {
  fs.writeFileSync(DATA_PATH, fs.readFileSync(DEFAULTS_PATH, "utf-8"));
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

function generateId() {
  // Usar crypto.randomUUID se disponível (Node 14.17+)
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback para Date.now() se UUID não disponível
  return Date.now().toString();
}

/**
 * Normaliza ID para comparação (aceita number ou string)
 */
function normalizeId(id) {
  if (typeof id === "number") return id;
  if (typeof id === "string") {
    const num = Number(id);
    return Number.isFinite(num) ? num : id;
  }
  return id;
}

/**
 * Compara dois IDs (suporta number e string)
 */
function compareIds(id1, id2) {
  return String(id1) === String(id2);
}

function ensureDataCollections(data) {
  data.tokens = data.tokens || [];
  data.users = data.users || [];
  data.events = data.events || [];
  data.posts = data.posts || [];
  data.notifications = data.notifications || [];
  data.media = data.media || [];
  data.eventChats = data.eventChats || {};
  data.eventMedia = data.eventMedia || {};
  data.userFavorites = data.userFavorites || {};
}

function updateTokenActivity(token, data) {
  const session = data.tokens.find((t) => t.token === token);
  if (session) {
    session.lastActivity = new Date().toISOString();
    writeData(data);
  }
}

function getAuthUser(request, data) {
  const header = request.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  if (!token) return null;

  const session = data.tokens.find((t) => t.token === token);
  if (!session) return null;

  // Verificar inatividade (1 dia = 24 horas = 86400000 ms)
  const INACTIVITY_MS = 24 * 60 * 60 * 1000;
  const lastActivity = session.lastActivity
    ? new Date(session.lastActivity)
    : new Date(session.createdAt);
  const now = new Date();

  if (now - lastActivity > INACTIVITY_MS) {
    // Token expirado por inatividade - remover
    data.tokens = data.tokens.filter((t) => t.token !== token);
    writeData(data);
    return null;
  }

  // Atualizar lastActivity
  updateTokenActivity(token, data);

  return data.users.find((u) => compareIds(u.id, session.userId)) || null;
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidBirthDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function sanitizeUser(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

// Constrói attendeesList a partir de attendeeIds
function buildAttendeesList(event, data) {
  const attendeeIds = Array.isArray(event.attendeeIds) ? event.attendeeIds : [];
  const attendeesList = attendeeIds
    .map((userId) => {
      const user = data.users.find((u) => compareIds(u.id, userId));
      if (!user) return null;
      return {
        id: user.id,
        name: user.name || user.username,
        avatar: user.avatar || "",
      };
    })
    .filter(Boolean); // Remove nulls

  return attendeesList;
}

// Sanitiza evento e garante que attendeesList está atualizado
// Inclui usuários do chat na contagem de participantes
function sanitizeEvent(event, data) {
  const attendeeIds = Array.isArray(event.attendeeIds) ? event.attendeeIds : [];
  const attendeesList = buildAttendeesList(event, data);

  // Coleta IDs únicos de usuários que participaram do chat
  const chatUserIds = new Set();
  const eventChat = data.eventChats?.[event.id] || [];
  eventChat.forEach((msg) => {
    if (msg.authorId) {
      chatUserIds.add(msg.authorId);
    } else if (msg.author) {
      // Se não tem authorId, tenta encontrar pelo nome
      const user = data.users.find(
        (u) => u.name === msg.author || u.username === msg.author,
      );
      if (user) {
        chatUserIds.add(user.id);
      }
    }
  });

  // Combina attendeeIds com usuários do chat (sem duplicatas)
  const allParticipantIds = new Set([...attendeeIds, ...chatUserIds]);
  const finalAttendeeIds = Array.from(allParticipantIds);

  // Recalcula attendeesList incluindo usuários do chat
  const finalAttendeesList = finalAttendeeIds
    .map((userId) => {
      const user = data.users.find((u) => compareIds(u.id, userId));
      if (!user) return null;
      return {
        id: user.id,
        name: user.name || user.username,
        avatar: user.avatar || "",
      };
    })
    .filter(Boolean);

  const attendees = finalAttendeeIds.length;

  return {
    ...event,
    attendeeIds: finalAttendeeIds,
    attendeesList: finalAttendeesList,
    attendees,
  };
}

const app = fastify({
  logger: true,
  https:
    process.env.HTTPS === "true"
      ? {
          key: fs.readFileSync(process.env.HTTPS_KEY || "./certs/key.pem"),
          cert: fs.readFileSync(process.env.HTTPS_CERT || "./certs/cert.pem"),
        }
      : undefined,
});

await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});

await app.register(multipart);
await app.register(fastifyStatic, {
  root: UPLOAD_DIR,
  prefix: "/uploads/",
});

app.get("/health", async () => ({ ok: true }));

// Busca avançada
app.get("/search", async (request) => {
  const data = readData();
  ensureDataCollections(data);
  const requestingUser = getAuthUser(request, data);

  const query = (request.query?.q || "").toString().trim().toLowerCase();
  const type = (request.query?.type || "all").toString(); // 'events', 'users', 'all'
  const filters = request.query?.filters
    ? JSON.parse(request.query.filters)
    : {};

  if (!query) {
    return { events: [], users: [] };
  }

  const results = {
    events: [],
    users: [],
  };

  // Buscar eventos
  if (type === "all" || type === "events") {
    let events = data.events.filter((event) => {
      const nameMatch = event.name?.toLowerCase().includes(query);
      const descMatch = event.description?.toLowerCase().includes(query);
      const locationMatch = event.location?.toLowerCase().includes(query);
      return nameMatch || descMatch || locationMatch;
    });

    // Aplicar filtros de eventos
    if (filters.eventType) {
      events = events.filter((e) => e.type === filters.eventType);
    }
    if (filters.dateFrom) {
      events = events.filter(
        (e) => new Date(e.date) >= new Date(filters.dateFrom),
      );
    }
    if (filters.dateTo) {
      events = events.filter(
        (e) => new Date(e.date) <= new Date(filters.dateTo),
      );
    }

    // Filtrar eventos de usuários bloqueados
    if (requestingUser && requestingUser.blockedUserIds) {
      events = events.filter((e) => {
        if (!e.creatorId) return true;
        return !requestingUser.blockedUserIds.some((blockedId) =>
          compareIds(blockedId, e.creatorId),
        );
      });
    }

    results.events = events.map((e) => sanitizeEvent(e, data));
  }

  // Buscar usuários
  if (type === "all" || type === "users") {
    let users = data.users.filter((user) => {
      const nameMatch = user.name?.toLowerCase().includes(query);
      const usernameMatch = user.username?.toLowerCase().includes(query);
      const bioMatch = user.bio?.toLowerCase().includes(query);
      return nameMatch || usernameMatch || bioMatch;
    });

    // Filtrar usuários bloqueados
    if (requestingUser && requestingUser.blockedUserIds) {
      users = users.filter(
        (u) =>
          !requestingUser.blockedUserIds.some((blockedId) =>
            compareIds(blockedId, u.id),
          ),
      );
    }

    results.users = users.map(sanitizeUser);
  }

  // Salvar histórico de busca se usuário autenticado
  if (requestingUser) {
    requestingUser.searchHistory = requestingUser.searchHistory || [];
    const searchEntry = {
      query,
      type,
      timestamp: new Date().toISOString(),
    };
    requestingUser.searchHistory.unshift(searchEntry);
    // Manter apenas últimas 10 buscas
    requestingUser.searchHistory = requestingUser.searchHistory.slice(0, 10);
    writeData(data);
  }

  return results;
});

app.get("/users/me/search-history", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  return user.searchHistory || [];
});

const rateLimits = new Map();

function rateLimitMiddleware(request, reply, next) {
  const key = request.userId ? `user:${request.userId}` : `ip:${request.ip}`;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const limit = 300; // 300 requests per minute

  const record = rateLimits.get(key) || { count: 0, startTime: now };

  if (now - record.startTime > windowMs) {
    record.count = 0;
    record.startTime = now;
  }

  record.count++;
  rateLimits.set(key, record);

  if (record.count > limit) {
    reply.code(429).send({ error: "Too Many Requests" });
    return;
  }

  next();
}

// Aplicar rate limiting em todas as rotas (exceto health)
app.addHook("onRequest", async (request, reply) => {
  // Extrair userId do token sem atualizar lastActivity
  const header = request.headers.authorization || "";
  const token = header.replace("Bearer ", "");
  let userId = null;

  if (token) {
    const data = readData();
    const session = data.tokens.find((t) => t.token === token);
    if (session) {
      userId = session.userId;
    }
  }

  request.userId = userId; // Armazenar userId no request

  // Aplicar rate limiting
  return new Promise((resolve) => {
    rateLimitMiddleware(request, reply, resolve);
  });
});

// Auth
app.post("/auth/login", async (request, reply) => {
  const { username, password } = request.body || {};
  const data = readData();
  ensureDataCollections(data);
  const user = data.users.find(
    (u) => u.username === username || u.email === username,
  );

  if (!user) {
    return reply.code(401).send({ error: "Usuário ou senha incorretos" });
  }

  // Verificar senha (suporta texto plano antigo e hash novo)
  let passwordValid = false;
  if (isHashed(user.password)) {
    // Senha já está hasheada
    passwordValid = comparePassword(password, user.password);
  } else {
    // Senha antiga em texto plano - comparar diretamente
    passwordValid = user.password === password;
    // Migrar para hash se senha estiver correta
    if (passwordValid) {
      user.password = hashPassword(password);
      writeData(data);
    }
  }

  if (!passwordValid) {
    return reply.code(401).send({ error: "Usuário ou senha incorretos" });
  }

  // NOVO: Remover tokens antigos do usuário
  data.tokens = data.tokens.filter((t) => !compareIds(t.userId, user.id));

  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  data.tokens.push({
    token,
    userId: user.id,
    createdAt: now,
    lastActivity: now,
  });
  writeData(data);
  const { password: _, ...safeUser } = user;
  return { user: safeUser, token };
});

app.post("/auth/register", async (request, reply) => {
  const { email, password, name, birthDate } = request.body || {};
  if (!email || !password || !name || !birthDate) {
    return reply
      .code(400)
      .send({ error: "email, password, name e birthDate são obrigatórios" });
  }
  if (!isValidEmail(email)) {
    return reply.code(400).send({ error: "Email inválido" });
  }
  if (!isValidBirthDate(birthDate)) {
    return reply.code(400).send({ error: "Data de nascimento inválida" });
  }
  const data = readData();
  ensureDataCollections(data);
  const exists = data.users.find((u) => u.email === email);
  if (exists) return reply.code(409).send({ error: "Usuário já existe" });
  const newUser = {
    id: generateId(), // Era: Date.now()
    username: email,
    email,
    name,
    birthDate,
    avatar: "",
    password: hashPassword(password), // NOVO: Hash na criação
    bio: "",
    followers: 0,
    following: 0,
    followerIds: [],
    followingIds: [],
  };
  data.users.push(newUser);

  // Remover tokens antigos (não deve ter, mas por segurança)
  data.tokens = data.tokens.filter((t) => !compareIds(t.userId, newUser.id));

  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  data.tokens.push({
    token,
    userId: newUser.id,
    createdAt: now,
    lastActivity: now,
  });
  writeData(data);
  const { password: _, ...safeUser } = newUser;
  return reply.code(201).send({ user: safeUser, token });
});

app.post("/auth/google-mock", async (request, reply) => {
  const { email, name, birthDate } = request.body || {};
  if (!email || !name || !birthDate) {
    return reply
      .code(400)
      .send({ error: "email, name e birthDate são obrigatórios" });
  }
  if (!isValidBirthDate(birthDate)) {
    return reply.code(400).send({ error: "Data de nascimento inválida" });
  }
  const data = readData();
  ensureDataCollections(data);
  let user = data.users.find((u) => u.email === email);
  if (!user) {
    user = {
      id: generateId(), // Era: Date.now()
      username: email,
      email,
      name,
      birthDate,
      avatar: "",
      password: "",
      bio: "",
      followers: 0,
      following: 0,
      followerIds: [],
      followingIds: [],
    };
    data.users.push(user);
  }

  // Garantir apenas 1 sessão ativa por usuário - remover TODOS os tokens anteriores
  data.tokens = data.tokens.filter((t) => !compareIds(t.userId, user.id));

  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  data.tokens.push({
    token,
    userId: user.id,
    createdAt: now,
    lastActivity: now,
  });
  writeData(data);
  const { password: _, ...safeUser } = user;
  return reply.code(200).send({ user: safeUser, token });
});

app.post("/auth/logout-all", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  // Remover todos os tokens do usuário
  data.tokens = data.tokens.filter((t) => !compareIds(t.userId, user.id));
  writeData(data);

  return { ok: true, message: "Logout realizado em todos os dispositivos" };
});

app.get("/users/me", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const { password: _, ...safeUser } = user;
  return safeUser;
});

app.put("/users/me", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  const { name, avatar, bio } = request.body || {};

  if (typeof name === "string") {
    user.name = name.trim() || user.name;
  }
  if (typeof avatar === "string") {
    user.avatar = avatar.trim();
  }
  if (typeof bio === "string") {
    user.bio = bio.trim();
  }

  writeData(data);
  return sanitizeUser(user);
});

app.post("/users/me/avatar", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
  if (!fs.existsSync(AVATAR_DIR)) {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

  try {
    const parts = request.parts();
    let avatarFile = null;

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "avatar") {
        avatarFile = part;
        break;
      }
    }

    if (!avatarFile) {
      return reply
        .code(400)
        .send({ error: "Nenhum arquivo de avatar enviado" });
    }

    // Validar tipo MIME
    const mimeType = avatarFile.mimetype || "";
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return reply.code(400).send({
        error: "Formato de imagem não suportado. Use JPG, PNG ou WEBP",
      });
    }

    // Validar extensão
    let ext = path.extname(avatarFile.filename || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return reply
        .code(400)
        .send({ error: "Extensão de arquivo não suportada" });
    }

    // Validar tamanho
    const buffer = await avatarFile.toBuffer();
    if (buffer.length > MAX_SIZE) {
      return reply
        .code(400)
        .send({ error: "Arquivo muito grande. Tamanho máximo: 5MB" });
    }

    // Redimensionar imagem (máximo 512x512px, mantém proporção)
    let finalBuffer = buffer;
    try {
      // Tentar usar sharp se disponível, senão usa imagem original
      const sharpModule = await import("sharp").catch(() => null);
      if (sharpModule) {
        const sharp = sharpModule.default || sharpModule;
        finalBuffer = await sharp(buffer)
          .resize(512, 512, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85 }) // Converter para JPEG com qualidade 85%
          .toBuffer();
        // Atualizar extensão para .jpg após redimensionamento
        ext = ".jpg";
      } else {
        // Se sharp não estiver disponível, apenas valida dimensões básicas
        // e usa imagem original (redimensionamento será feito no frontend se necessário)
        app.log.warn(
          "Sharp não disponível, usando imagem original sem redimensionamento",
        );
      }
    } catch (resizeError) {
      app.log.warn(
        "Erro ao redimensionar imagem, usando original:",
        resizeError,
      );
      // Continua com imagem original se redimensionamento falhar
    }

    // Gerar nome único
    const filename = `avatar-${user.id}-${Date.now()}${ext}`;
    const filepath = path.join(AVATAR_DIR, filename);

    // Salvar arquivo
    await fs.promises.writeFile(filepath, finalBuffer);

    // Atualizar avatar do usuário
    const avatarUrl = `/uploads/avatars/${filename}`;
    user.avatar = avatarUrl;
    writeData(data);

    return reply
      .code(200)
      .send({ avatar: avatarUrl, user: sanitizeUser(user) });
  } catch (error) {
    app.log.error("Erro ao fazer upload de avatar:", error);
    return reply
      .code(500)
      .send({ error: "Erro ao processar upload de avatar" });
  }
});

app.get("/users/me/privacy", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  // Inicializar privacidade com valores padrão se não existir
  if (!user.privacy) {
    user.privacy = {
      profilePublic: true,
      showEmail: false,
      showBirthDate: true,
      showFollowers: true,
    };
    writeData(data);
  }

  return user.privacy;
});

app.put("/users/me/privacy", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  const { profilePublic, showEmail, showBirthDate, showFollowers } =
    request.body || {};

  // Inicializar se não existir
  if (!user.privacy) {
    user.privacy = {
      profilePublic: true,
      showEmail: false,
      showBirthDate: true,
      showFollowers: true,
    };
  }

  // Atualizar apenas campos fornecidos
  if (typeof profilePublic === "boolean") {
    user.privacy.profilePublic = profilePublic;
  }
  if (typeof showEmail === "boolean") {
    user.privacy.showEmail = showEmail;
  }
  if (typeof showBirthDate === "boolean") {
    user.privacy.showBirthDate = showBirthDate;
  }
  if (typeof showFollowers === "boolean") {
    user.privacy.showFollowers = showFollowers;
  }

  writeData(data);
  return user.privacy;
});

app.put("/users/me/password", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  const { currentPassword, newPassword } = request.body || {};

  if (!currentPassword || !newPassword) {
    return reply
      .code(400)
      .send({ error: "currentPassword e newPassword são obrigatórios" });
  }

  // Validação: mínimo 6 caracteres
  if (newPassword.length < 6) {
    return reply
      .code(400)
      .send({ error: "Nova senha deve ter no mínimo 6 caracteres" });
  }

  // Verificar senha atual
  let currentPasswordValid = false;
  if (isHashed(user.password)) {
    currentPasswordValid = comparePassword(currentPassword, user.password);
  } else {
    // Senha antiga em texto plano
    currentPasswordValid = user.password === currentPassword;
  }

  if (!currentPasswordValid) {
    return reply.code(401).send({ error: "Senha atual incorreta" });
  }

  // Atualizar senha (sempre hash)
  user.password = hashPassword(newPassword);
  writeData(data);

  return { ok: true, message: "Senha alterada com sucesso" };
});

app.get("/users", async (request) => {
  const data = readData();
  ensureDataCollections(data);
  const requestingUser = getAuthUser(request, data);
  const query = (request.query?.search || "").toString().trim().toLowerCase();

  // Filtrar usuários bloqueados se houver usuário autenticado
  let users = data.users;
  if (requestingUser && requestingUser.blockedUserIds) {
    users = users.filter(
      (u) =>
        !requestingUser.blockedUserIds.some((blockedId) =>
          compareIds(blockedId, u.id),
        ),
    );
  }

  const sanitized = users.map(sanitizeUser);
  if (!query) return sanitized;
  return sanitized.filter((user) =>
    user.username?.toLowerCase().includes(query),
  );
});

app.get("/users/:id", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const requestingUser = getAuthUser(request, data);
  const id = request.params.id;
  const user = data.users.find((u) => compareIds(u.id, id));
  if (!user) return reply.code(404).send({ error: "Usuário não encontrado" });

  // Verificar se usuário está bloqueado
  if (requestingUser) {
    requestingUser.blockedUserIds = requestingUser.blockedUserIds || [];
    user.blockedUserIds = user.blockedUserIds || [];

    // Se o usuário solicitante bloqueou ou foi bloqueado pelo usuário, retornar erro
    if (
      requestingUser.blockedUserIds.some((blockedId) =>
        compareIds(blockedId, user.id),
      ) ||
      user.blockedUserIds.some((blockedId) =>
        compareIds(blockedId, requestingUser.id),
      )
    ) {
      return reply.code(403).send({ error: "Usuário não encontrado" });
    }
  }

  return sanitizeUser(user);
});

app.post("/users/:id/follow", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const me = getAuthUser(request, data);
  if (!me) return reply.code(401).send({ error: "Não autenticado" });
  const targetId = request.params.id;
  if (compareIds(me.id, targetId)) {
    return reply.code(400).send({ error: "Não é possível seguir a si mesmo" });
  }
  const target = data.users.find((u) => compareIds(u.id, targetId));
  if (!target) return reply.code(404).send({ error: "Usuário não encontrado" });

  me.followingIds = me.followingIds || [];
  me.followerIds = me.followerIds || [];
  target.followingIds = target.followingIds || [];
  target.followerIds = target.followerIds || [];

  const isFollowing = me.followingIds.some((id) => compareIds(id, targetId));
  if (isFollowing) {
    me.followingIds = me.followingIds.filter((id) => !compareIds(id, targetId));
    target.followerIds = target.followerIds.filter(
      (id) => !compareIds(id, me.id),
    );
  } else {
    me.followingIds.push(targetId);
    target.followerIds.push(me.id);
  }

  me.following = me.followingIds.length;
  me.followers = me.followerIds.length;
  target.following = target.followingIds.length;
  target.followers = target.followerIds.length;

  writeData(data);

  return {
    me: sanitizeUser(me),
    user: sanitizeUser(target),
    isFollowing: !isFollowing,
  };
});

app.post("/users/:id/block", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const me = getAuthUser(request, data);
  if (!me) return reply.code(401).send({ error: "Não autenticado" });
  const targetId = request.params.id;
  if (compareIds(me.id, targetId)) {
    return reply
      .code(400)
      .send({ error: "Não é possível bloquear a si mesmo" });
  }
  const target = data.users.find((u) => compareIds(u.id, targetId));
  if (!target) return reply.code(404).send({ error: "Usuário não encontrado" });

  me.blockedUserIds = me.blockedUserIds || [];

  if (me.blockedUserIds.some((id) => compareIds(id, targetId))) {
    return reply.code(400).send({ error: "Usuário já está bloqueado" });
  }

  // Adicionar à lista de bloqueados
  me.blockedUserIds.push(targetId);

  // Remover de seguidores/seguindo se houver
  me.followingIds = (me.followingIds || []).filter(
    (id) => !compareIds(id, targetId),
  );
  target.followerIds = (target.followerIds || []).filter(
    (id) => !compareIds(id, me.id),
  );

  // Atualizar contadores
  me.following = me.followingIds.length;
  target.followers = target.followerIds.length;

  writeData(data);

  return { ok: true, message: "Usuário bloqueado com sucesso" };
});

app.post("/users/:id/unblock", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const me = getAuthUser(request, data);
  if (!me) return reply.code(401).send({ error: "Não autenticado" });
  const targetId = request.params.id;
  const target = data.users.find((u) => compareIds(u.id, targetId));
  if (!target) return reply.code(404).send({ error: "Usuário não encontrado" });

  me.blockedUserIds = me.blockedUserIds || [];

  if (!me.blockedUserIds.some((id) => compareIds(id, targetId))) {
    return reply.code(400).send({ error: "Usuário não está bloqueado" });
  }

  // Remover da lista de bloqueados
  me.blockedUserIds = me.blockedUserIds.filter(
    (id) => !compareIds(id, targetId),
  );

  writeData(data);

  return { ok: true, message: "Usuário desbloqueado com sucesso" };
});

app.get("/users/me/friends", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const me = getAuthUser(request, data);
  if (!me) return reply.code(401).send({ error: "Não autenticado" });

  me.followingIds = me.followingIds || [];
  me.followerIds = me.followerIds || [];

  // Encontrar usuários que seguem e são seguidos (amizade mútua)
  const friends = me.followingIds
    .filter((followingId) =>
      me.followerIds.some((followerId) => compareIds(followerId, followingId)),
    )
    .map((friendId) => {
      const friend = data.users.find((u) => compareIds(u.id, friendId));
      return friend ? sanitizeUser(friend) : null;
    })
    .filter(Boolean);

  return friends;
});

app.get("/users/me/favorites", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const me = getAuthUser(request, data);
  if (!me) return reply.code(401).send({ error: "Não autenticado" });
  const favorites = data.userFavorites[me.id] || [];
  return { eventIds: favorites };
});

app.put("/users/me/favorites", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const me = getAuthUser(request, data);
  if (!me) return reply.code(401).send({ error: "Não autenticado" });
  const { eventIds } = request.body || {};
  if (!Array.isArray(eventIds)) {
    return reply.code(400).send({ error: "eventIds deve ser um array" });
  }
  const normalized = eventIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
  data.userFavorites[me.id] = Array.from(new Set(normalized));
  writeData(data);
  return { eventIds: data.userFavorites[me.id] };
});

// Events
app.get("/events", async () => {
  const data = readData();
  ensureDataCollections(data);
  // Retorna eventos com attendeesList sempre atualizado
  // E atualiza o evento no banco com os valores calculados
  const sanitizedEvents = data.events
    .filter((event) => !event.hidden) // Filtrar eventos ocultos
    .map((event) => {
      const sanitized = sanitizeEvent(event, data);
      // Atualiza o evento no banco com os valores calculados
      event.attendees = sanitized.attendees;
      event.attendeeIds = sanitized.attendeeIds;
      event.attendeesList = sanitized.attendeesList;
      return sanitized;
    });
  writeData(data); // Salva as atualizações
  return sanitizedEvents;
});

app.post("/events/:id/join", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });

  if (!event.isRecurring) {
    const endsAt = event.endsAt
      ? new Date(event.endsAt)
      : new Date(`${event.date} ${event.time}`);
    if (!Number.isNaN(endsAt.getTime()) && endsAt.getTime() < Date.now()) {
      return reply.code(400).send({ error: "Evento já aconteceu" });
    }
  }

  event.attendeeIds = event.attendeeIds || [];
  event.pendingRequestIds = event.pendingRequestIds || [];

  if (event.attendeeIds.some((uid) => compareIds(uid, user.id))) {
    return { status: "joined" };
  }

  if (event.requiresApproval) {
    if (!event.pendingRequestIds.some((uid) => compareIds(uid, user.id))) {
      event.pendingRequestIds.push(user.id);
      writeData(data);
    }
    return { status: "pending" };
  }

  event.attendeeIds.push(user.id);
  event.attendees = event.attendeeIds.length;
  // Atualiza attendeesList
  event.attendeesList = buildAttendeesList(event, data);
  writeData(data);
  return { status: "joined", event: sanitizeEvent(event, data) };
});

app.post("/events/:id/checkin", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });

  // Verificar se usuário está participando
  event.attendeeIds = event.attendeeIds || [];
  if (!event.attendeeIds.some((uid) => compareIds(uid, user.id))) {
    return reply.code(400).send({
      error: "Você precisa participar do evento antes de fazer check-in",
    });
  }

  // Verificar se evento já começou (opcional - pode remover se quiser permitir check-in antes)
  const startsAt = event.startsAt
    ? new Date(event.startsAt)
    : new Date(`${event.date} ${event.time}`);
  if (
    !event.isRecurring &&
    !Number.isNaN(startsAt.getTime()) &&
    startsAt.getTime() > Date.now()
  ) {
    return reply.code(400).send({ error: "Evento ainda não começou" });
  }

  const CHECKIN_DIR = path.join(UPLOAD_DIR, "checkins");
  if (!fs.existsSync(CHECKIN_DIR)) {
    fs.mkdirSync(CHECKIN_DIR, { recursive: true });
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

  try {
    const parts = request.parts();
    let photoFile = null;

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "photo") {
        photoFile = part;
        break;
      }
    }

    if (!photoFile) {
      return reply
        .code(400)
        .send({ error: "Foto é obrigatória para check-in" });
    }

    // Validar tipo MIME
    const mimeType = photoFile.mimetype || "";
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return reply.code(400).send({
        error: "Formato de imagem não suportado. Use JPG, PNG ou WEBP",
      });
    }

    // Validar extensão
    const ext = path.extname(photoFile.filename || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return reply
        .code(400)
        .send({ error: "Extensão de arquivo não suportada" });
    }

    // Validar tamanho
    const buffer = await photoFile.toBuffer();
    if (buffer.length > MAX_SIZE) {
      return reply
        .code(400)
        .send({ error: "Arquivo muito grande. Tamanho máximo: 5MB" });
    }

    // Gerar nome único
    const filename = `checkin-${event.id}-${user.id}-${Date.now()}${ext}`;
    const filepath = path.join(CHECKIN_DIR, filename);

    // Salvar arquivo
    await fs.promises.writeFile(filepath, buffer);

    const photoUrl = `/uploads/checkins/${filename}`;
    const checkInTime = new Date().toISOString();

    // Adicionar à mídia do evento
    data.eventMedia[id] = data.eventMedia[id] || [];
    const mediaItem = {
      id: generateId(),
      authorId: user.id,
      author: user.name || user.username,
      authorAvatar: user.avatar || "",
      photoUrl,
      createdAt: checkInTime,
      isCheckIn: true,
    };
    data.eventMedia[id].push(mediaItem);

    // Marcar participação como check-in feito
    // Criar estrutura de participações se não existir
    if (!data.eventParticipations) {
      data.eventParticipations = {};
    }
    if (!data.eventParticipations[id]) {
      data.eventParticipations[id] = [];
    }

    const participation = data.eventParticipations[id].find((p) =>
      compareIds(p.userId, user.id),
    );
    if (participation) {
      participation.status = "checkedIn";
      participation.checkedInAt = checkInTime;
      participation.checkInPhoto = photoUrl;
    } else {
      data.eventParticipations[id].push({
        userId: user.id,
        eventId: id,
        status: "checkedIn",
        checkedInAt: checkInTime,
        checkInPhoto: photoUrl,
      });
    }

    writeData(data);

    return {
      ok: true,
      message: "Check-in realizado com sucesso",
      photoUrl,
      participation: {
        userId: user.id,
        eventId: id,
        status: "checkedIn",
        checkedInAt: checkInTime,
        checkInPhoto: photoUrl,
      },
    };
  } catch (error) {
    app.log.error("Erro ao fazer check-in:", error);
    return reply.code(500).send({ error: "Erro ao processar check-in" });
  }
});

app.get("/users/me/participations", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  const { status, eventType, dateFrom, dateTo } = request.query || {};

  let participations = [];

  if (data.eventParticipations) {
    // Coletar todas as participações do usuário
    Object.values(data.eventParticipations).forEach((eventParticipations) => {
      if (Array.isArray(eventParticipations)) {
        eventParticipations.forEach((participation) => {
          if (compareIds(participation.userId, user.id)) {
            participations.push(participation);
          }
        });
      }
    });
  }

  // Enriquecer com dados do evento
  const enriched = participations
    .map((participation) => {
      const event = data.events.find((e) =>
        compareIds(e.id, participation.eventId),
      );
      return {
        ...participation,
        event: event ? sanitizeEvent(event, data) : null,
      };
    })
    .filter((p) => p.event !== null);

  // Aplicar filtros
  if (status) {
    enriched = enriched.filter((p) => p.status === status);
  }
  if (eventType) {
    enriched = enriched.filter((p) => p.event?.type === eventType);
  }
  if (dateFrom) {
    enriched = enriched.filter(
      (p) => p.event && new Date(p.event.date) >= new Date(dateFrom),
    );
  }
  if (dateTo) {
    enriched = enriched.filter(
      (p) => p.event && new Date(p.event.date) <= new Date(dateTo),
    );
  }

  // Ordenar por data (mais recente primeiro)
  enriched.sort((a, b) => {
    const dateA = a.event?.date ? new Date(a.event.date) : new Date(0);
    const dateB = b.event?.date ? new Date(b.event.date) : new Date(0);
    return dateB.getTime() - dateA.getTime();
  });

  // Estatísticas
  const stats = {
    total: enriched.length,
    checkedIn: enriched.filter((p) => p.status === "checkedIn").length,
    pending: enriched.filter((p) => p.status === "pending").length,
    approved: enriched.filter((p) => p.status === "approved").length,
  };

  return {
    participations: enriched,
    stats,
  };
});

// Eventos Recorrentes - Editar série completa
app.put("/events/:id/series", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });

  if (!event.isRecurring) {
    return reply.code(400).send({ error: "Evento não é recorrente" });
  }

  if (event.creatorId && !compareIds(event.creatorId, user.id)) {
    return reply
      .code(403)
      .send({ error: "Apenas o criador pode editar a série" });
  }

  const updates = request.body || {};
  const seriesId = event.recurringSeries?.seriesId || event.id;

  // Encontrar todos os eventos da série
  const seriesEvents = data.events.filter((e) => {
    if (e.recurringSeries?.seriesId) {
      return compareIds(e.recurringSeries.seriesId, seriesId);
    }
    // Fallback: eventos antigos podem ter apenas o mesmo creatorId e tipo
    return (
      e.isRecurring &&
      compareIds(e.creatorId, event.creatorId) &&
      e.type === event.type
    );
  });

  // Aplicar atualizações apenas a eventos futuros
  const now = Date.now();
  seriesEvents.forEach((seriesEvent) => {
    const eventDate = new Date(
      seriesEvent.startsAt || `${seriesEvent.date} ${seriesEvent.time}`,
    );
    if (eventDate.getTime() > now) {
      // Aplicar atualizações
      if (updates.name) seriesEvent.name = updates.name;
      if (updates.description) seriesEvent.description = updates.description;
      if (updates.location) seriesEvent.location = updates.location;
      if (updates.position) seriesEvent.position = updates.position;
      if (updates.maxAttendees !== undefined)
        seriesEvent.maxAttendees = updates.maxAttendees;
      if (updates.visibility) seriesEvent.visibility = updates.visibility;
      if (updates.requiresApproval !== undefined)
        seriesEvent.requiresApproval = updates.requiresApproval;
      if (updates.image) seriesEvent.image = updates.image;

      seriesEvent.updatedAt = new Date().toISOString();
    }
  });

  writeData(data);
  return {
    ok: true,
    message: "Série atualizada com sucesso",
    updatedCount: seriesEvents.length,
  };
});

// Cancelar ocorrência específica
app.delete("/events/:id/occurrence", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });

  if (!event.isRecurring) {
    return reply.code(400).send({ error: "Evento não é recorrente" });
  }

  if (event.creatorId && !compareIds(event.creatorId, user.id)) {
    return reply
      .code(403)
      .send({ error: "Apenas o criador pode cancelar ocorrências" });
  }

  const seriesId = event.recurringSeries?.seriesId || event.id;

  // Marcar ocorrência como cancelada
  if (!event.recurringSeries) {
    event.recurringSeries = {
      seriesId,
      parentEventId: event.id,
      occurrences: [],
      cancelledOccurrences: [],
    };
  }

  if (!event.recurringSeries.cancelledOccurrences) {
    event.recurringSeries.cancelledOccurrences = [];
  }

  if (
    !event.recurringSeries.cancelledOccurrences.some((occId) =>
      compareIds(occId, event.id),
    )
  ) {
    event.recurringSeries.cancelledOccurrences.push(event.id);
  }

  // Marcar evento como cancelado
  event.cancelled = true;
  event.updatedAt = new Date().toISOString();

  writeData(data);
  return { ok: true, message: "Ocorrência cancelada com sucesso" };
});

// Listar todas as ocorrências da série
app.get("/events/:id/series", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });

  if (!event.isRecurring) {
    return reply.code(400).send({ error: "Evento não é recorrente" });
  }

  const seriesId = event.recurringSeries?.seriesId || event.id;

  // Encontrar todos os eventos da série
  const seriesEvents = data.events
    .filter((e) => {
      if (e.recurringSeries?.seriesId) {
        return compareIds(e.recurringSeries.seriesId, seriesId);
      }
      // Fallback para eventos antigos
      return (
        e.isRecurring &&
        compareIds(e.creatorId, event.creatorId) &&
        e.type === event.type
      );
    })
    .map((e) => sanitizeEvent(e, data))
    .sort((a, b) => {
      const dateA = new Date(a.startsAt || `${a.date} ${a.time}`);
      const dateB = new Date(b.startsAt || `${b.date} ${b.time}`);
      return dateA.getTime() - dateB.getTime();
    });

  return {
    seriesId,
    occurrences: seriesEvents,
    cancelledCount: seriesEvents.filter((e) => e.cancelled).length,
  };
});

// Participar de série completa
app.post("/events/:id/series/join", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });

  if (!event.isRecurring) {
    return reply.code(400).send({ error: "Evento não é recorrente" });
  }

  const seriesId = event.recurringSeries?.seriesId || event.id;

  // Encontrar todos os eventos futuros da série
  const now = Date.now();
  const seriesEvents = data.events.filter((e) => {
    if (e.recurringSeries?.seriesId) {
      const matchesSeries = compareIds(e.recurringSeries.seriesId, seriesId);
      if (!matchesSeries) return false;
    } else {
      // Fallback
      if (
        !e.isRecurring ||
        !compareIds(e.creatorId, event.creatorId) ||
        e.type !== event.type
      ) {
        return false;
      }
    }

    // Apenas eventos futuros e não cancelados
    const eventDate = new Date(e.startsAt || `${e.date} ${e.time}`);
    return eventDate.getTime() > now && !e.cancelled;
  });

  let joinedCount = 0;

  seriesEvents.forEach((seriesEvent) => {
    seriesEvent.attendeeIds = seriesEvent.attendeeIds || [];
    seriesEvent.pendingRequestIds = seriesEvent.pendingRequestIds || [];

    if (seriesEvent.attendeeIds.some((uid) => compareIds(uid, user.id))) {
      return; // Já está participando
    }

    if (seriesEvent.requiresApproval) {
      if (
        !seriesEvent.pendingRequestIds.some((uid) => compareIds(uid, user.id))
      ) {
        seriesEvent.pendingRequestIds.push(user.id);
        joinedCount++;
      }
    } else {
      seriesEvent.attendeeIds.push(user.id);
      seriesEvent.attendees = seriesEvent.attendeeIds.length;
      seriesEvent.attendeesList = buildAttendeesList(seriesEvent, data);
      joinedCount++;
    }
  });

  writeData(data);
  return {
    ok: true,
    message: `Participação confirmada em ${joinedCount} evento(s) da série`,
    joinedCount,
  };
});

app.post("/events/:id/approve", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });
  if (event.creatorId && !compareIds(event.creatorId, user.id)) {
    return reply.code(403).send({ error: "Sem permissão" });
  }
  const { userId } = request.body || {};
  if (!userId) return reply.code(400).send({ error: "userId é obrigatório" });

  event.attendeeIds = event.attendeeIds || [];
  event.pendingRequestIds = event.pendingRequestIds || [];

  if (event.pendingRequestIds.some((uid) => compareIds(uid, userId))) {
    event.pendingRequestIds = event.pendingRequestIds.filter(
      (uid) => !compareIds(uid, userId),
    );
    if (!event.attendeeIds.some((uid) => compareIds(uid, userId))) {
      event.attendeeIds.push(userId);
      event.attendees = event.attendeeIds.length;
      // Atualiza attendeesList
      event.attendeesList = buildAttendeesList(event, data);
    }
    writeData(data);
  }

  return { status: "approved" };
});

app.post("/events", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const event = request.body || {};
  const requestedId = Number(event.id);
  const existing =
    requestedId !== undefined && requestedId !== null
      ? data.events.find((item) => compareIds(item.id, requestedId))
      : null;
  if (existing) {
    return reply.code(200).send(existing);
  }
  const newEvent = {
    ...event,
    id:
      requestedId !== undefined && requestedId !== null
        ? requestedId
        : generateId(), // Era: Date.now()
    attendeeIds: Array.isArray(event.attendeeIds) ? event.attendeeIds : [],
    creatorId: event.creatorId ?? user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // Constrói attendeesList automaticamente
  const sanitizedEvent = sanitizeEvent(newEvent, data);
  data.events.unshift(sanitizedEvent);
  writeData(data);
  return reply.code(201).send(sanitizedEvent);
});

app.get("/events/:id", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });
  return sanitizeEvent(event, data);
});

app.put("/events/:id", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });
  if (event.creatorId && !compareIds(event.creatorId, user.id)) {
    return reply.code(403).send({ error: "Sem permissão" });
  }

  // Inicializar servidornamento se não existir
  if (typeof event.version !== "number") {
    event.version = 1;
  }

  const updates = request.body || {};
  const clientVersion = updates.version;

  // Detecção de conflito: se a versão do cliente for diferente da versão atual
  if (clientVersion !== undefined && clientVersion !== event.version) {
    return reply.code(409).send({
      error: "Conflito de versão",
      message:
        "O evento foi modificado por outra pessoa. Recarregue a página e tente novamente.",
      currentVersion: event.version,
      clientVersion: clientVersion,
      currentEvent: sanitizeEvent(event, data),
    });
  }

  // Aplicar atualizações
  Object.assign(event, updates, {
    version: event.version + 1, // Incrementar versão
    updatedAt: new Date().toISOString(),
  });

  // Remover version do objeto do evento (não deve ser salvo como propriedade do evento)
  delete event.version;
  event.version = (updates.version || 0) + 1;

  // Atualiza attendeesList se necessário
  event.attendeesList = buildAttendeesList(event, data);
  writeData(data);

  const sanitized = sanitizeEvent(event, data);
  return { ...sanitized, version: event.version };
});

// Expenses API
app.get("/events/:id/expenses", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data); // Ensure collections exist
  const eventId = normalizeId(request.params.id);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  // Filtrar despesas do evento (todas as despesas do evento são visíveis para os participantes)
  const expenses = (data.expenses || []).filter((e) =>
    compareIds(e.eventId, eventId),
  );

  return expenses;
});

app.post("/events/:id/expenses", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  const eventId = normalizeId(request.params.id);
  const event = data.events.find((e) => compareIds(e.id, eventId));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });

  const { title, amount, participants, pixKey } = request.body || {}; // Added pixKey support

  if (!title || !amount) {
    return reply.code(400).send({ error: "Título e valor são obrigatórios" });
  }

  // Inicializar coleção de despesas se não existir
  data.expenses = data.expenses || [];

  const newExpense = {
    id: generateId(),
    eventId,
    creatorId: user.id,
    title,
    amount,
    participants: (participants || []).map((p) => ({
      ...p,
      status: "pending", // Default status: pending, paid_waiting_confirmation, paid
    })),
    pixKey, // Pass pixKey
    createdAt: new Date().toISOString(),
  };

  data.expenses.push(newExpense);
  writeData(data);

  return newExpense;
});

app.put("/events/:id/expenses/:expenseId", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data); // Ensure collections exist
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  const expenseId = normalizeId(request.params.expenseId);
  const expenseIndex = (data.expenses || []).findIndex((e) =>
    compareIds(e.id, expenseId),
  );

  if (expenseIndex === -1)
    return reply.code(404).send({ error: "Despesa não encontrada" });

  const expense = data.expenses[expenseIndex];

  const { title, amount, participants, pixKey } = request.body || {};

  if (title) expense.title = title;
  if (amount) expense.amount = amount;
  if (participants) expense.participants = participants;
  if (pixKey !== undefined) expense.pixKey = pixKey;

  data.expenses[expenseIndex] = expense;
  writeData(data);

  return expense;
});

app.put(
  "/events/:id/expenses/:expenseId/participants/:participantId",
  async (request, reply) => {
    const data = readData();
    ensureDataCollections(data);
    const user = getAuthUser(request, data);
    if (!user) return reply.code(401).send({ error: "Não autenticado" });

    const expenseId = normalizeId(request.params.expenseId);
    const participantId = normalizeId(request.params.participantId);
    const expenseIndex = (data.expenses || []).findIndex((e) =>
      compareIds(e.id, expenseId),
    );

    if (expenseIndex === -1)
      return reply.code(404).send({ error: "Despesa não encontrada" });
    const expense = data.expenses[expenseIndex];

    const { status } = request.body || {};
    // Status allowed: 'pending', 'paid_waiting_confirmation', 'paid'

    // Authorization check
    // 1. Participant can mark themselves as 'paid_waiting_confirmation'
    // 2. Creator can mark anyone as 'paid' or 'pending' (reject)

    const isCreator = compareIds(expense.creatorId, user.id);
    const isSelf = compareIds(participantId, user.id);

    const participantIndex = (expense.participants || []).findIndex((p) =>
      compareIds(p.userId, participantId),
    );
    if (participantIndex === -1)
      return reply
        .code(404)
        .send({ error: "Participante não encontrado na despesa" });

    if (isSelf && status === "paid_waiting_confirmation") {
      expense.participants[participantIndex].status =
        "paid_waiting_confirmation";
    } else if (isCreator) {
      if (status === "paid" || status === "pending") {
        expense.participants[participantIndex].status = status;
      } else {
        return reply
          .code(400)
          .send({ error: "Status inválido para o criador" });
      }
    } else {
      return reply.code(403).send({ error: "Permissão negada" });
    }

    // Helper: Update boolean 'paid' just for backward compatibility if needed,
    // but we should rely on status. Let's keep 'paid' in sync if we used it before?
    // Previously we used `paid: boolean`. Let's update it.
    expense.participants[participantIndex].paid =
      expense.participants[participantIndex].status === "paid";

    data.expenses[expenseIndex] = expense;
    writeData(data);

    return expense;
  },
);

app.delete("/events/:id/expenses/:expenseId", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data); // Ensure collections exist
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  const expenseId = normalizeId(request.params.expenseId);
  const initialLength = (data.expenses || []).length;

  data.expenses = (data.expenses || []).filter(
    (e) => !compareIds(e.id, expenseId),
  );

  if (data.expenses.length === initialLength) {
    return reply.code(404).send({ error: "Despesa não encontrada" });
  }

  writeData(data);
  return { ok: true };
});

app.delete("/events/:id", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });
  if (event.creatorId && !compareIds(event.creatorId, user.id)) {
    return reply.code(403).send({ error: "Sem permissão" });
  }
  data.events = data.events.filter((e) => !compareIds(e.id, id));
  // Remove chats e mídia relacionados
  delete data.eventChats[id];
  delete data.eventMedia[id];
  writeData(data);
  return { ok: true };
});

app.get("/events/:id/chat", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });
  return data.eventChats[id] || [];
});

app.post("/events/:id/chat", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });
  const { text, photoUrl } = request.body || {};
  if (!text && !photoUrl) {
    return reply.code(400).send({ error: "text ou photoUrl é obrigatório" });
  }
  data.eventChats[id] = data.eventChats[id] || [];
  data.eventMedia[id] = data.eventMedia[id] || [];
  const message = {
    id: Date.now(),
    authorId: user.id,
    author: user.name || user.username,
    authorAvatar: user.avatar || "",
    text: text || undefined,
    photoUrl: photoUrl || undefined,
    createdAt: new Date().toISOString(),
  };
  data.eventChats[id].push(message);
  if (photoUrl) {
    data.eventMedia[id].push({
      id: message.id,
      authorId: user.id,
      author: message.author,
      authorAvatar: message.authorAvatar,
      photoUrl,
      createdAt: message.createdAt,
    });
  }

  // Atualiza o evento para incluir o usuário na contagem de participantes
  // se ele ainda não estiver em attendeeIds
  event.attendeeIds = event.attendeeIds || [];
  if (!event.attendeeIds.some((uid) => compareIds(uid, user.id))) {
    event.attendeeIds.push(user.id);
  }
  // Recalcula attendees usando sanitizeEvent
  const sanitized = sanitizeEvent(event, data);
  event.attendees = sanitized.attendees;
  event.attendeeIds = sanitized.attendeeIds;
  event.attendeesList = sanitized.attendeesList;

  writeData(data);
  return { message, chat: data.eventChats[id], media: data.eventMedia[id] };
});

app.get("/events/:id/media", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const event = data.events.find((e) => compareIds(e.id, id));
  if (!event) return reply.code(404).send({ error: "Evento não encontrado" });
  return data.eventMedia[id] || [];
});

// Posts
app.get("/posts", async () => {
  const data = readData();
  ensureDataCollections(data);
  let updated = false;
  data.posts.forEach((post) => {
    if (!post.likedByIds) {
      post.likedByIds = [];
      updated = true;
    }
    if (!post.commentsList) {
      post.commentsList = [];
      updated = true;
    }
  });
  if (updated) writeData(data);
  return data.posts;
});

app.post("/posts", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const post = request.body || {};
  const newPost = {
    ...post,
    id: generateId(), // Era: Date.now()
    createdAt: new Date().toISOString(),
  };
  data.posts.unshift(newPost);
  writeData(data);
  return reply.code(201).send(newPost);
});

app.post("/posts/:id/like", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const post = data.posts.find((p) => compareIds(p.id, id));
  if (!post) return reply.code(404).send({ error: "Post não encontrado" });

  post.likedByIds = post.likedByIds || [];
  const isLiked = post.likedByIds.some((uid) => compareIds(uid, user.id));
  if (isLiked) {
    post.likedByIds = post.likedByIds.filter(
      (uid) => !compareIds(uid, user.id),
    );
  } else {
    post.likedByIds.push(user.id);
  }
  post.likes = post.likedByIds.length;
  writeData(data);
  return { likes: post.likes, liked: !isLiked };
});

app.post("/posts/:id/comments", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });
  const id = request.params.id;
  const post = data.posts.find((p) => compareIds(p.id, id));
  if (!post) return reply.code(404).send({ error: "Post não encontrado" });
  const { text } = request.body || {};
  if (!text) return reply.code(400).send({ error: "text é obrigatório" });

  post.commentsList = post.commentsList || [];
  const comment = {
    id: Date.now(),
    userId: user.id,
    username: user.username,
    text,
    createdAt: new Date().toISOString(),
  };
  post.commentsList.push(comment);
  post.comments = post.commentsList.length;
  writeData(data);
  return { comment, comments: post.comments };
});

// Notifications
app.get("/notifications", async () => {
  const data = readData();
  ensureDataCollections(data);
  return data.notifications;
});

app.put("/notifications/:id/read", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const id = request.params.id;
  const notif = data.notifications.find((n) => compareIds(n.id, id));
  if (!notif)
    return reply.code(404).send({ error: "Notificação não encontrada" });
  notif.unread = false;
  writeData(data);
  return { ok: true };
});

app.delete("/notifications/:id", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const id = request.params.id;
  data.notifications = data.notifications.filter((n) => !compareIds(n.id, id));
  writeData(data);
  return { ok: true };
});

// Uploads (local storage)
app.post("/media/upload", async (request, reply) => {
  const data = readData();
  ensureDataCollections(data);
  const user = getAuthUser(request, data);
  if (!user) return reply.code(401).send({ error: "Não autenticado" });

  const parts = request.parts();
  const saved = [];

  for await (const part of parts) {
    if (part.type !== "file") continue;
    const ext = path.extname(part.filename || "");
    const filename = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    await fs.promises.writeFile(filepath, await part.toBuffer());
    saved.push({
      id: Date.now(),
      url: `/uploads/${filename}`,
      ownerId: user.id,
      size: part.file.bytesRead,
      createdAt: new Date().toISOString(),
    });
  }

  data.media.push(...saved);
  writeData(data);
  return reply.code(201).send({ media: saved });
});

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

// ============================================
// Agendamento Automático de Tarefas
// ============================================

const BACKUP_DIR = path.join(process.cwd(), "backups");
const KEEP_BACKUPS = 3;

// Função para executar backup
function runBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(BACKUP_DIR, `data.${timestamp}.json`);
    fs.copyFileSync(DATA_PATH, backupPath);
    app.log.info(`Backup automático criado: ${backupPath}`);

    // Limpar backups antigos após criar novo
    cleanupBackups();
  } catch (error) {
    app.log.error("Erro ao executar backup automático:", error);
  }
}

// Função para limpar tokens expirados
function cleanupTokens() {
  try {
    const data = readData();
    if (!data.tokens || !Array.isArray(data.tokens)) {
      return;
    }

    const INACTIVITY_MS = 24 * 60 * 60 * 1000; // 1 dia
    const now = new Date();
    let removedCount = 0;

    const cleanedTokens = data.tokens.filter((token) => {
      const lastActivity = token.lastActivity
        ? new Date(token.lastActivity)
        : new Date(token.createdAt);
      const inactiveTime = now - lastActivity;

      if (inactiveTime > INACTIVITY_MS) {
        removedCount++;
        return false;
      }
      return true;
    });

    data.tokens = cleanedTokens;
    writeData(data);

    if (removedCount > 0) {
      app.log.info(
        `Limpeza de tokens: ${removedCount} tokens expirados removidos`,
      );
    }
  } catch (error) {
    app.log.error("Erro ao executar limpeza de tokens:", error);
  }
}

// Função para limpar uploads órfãos
function cleanupUploads() {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) {
      return;
    }

    const data = readData();
    const referencedUrls = new Set();

    // Coletar todas as URLs de mídia referenciadas
    if (Array.isArray(data.media)) {
      data.media.forEach((item) => {
        if (item.url) {
          const filename = item.url.replace("/uploads/", "");
          referencedUrls.add(filename);
        }
      });
    }

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

    if (Array.isArray(data.users)) {
      data.users.forEach((user) => {
        if (user.avatar && user.avatar.includes("/uploads/")) {
          const filename = user.avatar.replace(/^.*\/uploads\//, "");
          referencedUrls.add(filename);
        }
      });
    }

    if (Array.isArray(data.events)) {
      data.events.forEach((event) => {
        if (event.image && event.image.includes("/uploads/")) {
          const filename = event.image.replace(/^.*\/uploads\//, "");
          referencedUrls.add(filename);
        }
      });
    }

    const files = fs.readdirSync(UPLOAD_DIR);
    let removedCount = 0;

    files.forEach((filename) => {
      if (!referencedUrls.has(filename)) {
        try {
          const filepath = path.join(UPLOAD_DIR, filename);
          fs.unlinkSync(filepath);
          removedCount++;
        } catch (error) {
          app.log.error(`Erro ao remover ${filename}:`, error);
        }
      }
    });

    if (removedCount > 0) {
      app.log.info(
        `Limpeza de uploads: ${removedCount} arquivos órfãos removidos`,
      );
    }
  } catch (error) {
    app.log.error("Erro ao executar limpeza de uploads:", error);
  }
}

// Função para limpar backups antigos
function cleanupBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return;
    }

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length <= KEEP_BACKUPS) {
      return;
    }

    const toDelete = files.slice(KEEP_BACKUPS);
    let removedCount = 0;

    toDelete.forEach((file) => {
      try {
        fs.unlinkSync(file.path);
        removedCount++;
      } catch (error) {
        app.log.error(`Erro ao remover backup ${file.name}:`, error);
      }
    });

    if (removedCount > 0) {
      app.log.info(
        `Limpeza de backups: ${removedCount} backups antigos removidos`,
      );
    }
  } catch (error) {
    app.log.error("Erro ao executar limpeza de backups:", error);
  }
}

// Agendar tarefas
// Backup diário às 02:00 (ou a cada 24 horas após iniciar)
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 horas
setInterval(() => {
  runBackup();
  cleanupBackups(); // Limpar backups antigos após criar novo
}, BACKUP_INTERVAL);

// Limpeza de tokens a cada 6 horas
const TOKEN_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 horas
setInterval(() => {
  cleanupTokens();
}, TOKEN_CLEANUP_INTERVAL);

// Limpeza de uploads a cada 12 horas
const UPLOAD_CLEANUP_INTERVAL = 12 * 60 * 60 * 1000; // 12 horas
setInterval(() => {
  cleanupUploads();
}, UPLOAD_CLEANUP_INTERVAL);

// Executar backup imediatamente ao iniciar (opcional)
// runBackup();

app.log.info("Agendamento automático configurado:");
app.log.info(`  - Backup: a cada ${BACKUP_INTERVAL / (60 * 60 * 1000)} horas`);
app.log.info(
  `  - Limpeza de tokens: a cada ${TOKEN_CLEANUP_INTERVAL / (60 * 60 * 1000)} horas`,
);
app.log.info(
  `  - Limpeza de uploads: a cada ${UPLOAD_CLEANUP_INTERVAL / (60 * 60 * 1000)} horas`,
);

app.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Servidor rodando em ${address}`);
});
