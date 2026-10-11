import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import {
  SvgCheveronDown,
  SvgCheveronRight,
  SvgCog,
  SvgReports,
  SvgStoreFront,
  SvgTag,
  SvgTuning,
  SvgWallet,
} from '@actual-app/components/icons/v1';
import { SvgCalendar3 } from '@actual-app/components/icons/v2';
import { View } from '@actual-app/components/view';

import { Item } from './Item';
import { SecondaryItem } from './SecondaryItem';

export function PrimaryButtons() {
  const [isOpen, setOpen] = useState(false);
  const onToggle = useCallback(() => setOpen(open => !open), []);
  const location = useLocation();

  const isActive = ['/payees', '/rules', '/settings', '/tools'].some(route =>
    location.pathname.startsWith(route),
  );

  useEffect(() => {
    if (isActive) {
      setOpen(true);
    }
  }, [isActive, location.pathname]);

  return (
    <View data-testid="sidebar-primary-buttons" style={{ flexShrink: 0 }}>
      <Item title="Budget" Icon={SvgWallet} to="/budget" />
      <Item title="Reports" Icon={SvgReports} to="/reports" />
      <Item title="Schedules" Icon={SvgCalendar3} to="/schedules" />
      <Item
        title="More"
        Icon={isOpen ? SvgCheveronDown : SvgCheveronRight}
        onClick={onToggle}
        style={{ marginBottom: isOpen ? 8 : 0 }}
        forceActive={!isOpen && isActive}
      />
      {isOpen && (
        <>
          <SecondaryItem
            title="Payees"
            Icon={SvgStoreFront}
            to="/payees"
            indent={15}
          />
          <SecondaryItem
            title="Rules"
            Icon={SvgTuning}
            to="/rules"
            indent={15}
          />
          <SecondaryItem title="Tags" Icon={SvgTag} to="/tags" indent={15} />
          <SecondaryItem
            title="Settings"
            Icon={SvgCog}
            to="/settings"
            indent={15}
          />
        </>
      )}
    </View>
  );
}
