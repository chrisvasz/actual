import type { DependencyList } from 'react';
import type { HotkeyCallback, Options } from 'react-hotkeys-hook';
// oxlint-disable-next-line eslint/no-restricted-imports
import { useHotkeys as useHotkeysLib } from 'react-hotkeys-hook';

const MODIFIERS = new Set([
  'shift',
  'alt',
  'meta',
  'mod',
  'ctrl',
  'control',
  'cmd',
]);

/**
 * `useHotkeys` that matches the character a key types rather than its
 * physical position, so shortcuts follow the user's keyboard layout (Dvorak,
 * Colemak, AZERTY, …).
 *
 * react-hotkeys-hook matches `event.code` by default. Its `useKey` option
 * adds `event.key` matching but keeps the `event.code` fallback, so on Dvorak
 * the key typing "l" would fire both the "l" and the "p" hotkeys. For
 * single-character hotkeys we drop events whose typed character doesn't match.
 */
export function useHotkeys(
  keys: string,
  callback: HotkeyCallback,
  options?: Options,
  dependencies?: DependencyList,
) {
  const characters = getHotkeyCharacters(keys, options);

  return useHotkeysLib(
    keys,
    callback,
    {
      ...options,
      useKey: true,
      ignoreEventWhen: event =>
        (characters !== null && !characters.has(event.key.toLowerCase())) ||
        (options?.ignoreEventWhen?.(event) ?? false),
    },
    dependencies,
  );
}

/**
 * The characters a hotkey string is bound to, or `null` when any of its
 * combinations ends in a named key (arrows, Enter, …) whose `event.key` isn't
 * a single character.
 */
function getHotkeyCharacters(keys: string, options?: Options) {
  const characters = new Set<string>();
  for (const combination of keys.split(options?.delimiter ?? ',')) {
    const parts = combination
      .trim()
      .toLowerCase()
      .split(options?.splitKey ?? '+')
      .filter(part => !MODIFIERS.has(part));
    if (parts.length !== 1 || parts[0].length !== 1) {
      return null;
    }
    characters.add(parts[0]);
  }
  return characters;
}
