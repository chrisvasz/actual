import React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { Page } from '#components/Page';
import { tagQueries } from '#tags';

import { ManageTags } from './ManageTags';

export const ManageTagsPage = () => {
  // Suspend until the tags are loaded, so navigating here keeps the previous
  // screen up instead of drawing "No Tags" and then the list.
  useSuspenseQuery(tagQueries.list());

  return (
    <Page header="Tags">
      <ManageTags />
    </Page>
  );
};
