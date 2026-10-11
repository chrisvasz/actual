import { getAccountDb } from './src/account-db';
import { run as runMigrations } from './src/migrations';

export async function setup() {
  const NEVER_EXPIRES = -1; // or consider using a far future timestamp

  await runMigrations();

  // Insert a fake "valid-token" fixture that can be reused
  const db = getAccountDb();
  try {
    await db.mutate('BEGIN TRANSACTION');

    await db.mutate('DELETE FROM sessions');
    await db.mutate('INSERT INTO sessions (token, expires_at) VALUES (?, ?)', [
      'valid-token',
      NEVER_EXPIRES,
    ]);

    await db.mutate('COMMIT');
  } catch (error) {
    await db.mutate('ROLLBACK');
    throw new Error(`Failed to setup test sessions: ${error.message}`);
  }
}

export async function teardown() {
  await runMigrations('down');
}
