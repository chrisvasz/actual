import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { getLiveCell } from '#queries/liveStore';
import type {
  Binding,
  SheetFields,
  SheetNames,
  Spreadsheets,
} from '#spreadsheet';

import { useSheetName } from './useSheetName';

type SheetValueResult<
  SheetName extends SheetNames,
  FieldName extends SheetFields<SheetName>,
> = {
  name: string;
  value: Spreadsheets[SheetName][FieldName] | null;
};

/**
 * The value of the cell `binding` names, kept current. Read synchronously,
 * so the first render has it; the component re-renders only when this cell
 * changes. A binding with a query binds the cell to it while it's shown.
 * `onChange` is called after a render that shows a new value.
 */
export function useSheetValue<
  SheetName extends SheetNames,
  FieldName extends SheetFields<SheetName>,
>(
  binding: Binding<SheetName, FieldName>,
  onChange?: (result: SheetValueResult<SheetName, FieldName>) => void,
): SheetValueResult<SheetName, FieldName>['value'] {
  // A binding can name another sheet ("budget202609!budget-<id>"), which
  // `sheetName` already accounts for
  const { sheetName, bindingName, fullSheetName } = useSheetName(binding);
  const query = typeof binding === 'string' ? undefined : binding.query;
  // Callers build a new query object each render, so compare it by value
  const serializedQuery = query?.serializeAsString();

  const handle = useMemo(
    () => getLiveCell(sheetName, bindingName, query),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- query by value
    [sheetName, bindingName, serializedQuery],
  );
  const result = useSyncExternalStore(handle.subscribe, handle.getSnapshot);
  // TODO: Spreadsheets, SheetNames, SheetFields, etc must be moved to the loot-core package
  const value = (result.data ?? null) as
    | Spreadsheets[SheetName][FieldName]
    | null;

  const latestOnChange = useRef(onChange);
  const shownValue = useRef(value);
  useLayoutEffect(() => {
    latestOnChange.current = onChange;
  });
  useLayoutEffect(() => {
    if (value !== shownValue.current) {
      shownValue.current = value;
      latestOnChange.current?.({ name: fullSheetName, value });
    }
  }, [fullSheetName, value]);

  return value;
}
