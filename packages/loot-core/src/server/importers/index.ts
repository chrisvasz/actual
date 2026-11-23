import { importActual } from './actual';

export type ImportableBudgetType = 'actual';

export async function handleBudgetImport(
  type: ImportableBudgetType,
  filepath: string,
  buffer: Buffer,
) {
  // API callers may still pass a type that used to be supported, like 'ynab5'.
  if (type !== 'actual') {
    return { error: 'unsupported-type' };
  }
  return importActual(filepath, buffer);
}
