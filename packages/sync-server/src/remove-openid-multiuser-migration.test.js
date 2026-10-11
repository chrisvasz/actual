import { down, up } from '../migrations/1791691691213-remove-openid-multiuser';

import { getAccountDb } from './account-db';
import { bootstrapPassword } from './accounts/password';

function tableNames() {
  return getAccountDb()
    .all("SELECT name FROM sqlite_master WHERE type = 'table'")
    .map(({ name }) => name);
}

function columnNames(table) {
  return getAccountDb()
    .all(`PRAGMA table_info(${table})`)
    .map(({ name }) => name);
}

describe('remove-openid-multiuser migration', () => {
  let savedAuth;
  let savedSessions;

  beforeEach(async () => {
    const db = getAccountDb();
    savedAuth = db.all('SELECT * FROM auth');
    savedSessions = db.all('SELECT * FROM sessions');
    db.mutate('DELETE FROM auth');

    // Put the schema back into its multi-user shape.
    await down();
  });

  afterEach(async () => {
    const db = getAccountDb();
    if (tableNames().includes('users')) {
      await up();
    }

    db.mutate('DELETE FROM auth');
    for (const row of savedAuth) {
      db.mutate(
        'INSERT INTO auth (method, display_name, extra_data, active) VALUES (?, ?, ?, ?)',
        [row.method, row.display_name, row.extra_data, row.active],
      );
    }
    db.mutate('DELETE FROM sessions');
    for (const row of savedSessions) {
      db.mutate(
        'INSERT INTO sessions (token, expires_at, auth_method) VALUES (?, ?, ?)',
        [row.token, row.expires_at, row.auth_method],
      );
    }
    db.mutate("DELETE FROM files WHERE id LIKE 'migration-test-%'");
  });

  it('drops multi-user data and falls back to password login', async () => {
    const db = getAccountDb();
    db.mutate(
      "INSERT INTO auth (method, display_name, extra_data, active) VALUES ('password', 'Password', 'hash', 0), ('openid', 'OpenID', '{}', 1)",
    );
    db.mutate(
      "INSERT INTO users (id, user_name, display_name, role, enabled, owner) VALUES ('migration-test-bob', 'bob', 'Bob', 'BASIC', 1, 0)",
    );
    db.mutate(
      "INSERT INTO files (id, name, deleted, owner) VALUES ('migration-test-file', 'Budget', FALSE, 'migration-test-bob')",
    );
    db.mutate(
      "INSERT INTO user_access (user_id, file_id) VALUES ('migration-test-bob', 'migration-test-file')",
    );
    db.mutate(
      "INSERT INTO sessions (token, expires_at, user_id, auth_method) VALUES ('migration-test-openid', -1, 'migration-test-bob', 'openid'), ('migration-test-password', -1, 'migration-test-bob', 'password')",
    );

    await up();

    expect(tableNames()).not.toContain('users');
    expect(tableNames()).not.toContain('user_access');
    expect(tableNames()).not.toContain('pending_openid_requests');
    expect(columnNames('files')).not.toContain('owner');
    expect(columnNames('sessions')).not.toContain('user_id');

    expect(db.all('SELECT method, active FROM auth')).toEqual([
      { method: 'password', active: 1 },
    ]);
    expect(
      db
        .all("SELECT token FROM sessions WHERE token LIKE 'migration-test-%'")
        .map(({ token }) => token),
    ).toEqual(['migration-test-password']);
    expect(
      db.first("SELECT name FROM files WHERE id = 'migration-test-file'"),
    ).toEqual({ name: 'Budget' });
  });

  it('refuses to run on a server that only has OpenID login', async () => {
    getAccountDb().mutate(
      "INSERT INTO auth (method, display_name, extra_data, active) VALUES ('openid', 'OpenID', '{}', 1)",
    );

    await expect(up()).rejects.toThrow(/no password/);
    expect(tableNames()).toContain('users');

    // What `--reset-password` does on such a server.
    await bootstrapPassword('new password');
    await up();

    expect(getAccountDb().all('SELECT method, active FROM auth')).toEqual([
      { method: 'password', active: 1 },
    ]);
  });

  it('runs on a server that was never set up', async () => {
    await up();

    expect(tableNames()).not.toContain('users');
  });
});
