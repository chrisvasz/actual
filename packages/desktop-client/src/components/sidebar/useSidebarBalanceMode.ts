import { useLocalPref } from '#hooks/useLocalPref';
import type { SidebarBalanceMode } from '#spreadsheet/bindings';

// Whether the sidebar balances sum only cleared transactions (the default) or
// all of them. Shared by every balance in the sidebar so they toggle together.
export function useSidebarBalanceMode(): [
  SidebarBalanceMode,
  (mode: SidebarBalanceMode) => void,
] {
  const [mode = 'cleared', setMode] = useLocalPref('sidebar.balanceMode');
  return [mode, setMode];
}
