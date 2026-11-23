import { importActual } from './actual';

export type ImportableBudgetType = 'actual';

export async function handleBudgetImport(
  _type: ImportableBudgetType,
  filepath: string,
  buffer: Buffer,
) {
  return importActual(filepath, buffer);
}
