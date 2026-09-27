import { useCallback } from 'react';
import type { RefObject } from 'react';

import type { Falsy } from '@actual-app/core/types/util';

import {
  addItems,
  setContextMenuPosition,
} from '#contextmenu/contextMenuSlice';
import type { ContextMenuItem } from '#contextmenu/types';
import { useRefEventListener } from '#hooks/useRefEventListener';
import { useDispatch } from '#redux';

type UseContextMenuProps = {
  triggerRef: RefObject<HTMLElement | null>;
  enabled?: boolean;
  // Pass a function to build the items when the menu opens rather than on
  // every render.
  items: Falsy<ContextMenuItem>[] | (() => Falsy<ContextMenuItem>[]);
};

export function useContextMenu({
  triggerRef,
  enabled = true,
  items,
}: UseContextMenuProps) {
  const dispatch = useDispatch();

  useRefEventListener(triggerRef, 'contextmenu', (e: MouseEvent) => {
    if (enabled) {
      e.preventDefault();
      const processedItems = (
        typeof items === 'function' ? items() : items
      ).filter(
        item => item && (typeof item === 'symbol' || !item.hidden),
      ) as ContextMenuItem[];
      dispatch(addItems(processedItems));
      dispatch(setContextMenuPosition({ x: e.clientX, y: e.clientY }));
    }
  });

  const handleContextMenu = useCallback(() => {
    if (!triggerRef.current || !enabled) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // prefer MouseEvent bubbling over dispatching events to
    // allow nesting context menu actions
    triggerRef.current.dispatchEvent(
      new MouseEvent('contextmenu', {
        clientX: rect.x,
        clientY: rect.y + rect.height,
        bubbles: true,
      }),
    );
  }, [triggerRef, enabled]);

  return { handleContextMenu };
}
