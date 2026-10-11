import * as db from '#server/db';

export function createPayee(description: string) {
  // Check to make sure no payee already exists with exactly the same
  // name
  const row = db.first<Pick<db.DbPayee, 'id'>>(
    `SELECT id FROM payees WHERE UNICODE_LOWER(name) = ? AND tombstone = 0`,
    [description.toLowerCase()],
  );

  if (row) {
    return row.id;
  } else {
    return db.insertPayee({ name: description }) as db.DbPayee['id'];
  }
}

export function getStartingBalancePayee() {
  let category = db.first<db.DbCategory>(`
    SELECT * FROM categories
      WHERE is_income = 1 AND
      LOWER(name) = 'starting balances' AND
      tombstone = 0
  `);
  if (category === null) {
    category = db.first<db.DbCategory>(
      'SELECT * FROM categories WHERE is_income = 1 AND tombstone = 0',
    );
  }

  const id = createPayee('Starting Balance');
  return {
    id,
    category: category ? category.id : null,
  };
}
