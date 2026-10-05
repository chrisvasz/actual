import { useRef, useState } from 'react';

/**
 * Holds a just-submitted value to show in place of the stored one while it
 * saves, so the old value doesn't flash back when an input closes before the
 * new data arrives. Render `valueOr(stored)`.
 *
 * Call `show(next)` in the same handler that closes the input; React then
 * renders the new value in that same commit. It returns a function that
 * drops the pending value again, which only takes effect if no newer value
 * has been shown since. `showUntil(next, save)` drops it once `save`
 * settles, success or failure, so `save` should resolve only after the new
 * data has reached the stored value.
 *
 * It takes no arguments so it can be declared before the hook that provides
 * the stored value (e.g. when that hook's change callback calls `reset`).
 */
export function usePendingValue<T>() {
  const [pending, setPending] = useState<{ value: T } | null>(null);
  const latest = useRef<object | null>(null);

  function show(next: T) {
    const token = {};
    latest.current = token;
    setPending({ value: next });
    return () => {
      if (latest.current === token) {
        latest.current = null;
        setPending(null);
      }
    };
  }

  function showUntil(next: T, save: Promise<unknown>) {
    const done = show(next);
    save.then(done, done);
  }

  function reset() {
    latest.current = null;
    setPending(null);
  }

  return {
    valueOr: (stored: T) => (pending ? pending.value : stored),
    show,
    showUntil,
    reset,
  };
}
