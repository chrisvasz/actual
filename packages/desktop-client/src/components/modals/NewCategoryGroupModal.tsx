import { ModalHeader, ModalTitle } from '#components/common/Modal';
import type { Modal } from '#modals/modalsSlice';

import { SingleInputModal } from './SingleInputModal';

type NewCategoryGroupModalProps = Extract<
  Modal,
  { name: 'new-category-group' }
>['options'];

export function NewCategoryGroupModal({
  onValidate,
  onSubmit,
}: NewCategoryGroupModalProps) {
  return (
    <SingleInputModal
      name="new-category-group"
      Header={props => (
        <ModalHeader
          {...props}
          title={<ModalTitle title="New Category Group" shrinkOnOverflow />}
        />
      )}
      inputPlaceholder="Category group name"
      buttonText="Add"
      onValidate={onValidate}
      onSubmit={onSubmit}
    />
  );
}
