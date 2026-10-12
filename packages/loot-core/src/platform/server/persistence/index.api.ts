// The Node backend writes straight to a database file on disk
// (better-sqlite3), so there's nothing to persist separately.

import type * as T from './index';

export const flush: typeof T.flush = async () => {
  // Nothing to flush
};
