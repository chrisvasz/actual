import React from 'react';

import { Page } from '#components/Page';

import { ManageTags } from './ManageTags';

export const ManageTagsPage = () => {
  return (
    <Page header="Tags">
      <ManageTags />
    </Page>
  );
};
