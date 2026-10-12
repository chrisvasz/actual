import { deliver } from '#platform/in-process-channel';
import type {
  InProcessChannel,
  RequestMessage,
} from '#platform/in-process-channel';

import type * as T from './index-types';
import { createSend, handleMessage } from './shared';

// Connection to the backend running on the page's main thread (the
// browser app). Requests are direct calls over an in-process channel
// (see `platform/in-process-channel.ts`).

let channel: InProcessChannel | null = null;
// Requests sent before `init` connects
let pending: RequestMessage[] | null = [];

export const init: T.Init = async function (socket) {
  const chn = (socket ??
    (await global.Actual.getServerSocket())) as InProcessChannel;
  if (!chn.server) {
    throw new Error('The backend has not been started');
  }
  chn.client = handleMessage;
  channel = chn;

  const server = chn.server;
  pending?.forEach(msg => queueMicrotask(() => server(msg)));
  pending = null;
};

export const send: T.Send = createSend(message => {
  if (channel?.server) {
    deliver(channel.server, message);
  } else {
    // Copied now, like a delivered message, so later changes by the
    // caller don't leak into it
    pending?.push(structuredClone(message));
  }
});

export const sendCatch: T.SendCatch = function (name, args) {
  return send(name, args, { catchErrors: true });
};

export {
  clearServer,
  initServer,
  listen,
  serverPush,
  unlisten,
} from './shared';
