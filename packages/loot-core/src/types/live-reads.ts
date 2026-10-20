import type { accountGroupLiveReads } from '#server/account-groups/app';
import type { accountLiveReads } from '#server/accounts/app';
import type { payeeLiveReads } from '#server/payees/app';
import type { ruleLiveReads } from '#server/rules/app';
import type { tagLiveReads } from '#server/tags/app';

/** The named reads backend apps register, by name (`registerLiveReads`). */
export type LiveReadHandlers = typeof accountLiveReads &
  typeof accountGroupLiveReads &
  typeof payeeLiveReads &
  typeof ruleLiveReads &
  typeof tagLiveReads;

export type LiveReadName = keyof LiveReadHandlers;

export type LiveReadArgs<Name extends LiveReadName> = Parameters<
  LiveReadHandlers[Name]['read']
>[0];

export type LiveReadData<Name extends LiveReadName> = ReturnType<
  LiveReadHandlers[Name]['read']
>;
