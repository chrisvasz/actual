import React from 'react';

import { Paragraph } from '@actual-app/components/paragraph';
import { View } from '@actual-app/components/view';

import { Modal, ModalHeader } from '#components/common/Modal';

export function GoCardlessLink() {
  window.close();
  return (
    <Modal name="gocardless-link" isDismissable={false}>
      <ModalHeader title="Account sync" />
      <View style={{ maxWidth: 500 }}>
        <Paragraph>Please wait...</Paragraph>
        <Paragraph>
          The window should close automatically. If nothing happened you can
          close this window or tab.
        </Paragraph>
      </View>
    </Modal>
  );
}
