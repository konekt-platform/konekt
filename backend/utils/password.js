import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * Hash de senha para armazenamento seguro
 */
export function hashPassword(password) {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

/**
 * Compara senha em texto plano com hash
 */
export function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

/**
 * Verifica se uma string é um hash bcrypt
 */
export function isHashed(password) {
  return typeof password === "string" && password.startsWith("$2");
}
