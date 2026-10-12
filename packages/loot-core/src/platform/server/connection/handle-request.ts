import { captureException } from '#platform/exceptions';
import type { RequestMessage } from '#platform/in-process-channel';
import { logger } from '#platform/server/log';
import { APIError } from '#server/errors';
import { isMutating, runHandler } from '#server/mutators';
import type { Handlers } from '#types/handlers';

import { postErrorReply } from './errors';
import { safePost } from './shared';

/**
 * Run the handler a client request names and post its reply (or error)
 * back with `post`. Calls `onServerError` when an uncaught handler error
 * should be surfaced to the user.
 */
export function handleRequest(
  handlers: Handlers,
  msg: RequestMessage,
  post: (message: unknown) => void,
  onServerError: () => void,
): void {
  const { id, name, args, undoTag, catchErrors } = msg;
  const handler = (handlers as Record<string, Handlers[keyof Handlers]>)[name];

  if (handler) {
    void runHandler(handler, args as never, { undoTag, name }).then(
      result => {
        safePost(post, {
          type: 'reply',
          id,
          result: catchErrors ? { data: result, error: null } : result,
          mutated: isMutating(handler),
          undoTag,
        });
      },
      nativeError => {
        const error = postErrorReply(
          post,
          { id, name, catchErrors },
          nativeError,
        );

        // Only report internal errors
        if (error.type === 'ServerError') {
          captureException(nativeError);
        }

        if (!catchErrors) {
          // Notify the frontend that something bad happend
          onServerError();
        }
      },
    );
  } else {
    logger.error('Unknown server method: ' + name);
    captureException(new Error('Unknown server method: ' + name));
    const unknownMethodError = APIError('Unknown server method: ' + name);

    if (catchErrors) {
      safePost(post, {
        type: 'reply',
        id,
        result: { error: unknownMethodError, data: null },
      });
    } else {
      safePost(post, {
        type: 'error',
        id,
        error: unknownMethodError,
      });
    }
  }
}
