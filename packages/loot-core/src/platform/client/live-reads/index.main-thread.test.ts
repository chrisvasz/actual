import { createInProcessChannel } from '#platform/in-process-channel';
import type { BudgetChanges, LiveReads } from '#platform/in-process-channel';
import { q } from '#shared/query';

import { connectLiveReads, onChanges, runQuerySync } from './index.main-thread';

describe('live reads (main thread)', () => {
  it('reads through the channel the backend installed, and forwards changes', () => {
    const query = q('transactions').select('*');
    expect(() => runQuerySync(query)).toThrow(
      'The backend has not been started',
    );

    let backendListener: ((changes: BudgetChanges) => void) | null = null;
    const reads: LiveReads = {
      query: vi.fn(() => ({ data: [{ id: 't1' }], dependencies: ['x'] })),
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

    const change = { tables: ['transactions'], ids: { transactions: ['t1'] } };
    backendListener!(change);
    backendListener!('all');
    stop();
    backendListener!({ tables: ['accounts'], ids: { accounts: ['a1'] } });
    expect(changes).toEqual([change, 'all']);
  });
});
