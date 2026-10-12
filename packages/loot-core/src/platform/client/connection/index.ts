// @ts-strict-ignore
import type * as T from './index-types';
import { createSend, handleMessage } from './shared';

// Connection to a backend running in a Worker (the API's browser build).

let messageQueue = [];

let globalWorker = null;

// Note that this does not support retry. If the worker
// dies, it will permanently be disconnected. That should be OK since
// I don't think a worker should ever die due to a system error.
function connectWorker(worker, onOpen) {
  globalWorker = worker;

  worker.onmessage = event => {
    const msg = event.data;

    // The worker implementation implements its own concept of a
    // 'connect' event because the worker is immediately
    // available, but we don't know when the backend is actually
    // ready to handle messages.
    if (msg.type === 'connect') {
      // Null the queue so later sends post directly instead of queueing.
      messageQueue?.forEach(msg => worker.postMessage(msg));
      messageQueue = null;

      // signal to the backend that we're connected to it
      globalWorker.postMessage({
        name: 'client-connected-to-backend',
      });
      onOpen();
    } else {
      handleMessage(msg);
    }
  };
}

export const init: T.Init = async function (worker) {
  return new Promise(resolve => connectWorker(worker, resolve));
};

export const send: T.Send = createSend(message => {
  if (messageQueue) {
    messageQueue.push(message);
  } else {
    globalWorker.postMessage(message);
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
