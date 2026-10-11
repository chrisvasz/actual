import { send } from '@actual-app/core/platform/client/connection';

type FileDialogOptions = {
  filters?: {
    name: string;
    extensions: string[];
  }[];
};

const FILE_ACCEPT_OVERRIDES: Record<string, string[]> = {
  // Safari on iOS requires explicit MIME/UTType values for some extensions to allow selection.
  qfx: [
    'application/vnd.intu.qfx',
    'application/x-qfx',
    'application/qfx',
    'application/ofx',
    'application/x-ofx',
    'application/octet-stream',
    'com.intuit.qfx',
  ],
};

/**
 * Let the user pick a file, upload it to the backend, and resolve with the
 * backend path it was stored at.
 */
export function openFileDialog({
  filters = [],
}: FileDialogOptions): Promise<string[]> {
  return new Promise(resolve => {
    let createdElement = false;
    // Attempt to reuse an already-created file input.
    let input = document.body.querySelector<HTMLInputElement>(
      'input[id="open-file-dialog-input"]',
    );
    if (!input) {
      createdElement = true;
      input = document.createElement('input');
    }

    input.type = 'file';
    input.id = 'open-file-dialog-input';
    input.value = '';

    const filter = filters.find(filter => filter.extensions);
    if (filter) {
      input.accept = filter.extensions
        .flatMap(ext => {
          const normalizedExt = ext.startsWith('.')
            ? ext.toLowerCase()
            : `.${ext.toLowerCase()}`;
          const overrides = FILE_ACCEPT_OVERRIDES[ext.toLowerCase()] ?? [];
          return [normalizedExt, ...overrides];
        })
        .join(',');
    }

    input.style.position = 'absolute';
    input.style.top = '0px';
    input.style.left = '0px';
    input.style.display = 'none';

    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        return;
      }
      const filename = file.name.replace(/.*(\.[^.]*)/, 'file$1');

      const reader = new FileReader();
      reader.readAsArrayBuffer(file);
      reader.onload = function () {
        void send('upload-file-web', {
          filename,
          contents: reader.result as ArrayBuffer,
        }).then(() => resolve([`/uploads/${filename}`]));
      };
      reader.onerror = function () {
        alert('Error reading file');
      };
    };

    // In Safari the file input has to be in the DOM for change events to
    // reliably fire.
    if (createdElement) {
      document.body.appendChild(input);
    }

    input.click();
  });
}

export function saveFile(contents: BlobPart, filename: string) {
  const temp = document.createElement('a');
  temp.style.display = 'none';
  temp.download = filename;
  temp.rel = 'noopener';

  const blob = new Blob([contents]);
  temp.href = URL.createObjectURL(blob);
  temp.dispatchEvent(new MouseEvent('click'));
}
