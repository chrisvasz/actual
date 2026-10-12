import { v4 as uuidv4 } from 'uuid';

import * as undo from '#platform/client/undo';
import type {
  RequestMessage,
  ServerMessage,
} from '#platform/in-process-channel';

import type * as T from './index-types';

// Shared by the Worker connection (index.ts) and the in-process one
// (index.main-thread.ts): pending replies, event listeners, and handling
// of the messages the backend sends.

type ReplyHandler = {
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
};
type Listener = (args: unknown) => unknown;

const replyHandlers = new Map<string, ReplyHandler>();
const listeners = new Map<string, Listener[]>();

export function handleMessage(msg: ServerMessage) {
  if (msg.type === 'error') {
    // An error happened while handling a message so cleanup the
    // current reply handler and reject the promise. The error will
    // be propagated to the caller through this promise rejection.
    const { id, error } = msg as ServerMessage & { id: string };
    const handler = replyHandlers.get(id);
    if (handler) {
      replyHandlers.delete(id);
      handler.reject(error);
    }
  } else if (msg.type === 'reply') {
    const { id, result, mutated, undoTag, error } = msg as ServerMessage & {
      id: string;
      undoTag: string;
    };

    const handler = replyHandlers.get(id);
    if (handler) {
      replyHandlers.delete(id);

      if (!mutated) {
        undo.gc(undoTag);
      }

      // api/* failures arrive as a reply carrying `error`.
      if (error) {
        handler.reject(error);
      } else {
        handler.resolve(result);
      }
    }
  } else if (msg.type === 'push') {
    const { name, args } = msg as ServerMessage & { name: string };

    const listens = listeners.get(name);
    if (listens) {
      for (let i = 0; i < listens.length; i++) {
        const stop = listens[i](args);
        if (stop === true) {
          break;
        }
      }
    }
  } else {
    // Ignore internal messages that start with __
    if (!msg.type.startsWith('__')) {
      throw new Error('Unknown message type: ' + JSON.stringify(msg));
    }
  }
}

/** Build a `send` that hands each request message to `post`. */
export function createSend(post: (message: RequestMessage) => void): T.Send {
  return function (...params: Parameters<T.Send>): ReturnType<T.Send> {
    const [name, args, { catchErrors = false } = {}] = params;
    return new Promise<unknown>((resolve, reject) => {
      const id = uuidv4();

      replyHandlers.set(id, { resolve, reject });
      post({
        id,
        name,
        args,
        undoTag: undo.snapshot(),
        catchErrors,
      });
    });
  } as T.Send;
}

export const listen: T.Listen = function (name, cb) {
  const listener = cb as Listener;
  listeners.set(name, [...(listeners.get(name) ?? []), listener]);

  return () => {
    listeners.set(
      name,
      (listeners.get(name) ?? []).filter(cb_ => cb_ !== listener),
    );
  };
};

export const unlisten: T.Unlisten = function (name) {
  listeners.set(name, []);
};

export const initServer: T.InitServer = async function () {
  // initServer is used in tests to mock the server
};
export const serverPush: T.ServerPush = async function () {
  // serverPush is used in tests to mock the server
};
export const clearServer: T.ClearServer = async function () {
  // clearServer is used in tests to mock the server
};
