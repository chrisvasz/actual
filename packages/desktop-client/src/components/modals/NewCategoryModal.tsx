import { ModalHeader, ModalTitle } from '#components/common/Modal';
import type { Modal } from '#modals/modalsSlice';

import { SingleInputModal } from './SingleInputModal';

type NewCategoryModalProps = Extract<
  Modal,
  { name: 'new-category' }
>['options'];

export function NewCategoryModal({
  onValidate,
  onSubmit,
}: NewCategoryModalProps) {
  return (
    <SingleInputModal
      name="new-category"
      Header={props => (
        <ModalHeader
          {...props}
          title={<ModalTitle title="New Category" shrinkOnOverflow />}
        />
      )}
      inputPlaceholder="Category name"
      buttonText="Add"
      onValidate={onValidate}
      onSubmit={onSubmit}
    />
  );
}
