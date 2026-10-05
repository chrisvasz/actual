export function isPreviewEnvironment() {
  return String(import.meta.env.REACT_APP_NETLIFY) === 'true';
}

export function isDevelopmentEnvironment() {
  return import.meta.env.DEV;
}

export function isNonProductionEnvironment() {
  return isPreviewEnvironment() || isDevelopmentEnvironment();
}
