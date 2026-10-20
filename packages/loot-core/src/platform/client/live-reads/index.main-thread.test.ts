import { createInProcessChannel } from '#platform/in-process-channel';
import type { BudgetChanges, LiveReads } from '#platform/in-process-channel';
import { q } from '#shared/query';

import {
  connectLiveReads,
  onChanges,
  readSync,
  runQuerySync,
} from './index.main-thread';

describe('live reads (main thread)', () => {
  it('reads through the channel the backend installed, and forwards changes', () => {
    const query = q('transactions').select('*');
    expect(() => runQuerySync(query)).toThrow(
      'The backend has not been started',
    );
    expect(() => readSync('accounts-get')).toThrow(
      'The backend has not been started',
    );

    let backendListener: ((changes: BudgetChanges) => void) | null = null;
    const reads: LiveReads = {
      query: vi.fn(() => ({ data: [{ id: 't1' }], dependencies: ['x'] })),
      read: vi.fn(() => ({ data: [{ id: 'a1' }], dependencies: ['accounts'] })),
      onChanges: listener => {
        backendListener = listener;
        return vi.fn();
      },
    };
    const changes: BudgetChanges[] = [];
    // Listening before the backend starts still hears its changes
    const stop = onChanges(change => changes.push(change));

    connectLiveReads({ ...createInProcessChannel(), reads });

    expect(runQuerySync(query)).toEqual({
      data: [{ id: 't1' }],
      dependencies: ['x'],
    });
    expect(reads.query).toHaveBeenCalledWith(query.serialize());
    expect(readSync('accounts-get')).toEqual({
      data: [{ id: 'a1' }],
      dependencies: ['accounts'],
    });
    expect(reads.read).toHaveBeenCalledWith('accounts-get', undefined);

    const change = { tables: ['transactions'], ids: { transactions: ['t1'] } };
    backendListener!(change);
    backendListener!('all');
    stop();
    backendListener!({ tables: ['accounts'], ids: { accounts: ['a1'] } });
    expect(changes).toEqual([change, 'all']);
  });
});
