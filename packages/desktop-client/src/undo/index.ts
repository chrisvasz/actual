import { send } from '@actual-app/core/platform/client/connection';
import * as undoState from '@actual-app/core/platform/client/undo';
import type { UndoState } from '@actual-app/core/server/undo';

function throttle(callback: () => void, wait: number) {
  let waiting = false;
  return () => {
    if (!waiting) {
      callback();
      waiting = true;
      setTimeout(function () {
        waiting = false;
      }, wait);
    }
  };
}

const _undo = throttle(() => send('undo'), 100);
const _redo = throttle(() => send('redo'), 100);

let _undoEnabled = true;

export function enableUndo() {
  _undoEnabled = true;
}

export function disableUndo() {
  _undoEnabled = false;
}

export function undo() {
  if (_undoEnabled) {
    _undo();
  }
}

export function redo() {
  if (_undoEnabled) {
    _redo();
  }
}

// Clears the undo that the global undo handler left pending for the screen
// or modal it opened, once a consumer has acted on it, so it is applied at
// most once. The clear is deferred until after the current commit so that
// other components mounting for the same undo (e.g. the account screen and
// its selection) still see it. A newer pending undo is left alone.
export function clearPendingUndo(undoEvent: UndoState) {
  setTimeout(() => {
    if (undoState.getUndoState('undoEvent') === undoEvent) {
      undoState.setUndoState('undoEvent', null);
    }
  }, 0);
}
