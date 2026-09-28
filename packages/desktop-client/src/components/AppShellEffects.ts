import { useHotkeys } from 'react-hotkeys-hook';

import { sync } from '#app/appSlice';
import { useSharedArrayBufferWarning } from '#hooks/useSharedArrayBufferWarning';
import { useUserData } from '#hooks/useUserData';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

/**
 * App-wide behaviour that used to live in the titlebar: the sync and
 * keyboard-shortcut hotkeys, keeping the signed-in user's data fresh, and the
 * SharedArrayBuffer warning. Renders nothing.
 */
export function AppShellEffects() {
  const dispatch = useDispatch();

  useUserData();
  useSharedArrayBufferWarning();

  useHotkeys(
    'ctrl+s, cmd+s, meta+s',
    () => void dispatch(sync()),
    { enableOnFormTags: true, preventDefault: true, scopes: ['app'] },
    [dispatch],
  );

  useHotkeys(
    '?',
    () => dispatch(pushModal({ modal: { name: 'keyboard-shortcuts' } })),
    { useKey: true },
    [dispatch],
  );

  return null;
}
