import React from 'react';

import { Button } from '@actual-app/components/button';
import { Paragraph } from '@actual-app/components/paragraph';

import { Link } from '#components/common/Link';
import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useSyncedPref } from '#hooks/useSyncedPref';

export function CategoryLearning() {
  const [learnCategories = 'true', setLearnCategories] =
    useSyncedPref('learn-categories');
  const isLearnCategoriesEnabled = String(learnCategories) === 'true';

  return (
    <Modal
      name="payee-category-learning"
      containerProps={{ style: { width: 600 } }}
    >
      {({ state }) => (
        <>
          <ModalHeader
            title="Category Learning"
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <Paragraph>
            <strong>Category Learning</strong> will automatically determine the
            best category for a transaction and create a rule that sets the
            category for the payee.{' '}
            <Link
              variant="external"
              to="https://actualbudget.org/docs/budgeting/rules/#automatic-rules"
              linkColor="purple"
            >
              Learn more
            </Link>
          </Paragraph>
          <Paragraph>
            Disabling Category Learning will not delete any existing rules but
            will prevent new rules from being created automatically on a global
            level.
          </Paragraph>
          <Button
            onPress={() =>
              setLearnCategories(String(!isLearnCategoriesEnabled))
            }
            variant={isLearnCategoriesEnabled ? 'normal' : 'primary'}
          >
            {isLearnCategoriesEnabled
              ? 'Disable category learning'
              : 'Enable category learning'}
          </Button>
        </>
      )}
    </Modal>
  );
}
