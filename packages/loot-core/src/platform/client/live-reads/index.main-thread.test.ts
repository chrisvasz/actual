import { createInProcessChannel } from '#platform/in-process-channel';
import type { ChangedTables, LiveReads } from '#platform/in-process-channel';
import { q } from '#shared/query';

import {
  connectLiveReads,
  onTablesChanged,
  runQuerySync,
} from './index.main-thread';

describe('live reads (main thread)', () => {
  it('reads through the channel the backend installed, and forwards changes', () => {
    const query = q('transactions').select('*');
    expect(() => runQuerySync(query)).toThrow(
      'The backend has not been started',
    );

    let backendListener: ((tables: ChangedTables) => void) | null = null;
    const reads: LiveReads = {
      query: vi.fn(() => ({ data: [{ id: 't1' }], dependencies: ['x'] })),
      onTablesChanged: listener => {
        backendListener = listener;
        return vi.fn();
      },
    };
    const changes: ChangedTables[] = [];
    // Listening before the backend starts still hears its changes
    const stop = onTablesChanged(tables => changes.push(tables));

    connectLiveReads({ ...createInProcessChannel(), reads });

    expect(runQuerySync(query)).toEqual({
      data: [{ id: 't1' }],
      dependencies: ['x'],
    });
    expect(reads.query).toHaveBeenCalledWith(query.serialize());

    backendListener!(['transactions']);
    backendListener!('all');
    stop();
    backendListener!(['accounts']);
    expect(changes).toEqual([['transactions'], 'all']);
  });
});
