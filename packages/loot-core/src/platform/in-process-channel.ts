// The link between the browser app and its backend, which runs on the
// page's main thread. The client connection
// (`platform/client/connection/index.main-thread.ts`) and the backend's
// connection (`platform/server/connection/index.main-thread.ts`) each
// install a receiver on it and call the other side's directly.
//
// The two sides live in separate bundles (the page, and the backend
// bundle it imports), so this is a plain object rather than a module
// both import.
//
// Delivery keeps the semantics the old Worker boundary had: messages are
// copied with `structuredClone` when sent, so neither side ever holds a
// reference to the other's objects, and are received in a later
// microtask, in the order they were sent. A handler never runs nested
// inside UI code (or another handler's synchronous part), and events a
// handler pushes still arrive before its reply.

export type RequestMessage = {
  id: string;
  name: string;
  args: unknown;
  undoTag: unknown;
  catchErrors: boolean;
};

export type ServerMessage = { type: string; id?: string } & Record<
  string,
  unknown
>;

export type InProcessChannel = {
  /** Installed by the backend's connection; receives client requests. */
  server: ((msg: RequestMessage) => void) | null;
  /** Installed by the client connection; receives replies and events. */
  client: ((msg: ServerMessage) => void) | null;
};

export function createInProcessChannel(): InProcessChannel {
  return { server: null, client: null };
}

/**
 * Copy `msg` now and hand it to `receive` in a microtask. Throws a
 * `DataCloneError` synchronously, like `postMessage`, if it can't be
 * copied.
 */
export function deliver<M>(receive: (msg: M) => void, msg: M): void {
  const copy = structuredClone(msg);
  queueMicrotask(() => receive(copy));
}
