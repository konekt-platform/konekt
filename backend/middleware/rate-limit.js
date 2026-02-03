// Rate limiting middleware para Fastify
// Aplica limites apenas em requisições de escrita (POST, PUT, DELETE)
// GET requests não são limitados (para permitir polling)

const rateLimitStore = new Map(); // Armazenamento em memória

// Limites configuráveis
const LIMITS = {
  // Limites gerais (apenas escrita)
  IP_WRITE: 100, // requisições por minuto por IP
  USER_WRITE: 200, // requisições por minuto por usuário autenticado

  // Limites específicos por endpoint
  CREATE_EVENT: 10, // eventos por hora
  CREATE_POST: 2, // posts por hora
};

// Limpa contadores antigos periodicamente
setInterval(
  () => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
      // Remove entradas com mais de 1 hora
      if (now - data.lastCleanup > 60 * 60 * 1000) {
        rateLimitStore.delete(key);
      }
    }
  },
  5 * 60 * 1000,
); // Limpeza a cada 5 minutos

function getKey(type, identifier) {
  return `${type}:${identifier}`;
}

function getWindowKey(windowMinutes) {
  const now = Date.now();
  const windowMs = windowMinutes * 60 * 1000;
  return Math.floor(now / windowMs);
}

function checkRateLimit(key, limit, windowMinutes) {
  const windowKey = getWindowKey(windowMinutes);
  const storeKey = `${key}:${windowKey}`;

  const entry = rateLimitStore.get(storeKey) || {
    count: 0,
    resetAt: Date.now() + windowMinutes * 60 * 1000,
  };

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count += 1;
  entry.lastCleanup = Date.now();
  rateLimitStore.set(storeKey, entry);

  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
  };
}

export function rateLimitMiddleware(request, reply, done) {
  // Ignorar GET requests completamente
  if (request.method === "GET") {
    return done();
  }

  // Apenas aplicar em POST, PUT, DELETE
  if (!["POST", "PUT", "DELETE"].includes(request.method)) {
    return done();
  }

  const ip =
    request.ip ||
    request.headers["x-forwarded-for"] ||
    request.socket?.remoteAddress ||
    "unknown";
  const userId = request.userId; // userId extraído no hook

  // Limites por IP (apenas escrita)
  const ipKey = getKey("ip", ip);
  const ipLimit = checkRateLimit(ipKey, LIMITS.IP_WRITE, 1); // 1 minuto

  if (!ipLimit.allowed) {
    return reply.code(429).send({
      error: "Muitas requisições. Tente novamente em alguns minutos.",
      retryAfter: Math.ceil((ipLimit.resetAt - Date.now()) / 1000),
    });
  }

  // Limites por usuário (se autenticado)
  if (userId) {
    const userKey = getKey("user", userId);
    const userLimit = checkRateLimit(userKey, LIMITS.USER_WRITE, 1); // 1 minuto

    if (!userLimit.allowed) {
      return reply.code(429).send({
        error: "Muitas requisições. Tente novamente em alguns minutos.",
        retryAfter: Math.ceil((userLimit.resetAt - Date.now()) / 1000),
      });
    }
  }

  // Limites específicos por endpoint
  const path = request.url.split("?")[0];

  // Limite de criação de eventos
  if (path === "/events" && request.method === "POST" && userId) {
    const eventKey = getKey("event", userId);
    const eventLimit = checkRateLimit(eventKey, LIMITS.CREATE_EVENT, 60); // 60 minutos (1 hora)

    if (!eventLimit.allowed) {
      return reply.code(429).send({
        error:
          "Limite de criação de eventos atingido. Máximo de 10 eventos por hora.",
        retryAfter: Math.ceil((eventLimit.resetAt - Date.now()) / 1000),
      });
    }
  }

  // Limite de criação de posts
  if (path === "/posts" && request.method === "POST" && userId) {
    const postKey = getKey("post", userId);
    const postLimit = checkRateLimit(postKey, LIMITS.CREATE_POST, 60); // 60 minutos (1 hora)

    if (!postLimit.allowed) {
      return reply.code(429).send({
        error:
          "Limite de criação de posts atingido. Máximo de 2 posts por hora.",
        retryAfter: Math.ceil((postLimit.resetAt - Date.now()) / 1000),
      });
    }
  }

  done();
}
