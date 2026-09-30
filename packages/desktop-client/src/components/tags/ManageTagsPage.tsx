import React from 'react';
import { useTranslation } from 'react-i18next';

import { useSuspenseQuery } from '@tanstack/react-query';

import { Page } from '#components/Page';
import { tagQueries } from '#tags';

import { ManageTags } from './ManageTags';

export const ManageTagsPage = () => {
  const { t } = useTranslation();

  // Suspend until the tags are loaded, so navigating here keeps the previous
  // screen up instead of drawing "No Tags" and then the list.
  useSuspenseQuery(tagQueries.list());

  return (
    <Page header={t('Tags')}>
      <ManageTags />
    </Page>
  );
};
