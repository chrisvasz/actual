import type { InProcessChannel } from '#platform/in-process-channel';
import type { Handlers } from '#types/handlers';
import type { ServerEvents } from '#types/server-events';

export declare function init(
  // The worker's global scope (API browser build) or the in-process
  // channel (browser app)
  channel: Window | number | InProcessChannel,
  handlers: Handlers,
): void;
export type Init = typeof init;

export declare function send<K extends keyof ServerEvents>(
  type: K,
  args?: ServerEvents[K],
): void;
export type Send = typeof send;

export declare function getNumClients(): number;
export type GetNumClients = typeof getNumClients;

export declare function resetEvents(): void;
export type ResetEvents = typeof resetEvents;
