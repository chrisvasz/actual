import { useMemo } from 'react';
import type { ComponentProps } from 'react';

import { Button } from '@actual-app/components/button';
import { Menu } from '@actual-app/components/menu';
import { View } from '@actual-app/components/view';

import { Modal, ModalCloseButton, ModalHeader } from '#components/common/Modal';
import { useDashboardPages } from '#hooks/useDashboardPages';
import type { Modal as ModalType } from '#modals/modalsSlice';

type CopyWidgetToDashboardModalProps = Extract<
  ModalType,
  { name: 'copy-widget-to-dashboard' }
>['options'];

export function CopyWidgetToDashboardModal({
  onSelect,
}: CopyWidgetToDashboardModalProps) {
  const { data: dashboardPages = [] } = useDashboardPages();

  const items: ComponentProps<typeof Menu<string>>['items'] = useMemo(
    () => dashboardPages.map(d => ({ name: d.id, text: d.name })),
    [dashboardPages],
  );

  return (
    <Modal name="copy-widget-to-dashboard">
      {({ state }) => (
        <>
          <ModalHeader
            title="Copy to dashboard"
            rightContent={<ModalCloseButton onPress={() => state.close()} />}
          />

          <View style={{ lineHeight: 1.5 }}>
            {items.length ? (
              <Menu
                items={items}
                onMenuSelect={item => {
                  onSelect(item);
                  state.close();
                }}
              />
            ) : (
              <View>No other dashboard pages available.</View>
            )}

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                marginTop: 15,
              }}
            >
              <Button onPress={() => state.close()}>Cancel</Button>
            </View>
          </View>
        </>
      )}
    </Modal>
  );
}
