// @ts-strict-ignore
import { logger } from '#platform/server/log';

import { handleRequest } from './handle-request';
import type * as T from './index-types';
import { safePost } from './shared';

function getGlobalObject() {
  const obj =
    typeof window !== 'undefined'
      ? window
      : typeof self !== 'undefined'
        ? self
        : null;
  if (!obj) {
    throw new Error('Cannot get global object');
  }
  return obj as unknown as typeof globalThis & {
    __globalServerChannel: Window | null;
  };
}

getGlobalObject().__globalServerChannel = null;

export const init: T.Init = function (serverChn, handlers) {
  const serverChannel = serverChn as Window;
  getGlobalObject().__globalServerChannel = serverChannel;

  serverChannel.addEventListener(
    'message',
    e => {
      const data = e.data;
      const msg = typeof data === 'string' ? JSON.parse(data) : data;

      if (msg.type && (msg.type === 'init' || msg.type.startsWith('__'))) {
        return;
      }

      if (msg.name === 'client-connected-to-backend') {
        // the client is indicating that it is connected to this backend. Stop attempting to connect
        logger.info('Backend: Client connected');
        clearInterval(reconnectToClientInterval);
        return;
      }

      handleRequest(
        handlers,
        msg,
        message => serverChannel.postMessage(message),
        () => send('server-error'),
      );
    },
    false,
  );

  const RECONNECT_INTERVAL_MS = 200;
  const MAX_RECONNECT_ATTEMPTS = 500;
  let reconnectAttempts = 0;

  // Announce immediately instead of waiting for the first 200ms interval
  // tick; keep the interval as the retry path.
  function tryConnect() {
    logger.info('Backend: Trying to connect to client');
    serverChannel.postMessage({ type: 'connect' });
    reconnectAttempts++;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      // Failed to connect to client - signal server error
      send('server-error');
      clearInterval(reconnectToClientInterval);
    }
  }
  const reconnectToClientInterval = setInterval(
    tryConnect,
    RECONNECT_INTERVAL_MS,
  );
  tryConnect();
};

export const send: T.Send = function (name, args) {
  const { __globalServerChannel } = getGlobalObject();
  if (__globalServerChannel) {
    safePost(msg => __globalServerChannel.postMessage(msg), {
      type: 'push',
      name,
      args,
    });
  }
};

export const getNumClients = function () {
  return 1;
};

export const resetEvents: T.ResetEvents = function () {
  // resetEvents is used in tests to mock the server
};
