// Runs before the app's bundle has loaded; see
// `@actual-app/core/platform/client/browser-preload/boot`
import { startBoot } from '@actual-app/core/platform/client/browser-preload/boot';

if (window.isSecureContext) {
  void startBoot();
}
