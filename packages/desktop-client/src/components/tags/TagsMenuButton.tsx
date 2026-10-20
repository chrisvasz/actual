import { useRef, useState } from 'react';

import { Button } from '@actual-app/components/button';
import { SvgDotsHorizontalTriple } from '@actual-app/components/icons/v1';
import {
  SvgSearchAlternate,
  SvgViewHide,
  SvgViewShow,
} from '@actual-app/components/icons/v2';
import { Menu } from '@actual-app/components/menu';
import { Popover } from '@actual-app/components/popover';
import { View } from '@actual-app/components/view';

import { useSyncedPref } from '#hooks/useSyncedPref';
import { useDiscoverTags } from '#tags';

export function TagsMenuButton() {
  const [open, setOpen] = useState(false);
  const discoverTags = useDiscoverTags();
  const [showHidden, setShowHidden] = useSyncedPref('show-hidden-tags');
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <View>
      <Button
        ref={triggerRef}
        variant="bare"
        aria-label="Menu"
        onClick={() => setOpen(true)}
      >
        <SvgDotsHorizontalTriple width={17} height={17} />
      </Button>
      <Popover
        triggerRef={triggerRef}
        isOpen={open}
        isNonModal
        onOpenChange={setOpen}
      >
        <Menu
          items={[
            showHidden === 'true'
              ? {
                  name: 'set-dont-show-hidden',
                  text: "Don't show hidden tags",
                  icon: SvgViewHide,
                }
              : {
                  name: 'set-show-hidden',
                  text: 'Show hidden tags',
                  icon: SvgViewShow,
                },
            {
              name: 'discover-tags',
              text: 'Discover new tags',
              icon: SvgSearchAlternate,
            },
          ]}
          onMenuSelect={name => {
            switch (name) {
              case 'set-dont-show-hidden':
                setShowHidden('false');
                break;
              case 'set-show-hidden':
                setShowHidden('true');
                break;
              case 'discover-tags':
                void discoverTags();
                break;
              default:
                console.error('Unhandled menu option', name);
            }
          }}
        />
      </Popover>
    </View>
  );
}
