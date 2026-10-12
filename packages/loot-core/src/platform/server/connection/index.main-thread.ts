import { deliver } from '#platform/in-process-channel';
import type {
  InProcessChannel,
  ServerMessage,
} from '#platform/in-process-channel';

import { handleRequest } from './handle-request';
import type * as T from './index-types';
import { safePost } from './shared';

// The browser app runs the backend on the page's main thread; requests
// arrive as direct calls over an in-process channel (see
// `platform/in-process-channel.ts`).

let channel: InProcessChannel | null = null;

function post(msg: unknown) {
  if (channel?.client) {
    deliver(channel.client, msg as ServerMessage);
  }
}

export const init: T.Init = function (chn, handlers) {
  channel = chn as InProcessChannel;
  channel.server = msg =>
    handleRequest(handlers, msg, post, () => send('server-error'));
};

export const send: T.Send = function (name, args) {
  safePost(post, { type: 'push', name, args });
};

export const getNumClients: T.GetNumClients = function () {
  return 1;
};

export const resetEvents: T.ResetEvents = function () {
  // resetEvents is used in tests to mock the server
};
