import { sync } from '#app/appSlice';
import { useHotkeys } from '#hooks/useHotkeys';
import { useUserData } from '#hooks/useUserData';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';

/**
 * App-wide behaviour that used to live in the titlebar: the sync and
 * keyboard-shortcut hotkeys and keeping the signed-in user's data fresh.
 * Renders nothing.
 */
export function AppShellEffects() {
  const dispatch = useDispatch();

  useUserData();

  useHotkeys(
    'ctrl+s, cmd+s, meta+s',
    () => void dispatch(sync()),
    { enableOnFormTags: true, preventDefault: true, scopes: ['app'] },
    [dispatch],
  );

  useHotkeys(
    '?',
    () => dispatch(pushModal({ modal: { name: 'keyboard-shortcuts' } })),
    {},
    [dispatch],
  );

  return null;
}
