import { send } from '@actual-app/core/platform/client/connection';
import type { TagEntity } from '@actual-app/core/types/models';

import { useReportErrors } from '#hooks/useReportErrors';

// Live reads pick up each change once it's applied, so these only send it

type CreateTagPayload = {
  tag: Omit<TagEntity, 'id'>;
};

export function useCreateTag() {
  return useReportErrors(
    'There was an error creating the tag. Please try again.',
    ({ tag }: CreateTagPayload) => send('tags-create', tag),
  );
}

type UpdateTagPayload = {
  tag: TagEntity;
};

export function useUpdateTag() {
  return useReportErrors(
    'There was an error updating the tag. Please try again.',
    ({ tag }: UpdateTagPayload) => send('tags-update', tag),
  );
}

type RenameTagPayload = {
  id: TagEntity['id'];
  tag: TagEntity['tag'];
};

export function useRenameTag() {
  return useReportErrors(
    'There was an error renaming the tag. Please try again.',
    ({ id, tag }: RenameTagPayload) => send('tags-rename', { id, tag }),
  );
}

type TagIdsPayload = {
  ids: Array<TagEntity['id']>;
};

export function useDeleteTags() {
  return useReportErrors(
    'There was an error deleting the tags. Please try again.',
    ({ ids }: TagIdsPayload) => send('tags-delete-all', ids),
  );
}

export function useHideTags() {
  return useReportErrors(
    'There was an error hiding the tags. Please try again.',
    ({ ids }: TagIdsPayload) => send('tags-hide-all', ids),
  );
}

export function useUnhideTags() {
  return useReportErrors(
    'There was an error hiding the tags. Please try again.',
    ({ ids }: TagIdsPayload) => send('tags-unhide-all', ids),
  );
}

export function useDiscoverTags() {
  return useReportErrors(
    'There was an error discovering the tags. Please try again.',
    () => send('tags-discover'),
  );
}
