import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { SvgNavigationMenu } from '@actual-app/components/icons/v2';
import { View } from '@actual-app/components/view';

import { useSidebar } from './sidebar/SidebarProvider';

/**
 * Marks the button so the page container in `FinancesApp` can reserve room
 * for it only while it is shown.
 */
export const FLOATING_SIDEBAR_BUTTON_ATTR = 'data-floating-sidebar-button';

/**
 * The sidebar toggle, floated over the top-left corner of the page while the
 * sidebar floats.
 */
export function FloatingSidebarButton() {
  const { t } = useTranslation();
  const sidebar = useSidebar();
  const { isNarrowWidth } = useResponsive();

  if (isNarrowWidth || !sidebar.floating) {
    return null;
  }

  return (
    <View
      {...{ [FLOATING_SIDEBAR_BUTTON_ATTR]: true }}
      style={{
        position: 'absolute',
        top: 4,
        left: 10,
        zIndex: 1000,
      }}
    >
      <Button
        aria-label={t('Sidebar menu')}
        variant="bare"
        onHoverStart={e => {
          if (e.pointerType === 'mouse') {
            sidebar.setHidden(false);
          }
        }}
        onPress={e => {
          if (e.pointerType !== 'mouse') {
            sidebar.setHidden(!sidebar.hidden);
          }
        }}
      >
        <SvgNavigationMenu
          className="menu"
          style={{ width: 15, height: 15, left: 0 }}
        />
      </Button>
    </View>
  );
}
