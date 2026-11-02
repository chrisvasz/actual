import { useMemo, useSyncExternalStore } from 'react';

import type {
  LiveReadArgs,
  LiveReadData,
  LiveReadName,
} from '@actual-app/core/platform/client/live-reads';

import { getLiveRead } from '#queries/liveStore';
import type { LiveResult, RowOf } from '#queries/liveStore';

/**
 * The result of the backend's named read `name`, kept current as the
 * tables it reads change. Read synchronously, so the first render has it;
 * `data` is undefined only if no read has succeeded.
 */
export function useLiveRead<Name extends LiveReadName>(
  name: Name,
  args?: LiveReadArgs<Name>,
): LiveResult<LiveReadData<Name>> {
  const handle = useLiveReadHandle(name, args);
  return useSyncExternalStore(handle.subscribe, handle.getSnapshot);
}

/**
 * The rows of the named read `name` by id, kept current like `useLiveRead`.
 * The live store keeps this index anyway, so reading it costs nothing.
 */
export function useLiveReadRowsById<Name extends LiveReadName>(
  name: Name,
  args?: LiveReadArgs<Name>,
): ReadonlyMap<string, RowOf<LiveReadData<Name>>> {
  const handle = useLiveReadHandle(name, args);
  return useSyncExternalStore(handle.subscribe, handle.getRowsById) ?? NO_ROWS;
}

// A handle that stays the same while `name` and `args` (by value) do
function useLiveReadHandle<Name extends LiveReadName>(
  name: Name,
  args?: LiveReadArgs<Name>,
) {
  const argsKey = JSON.stringify(args ?? null);
  return useMemo(
    () => getLiveRead(name, args),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- args by value
    [name, argsKey],
  );
}

const NO_ROWS: ReadonlyMap<string, never> = new Map<string, never>();
