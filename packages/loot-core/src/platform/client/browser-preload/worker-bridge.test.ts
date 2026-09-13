// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import { WorkerBridge } from './worker-bridge';

vi.mock('absurd-sql/dist/indexeddb-main-thread', () => ({
  initBackend: vi.fn(),
}));

// ── Test helpers ────────────────────────────────────────────────────────

type MockPort = {
  postMessage: Mock;
  start: Mock;
  close: Mock;
  addEventListener: Mock;
  /** Deliver a message as if the coordinator sent it. */
  emit: (data: unknown) => void;
};

type MockWorker = {
  postMessage: Mock;
  terminate: Mock;
  onmessage: ((e: MessageEvent) => void) | null;
};

const workerUrl = new URL('https://localhost/backend.js');
let createdWorkers: MockWorker[] = [];

function createMockPort(): MockPort {
  let listener: ((e: MessageEvent) => void) | null = null;
  return {
    postMessage: vi.fn(),
    start: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn((_type: string, handler: () => void) => {
      listener = handler;
    }),
    emit: (data: unknown) => listener?.({ data } as MessageEvent),
  };
}

function setup(): { bridge: WorkerBridge; port: MockPort } {
  const port = createMockPort();
  const bridge = new WorkerBridge(port as unknown as MessagePort, workerUrl);
  return { bridge, port };
}

/** The dedicated Worker created by the most recent fallback. */
function lastWorker(): MockWorker {
  const worker = createdWorkers.at(-1);
  if (!worker) throw new Error('no Worker was created');
  return worker;
}

beforeEach(() => {
  createdWorkers = [];
  vi.stubGlobal(
    'Worker',
    class {
      postMessage = vi.fn();
      terminate = vi.fn();
      onmessage: ((e: MessageEvent) => void) | null = null;

      constructor() {
        createdWorkers.push(this);
      }
    },
  );
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('WorkerBridge direct-Worker fallback', () => {
  it('starts a dedicated Worker and forwards the init message', () => {
    const { bridge } = setup();
    const initMsg = { type: 'init', version: '1.0' };

    expect(bridge.fallbackToDirectWorker(initMsg)).toBe(true);
    expect(createdWorkers).toHaveLength(1);
    expect(lastWorker().postMessage).toHaveBeenCalledWith(initMsg);
  });

  it('closes the unusable shared port', () => {
    const { bridge, port } = setup();

    bridge.fallbackToDirectWorker({ type: 'init' });

    expect(port.close).toHaveBeenCalled();
  });

  it('routes outgoing messages to the Worker instead of the port', () => {
    const { bridge, port } = setup();
    bridge.fallbackToDirectWorker({ type: 'init' });
    port.postMessage.mockClear();

    bridge.postMessage({ name: 'get-budgets' });

    expect(lastWorker().postMessage).toHaveBeenCalledWith({
      name: 'get-budgets',
    });
    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it('delivers Worker messages to the connection layer', () => {
    const { bridge } = setup();
    const onmessage = vi.fn();
    bridge.onmessage = onmessage;
    bridge.fallbackToDirectWorker({ type: 'init' });

    lastWorker().onmessage?.({ data: { type: 'connect' } } as MessageEvent);

    expect(onmessage).toHaveBeenCalledWith(
      expect.objectContaining({ data: { type: 'connect' } }),
    );
  });

  it('swallows absurd-sql internal messages', () => {
    const { bridge } = setup();
    const onmessage = vi.fn();
    bridge.onmessage = onmessage;
    bridge.fallbackToDirectWorker({ type: 'init' });

    lastWorker().onmessage?.({
      data: { type: '__absurd:read' },
    } as MessageEvent);

    expect(onmessage).not.toHaveBeenCalled();
  });

  it('is idempotent', () => {
    const { bridge } = setup();

    expect(bridge.fallbackToDirectWorker({ type: 'init' })).toBe(true);
    expect(bridge.fallbackToDirectWorker({ type: 'init' })).toBe(false);
    expect(createdWorkers).toHaveLength(1);
  });

  it('leaves a live coordinator alone', () => {
    const { bridge, port } = setup();
    bridge.onmessage = vi.fn();
    // A late error must not tear down a session that is already working.
    port.emit({ type: '__role-change', role: 'UNASSIGNED', budgetId: null });

    expect(bridge.fallbackToDirectWorker({ type: 'init' })).toBe(false);
    expect(createdWorkers).toHaveLength(0);
  });
});
