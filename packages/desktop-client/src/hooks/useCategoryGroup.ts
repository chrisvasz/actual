import { useCategories } from './useCategories';

export function useCategoryGroup(id?: string | null) {
  const { grouped } = useCategories();
  return id ? grouped.find(g => g.id === id) : undefined;
}
