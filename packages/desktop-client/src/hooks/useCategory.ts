import { useCategories } from './useCategories';

export function useCategory(id?: string | null) {
  const { list } = useCategories();
  return id ? list.find(c => c.id === id) : undefined;
}
