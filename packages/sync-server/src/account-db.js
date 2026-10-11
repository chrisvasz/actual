import { join, resolve } from 'node:path';

import {
  hashPassword,
  isValidPassword,
  loginWithPassword,
  setPasswordHash,
} from './accounts/password';
import { openDatabase } from './db';
import { config } from './load-config';

let _accountDb;

export function getAccountDb() {
  if (_accountDb === undefined) {
    const dbPath = join(resolve(config.get('serverFiles')), 'account.sqlite');
    _accountDb = openDatabase(dbPath);
  }

  return _accountDb;
}

export function needsBootstrap() {
  const accountDb = getAccountDb();
  const rows = accountDb.all('SELECT * FROM auth');
  return rows.length === 0;
}

export function listLoginMethods() {
  const accountDb = getAccountDb();
  const rows = accountDb.all('SELECT method, display_name, active FROM auth');
  return rows.map(r => ({
    method: r.method,
    active: r.active,
    displayName: r.display_name,
  }));
}

export function getActiveLoginMethod() {
  const accountDb = getAccountDb();
  const { method } =
    accountDb.first('SELECT method FROM auth WHERE active = 1') || {};
  return method;
}

/*
 * Get the Login Method in the following order
 * req (the frontend can say which method in the case it wants to resort to forcing password auth)
 * config options
 * fall back to using password
 */
export function getLoginMethod(req) {
  if (
    typeof req !== 'undefined' &&
    (req.body || { loginMethod: null }).loginMethod &&
    config.get('allowedLoginMethods').includes(req.body.loginMethod)
  ) {
    const accountDb = getAccountDb();
    const row = accountDb.first('SELECT method FROM auth WHERE method = ?', [
      req.body.loginMethod,
    ]);
    if (row) return req.body.loginMethod;
  }

  //BY-PASS ANY OTHER CONFIGURATION TO ENSURE HEADER AUTH
  if (
    config.get('loginMethod') === 'header' &&
    config.get('allowedLoginMethods').includes('header')
  ) {
    return config.get('loginMethod');
  }

  const activeMethod = getActiveLoginMethod();
  return activeMethod || config.get('loginMethod');
}

export async function bootstrap(loginSettings) {
  if (!loginSettings) {
    return { error: 'invalid-login-settings' };
  }

  if (!('password' in loginSettings)) {
    return { error: 'no-auth-method-selected' };
  }

  if (!isValidPassword(loginSettings.password)) {
    return { error: 'invalid-password' };
  }

  const passwordHash = await hashPassword(loginSettings.password);
  const accountDb = getAccountDb();

  accountDb.mutate('BEGIN TRANSACTION');
  try {
    if (!needsBootstrap()) {
      accountDb.mutate('ROLLBACK');
      return { error: 'already-bootstrapped' };
    }

    setPasswordHash(passwordHash);
    accountDb.mutate('COMMIT');
  } catch (error) {
    accountDb.mutate('ROLLBACK');
    throw error;
  }

  return await loginWithPassword(loginSettings.password);
}

export function getSession(token) {
  const accountDb = getAccountDb();
  return accountDb.first('SELECT * FROM sessions WHERE token = ?', [token]);
}

export function getServerPrefs() {
  const accountDb = getAccountDb();
  const rows = accountDb.all('SELECT key, value FROM server_prefs') || [];

  return rows.reduce((prefs, row) => {
    prefs[row.key] = row.value;
    return prefs;
  }, {});
}

export function setServerPrefs(prefs) {
  const accountDb = getAccountDb();

  if (!prefs) {
    return;
  }

  accountDb.transaction(() => {
    Object.entries(prefs).forEach(([key, value]) => {
      accountDb.mutate(
        'INSERT INTO server_prefs (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, value],
      );
    });
  });
}

export function clearExpiredSessions() {
  const clearThreshold = Math.floor(Date.now() / 1000) - 3600;

  const deletedSessions = getAccountDb().mutate(
    'DELETE FROM sessions WHERE expires_at <> -1 and expires_at < ?',
    [clearThreshold],
  ).changes;

  console.log(`Deleted ${deletedSessions} old sessions`);
}
