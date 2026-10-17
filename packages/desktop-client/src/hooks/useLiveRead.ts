import { useMemo, useSyncExternalStore } from 'react';

import type {
  LiveReadArgs,
  LiveReadData,
  LiveReadName,
} from '@actual-app/core/platform/client/live-reads';

import { getLiveRead } from '#queries/liveStore';
import type { LiveResult } from '#queries/liveStore';

/**
 * The result of the backend's named read `name`, kept current as the
 * tables it reads change. Read synchronously, so the first render has it;
 * `data` is undefined only if no read has succeeded.
 */
export function useLiveRead<Name extends LiveReadName>(
  name: Name,
  args?: LiveReadArgs<Name>,
): LiveResult<LiveReadData<Name>> {
  const argsKey = JSON.stringify(args ?? null);
  const handle = useMemo(
    () => getLiveRead(name, args),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- args by value
    [name, argsKey],
  );
  return useSyncExternalStore(handle.subscribe, handle.getSnapshot);
}
