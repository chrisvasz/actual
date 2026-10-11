import * as argon2 from 'argon2';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { clearExpiredSessions, getAccountDb } from '#account-db';
import { config } from '#load-config';
import { TOKEN_EXPIRATION_NEVER } from '#util/validate-user';

// https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 47104,
  timeCost: 1,
  parallelism: 1,
};

export function isValidPassword(password) {
  return password != null && password !== '';
}

export function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password, hash) {
  if (typeof hash !== 'string') return false;

  if (hash.startsWith('$argon2')) {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

function isLegacyHash(hash) {
  return typeof hash === 'string' && !hash.startsWith('$argon2');
}

export function setPasswordHash(hashed) {
  const accountDb = getAccountDb();
  accountDb.transaction(() => {
    accountDb.mutate('DELETE FROM auth WHERE method = ?', ['password']);
    accountDb.mutate('UPDATE auth SET active = 0');
    accountDb.mutate(
      "INSERT INTO auth (method, display_name, extra_data, active) VALUES ('password', 'Password', ?, 1)",
      [hashed],
    );
  });
}

export async function bootstrapPassword(password) {
  if (!isValidPassword(password)) {
    return { error: 'invalid-password' };
  }

  const hashed = await hashPassword(password);
  setPasswordHash(hashed);

  return {};
}

export async function loginWithPassword(password) {
  if (!isValidPassword(password)) {
    return { error: 'invalid-password' };
  }

  const accountDb = getAccountDb();
  const { extra_data: passwordHash } =
    accountDb.first('SELECT extra_data FROM auth WHERE method = ?', [
      'password',
    ]) || {};

  if (!passwordHash) {
    return { error: 'invalid-password' };
  }

  const confirmed = await verifyPassword(password, passwordHash);

  if (!confirmed) {
    return { error: 'invalid-password' };
  }

  if (isLegacyHash(passwordHash)) {
    const rehashed = await hashPassword(password);
    accountDb.mutate(
      "UPDATE auth SET extra_data = ? WHERE method = 'password' AND extra_data = ?",
      [rehashed, passwordHash],
    );
  }

  const sessionRow = accountDb.first(
    'SELECT * FROM sessions WHERE auth_method = ?',
    ['password'],
  );

  const token = sessionRow ? sessionRow.token : uuidv4();

  let expiration = TOKEN_EXPIRATION_NEVER;
  if (
    config.get('token_expiration') !== 'never' &&
    typeof config.get('token_expiration') === 'number'
  ) {
    expiration =
      Math.floor(Date.now() / 1000) + config.get('token_expiration') * 60;
  }

  if (!sessionRow) {
    accountDb.mutate(
      'INSERT INTO sessions (token, expires_at, auth_method) VALUES (?, ?, ?)',
      [token, expiration, 'password'],
    );
  } else {
    accountDb.mutate('UPDATE sessions SET expires_at = ? WHERE token = ?', [
      expiration,
      token,
    ]);
  }

  clearExpiredSessions();

  return { token };
}

export async function changePassword(newPassword) {
  const accountDb = getAccountDb();

  if (!isValidPassword(newPassword)) {
    return { error: 'invalid-password' };
  }

  const hashed = await hashPassword(newPassword);
  const result = accountDb.mutate(
    "UPDATE auth SET extra_data = ? WHERE method = 'password'",
    [hashed],
  );
  if (result.changes === 0) {
    return { error: 'no-password-method' };
  }
  return {};
}
