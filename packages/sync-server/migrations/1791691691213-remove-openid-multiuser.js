import { v4 as uuidv4 } from 'uuid';

import { getAccountDb } from '../src/account-db';

// OpenID login and multi-user support were removed. Drop their tables and
// columns, and fall back to password login.
export const up = async function () {
  const accountDb = getAccountDb();

  // A server set up with OpenID may never have had a password. Removing the
  // OpenID login would leave it with no login at all, and the bootstrap screen
  // would let the first visitor claim it. Refuse to migrate until a password
  // has been set from the command line.
  const methods = accountDb.all('SELECT method FROM auth');
  if (
    methods.length > 0 &&
    !methods.some(({ method }) => method === 'password')
  ) {
    throw new Error(
      'OpenID login has been removed and this server has no password. ' +
        'Set one with `actual-server --reset-password` (or ' +
        '`yarn workspace @actual-app/sync-server reset-password`), ' +
        'then start the server again.',
    );
  }

  accountDb.transaction(() => {
    accountDb.exec(
      `
    DROP TABLE IF EXISTS pending_openid_requests;
    DROP TABLE IF EXISTS user_access;
    DROP TABLE IF EXISTS users;

    ALTER TABLE files DROP COLUMN owner;
    ALTER TABLE sessions DROP COLUMN user_id;

    DELETE FROM sessions WHERE auth_method IS NOT 'password';
    DELETE FROM auth WHERE method <> 'password';
    UPDATE auth SET active = 1;
        `,
    );
  });
};

export const down = async function () {
  const accountDb = getAccountDb();

  accountDb.transaction(() => {
    accountDb.exec(
      `
    CREATE TABLE pending_openid_requests
      (state TEXT PRIMARY KEY,
      code_verifier TEXT,
      return_url TEXT,
      expiry_time INTEGER);

    CREATE TABLE users
        (id TEXT PRIMARY KEY,
        user_name TEXT,
        display_name TEXT,
        role TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        owner INTEGER NOT NULL DEFAULT 0);

    CREATE TABLE user_access
      (user_id TEXT,
      file_id TEXT,
      PRIMARY KEY (user_id, file_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (file_id) REFERENCES files(id)
      );

    ALTER TABLE files
        ADD COLUMN owner TEXT;

    ALTER TABLE sessions
        ADD COLUMN user_id TEXT;
        `,
    );

    const userId = uuidv4();
    accountDb.mutate(
      'INSERT INTO users (id, user_name, display_name, enabled, owner, role) VALUES (?, ?, ?, 1, 1, ?)',
      [userId, '', '', 'ADMIN'],
    );
    accountDb.mutate('UPDATE files SET owner = ?', [userId]);
    accountDb.mutate('UPDATE sessions SET user_id = ?', [userId]);
  });
};
