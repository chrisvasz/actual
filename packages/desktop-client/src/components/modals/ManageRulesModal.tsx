// @ts-strict-ignore
import React, { useState } from 'react';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { ManageRules } from '#components/ManageRules';
import type { Modal as ModalType } from '#modals/modalsSlice';

type ManageRulesModalProps = Extract<
  ModalType,
  { name: 'manage-rules' }
>['options'];

export function ManageRulesModal({ payeeId }: ManageRulesModalProps) {
  const [loading, setLoading] = useState(true);

  return (
    <Modal name="manage-rules" isLoading={loading}>
      {({ state }) => (
        <>
          <ModalHeader
            title="Rules"
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />
          <ManageRules isModal payeeId={payeeId} setLoading={setLoading} />
        </>
      )}
    </Modal>
  );
}
