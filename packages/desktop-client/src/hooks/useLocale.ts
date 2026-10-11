import { getLocale } from '@actual-app/core/shared/locale';

/** The browser's language code (BCP 47), falling back to `en-US`. */
export function useLanguage() {
  return navigator.language || 'en-US';
}

export function useLocale() {
  return getLocale(useLanguage());
}
