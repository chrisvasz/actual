import type { accountGroupLiveReads } from '#server/account-groups/app';
import type { accountLiveReads } from '#server/accounts/app';
import type { payeeLiveReads } from '#server/payees/app';

/** The named reads backend apps register, by name (`registerLiveReads`). */
export type LiveReadHandlers = typeof accountLiveReads &
  typeof accountGroupLiveReads &
  typeof payeeLiveReads;

export type LiveReadName = keyof LiveReadHandlers;

export type LiveReadArgs<Name extends LiveReadName> = Parameters<
  LiveReadHandlers[Name]['read']
>[0];

export type LiveReadData<Name extends LiveReadName> = ReturnType<
  LiveReadHandlers[Name]['read']
>;
