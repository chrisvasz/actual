import type {
  sqlite3_vfs,
  Sqlite3Result,
  Sqlite3Static,
} from '@sqlite.org/sqlite-wasm';

// A SQLite VFS that keeps files in memory and reports commits.
//
// SQLite syncs the main database file once per commit, after writing
// every page of it, so `xSync` is the commit point: a file opened with
// `onCommit` reports the 4 KB pages written since the last commit and
// the file size. (`journal_mode=MEMORY` keeps the rollback journal out of
// the VFS, and `synchronous` must not be OFF.)

export const VFS_NAME = 'memory';

const PAGE_SIZE: number = 4096;

type OnCommit = (pages: Map<number, Uint8Array>, size: number) => void;

type MemoryFile = {
  // Holds the file in its first `size` bytes
  bytes: Uint8Array;
  size: number;
  onCommit?: OnCommit;
  // Pages written since the last commit
  dirty: Set<number>;
  truncated: boolean;
};

const files = new Map<string, MemoryFile>();

// Adds a file for SQLite to open
export function addFile(name: string, bytes: Uint8Array, onCommit?: OnCommit) {
  files.set(name, {
    bytes,
    size: bytes.byteLength,
    onCommit,
    dirty: new Set(),
    truncated: false,
  });
}

// A copy of the file's contents
export function readFile(name: string): Uint8Array {
  const file = files.get(name);
  if (file == null) {
    throw new Error('No such file: ' + name);
  }
  return file.bytes.slice(0, file.size);
}

export function removeFile(name: string) {
  files.delete(name);
}

function commit(file: MemoryFile) {
  if (file.onCommit == null) {
    return;
  }
  const lastPage = Math.ceil(file.size / PAGE_SIZE) - 1;
  if (file.truncated && file.size % PAGE_SIZE !== 0) {
    // The last page got shorter
    file.dirty.add(lastPage);
  }
  const pages = new Map<number, Uint8Array>();
  for (const n of file.dirty) {
    if (n <= lastPage) {
      pages.set(
        n,
        file.bytes.slice(
          n * PAGE_SIZE,
          Math.min((n + 1) * PAGE_SIZE, file.size),
        ),
      );
    }
  }
  file.dirty = new Set();
  file.truncated = false;
  file.onCommit(pages, file.size);
}

export function install(sqlite3: Sqlite3Static) {
  const { capi, wasm } = sqlite3;
  // Files SQLite has open, by `sqlite3_file` pointer
  const handles = new Map<number, { name: string; deleteOnClose: boolean }>();
  let tempFiles = 0;

  function getFile(pFile: number): MemoryFile {
    const handle = handles.get(pFile);
    const file = handle && files.get(handle.name);
    if (file == null) {
      throw new Error('Unknown file handle');
    }
    return file;
  }

  const io = new capi.sqlite3_io_methods();
  Object.assign(io, { $iVersion: 1 });
  const vfs = new capi.sqlite3_vfs();
  // The struct members are pointers at runtime; the typings only list
  // them as the methods `installVfs` takes
  const defaultVfs = new capi.sqlite3_vfs(
    capi.sqlite3_vfs_find(null),
  ) as sqlite3_vfs & { $xRandomness: number; $xSleep: number };
  Object.assign(vfs, {
    $iVersion: 2,
    $szOsFile: capi.sqlite3_file.prototype.structInfo.sizeof,
    $mxPathname: 512,
    $zName: wasm.allocCString(VFS_NAME, false),
    $xRandomness: defaultVfs.$xRandomness,
    $xSleep: defaultVfs.$xSleep,
  });
  defaultVfs.dispose();

  sqlite3.vfs.installVfs({
    io: {
      struct: io,
      methods: {
        xClose(pFile) {
          const handle = handles.get(pFile);
          handles.delete(pFile);
          if (handle?.deleteOnClose) {
            files.delete(handle.name);
          }
          return 0;
        },
        xRead(pFile, pDest, n, offset) {
          const file = getFile(pFile);
          const start = Number(offset);
          const available = Math.max(0, Math.min(n, file.size - start));
          const heap = wasm.heap8u();
          heap.set(file.bytes.subarray(start, start + available), pDest);
          if (available < n) {
            heap.fill(0, pDest + available, pDest + n);
            return capi.SQLITE_IOERR_SHORT_READ;
          }
          return 0;
        },
        xWrite(pFile, pSrc, n, offset) {
          const file = getFile(pFile);
          const start = Number(offset);
          const end = start + n;
          if (end > file.bytes.byteLength) {
            const grown = new Uint8Array(
              Math.max(end, file.bytes.byteLength * 2),
            );
            grown.set(file.bytes.subarray(0, file.size));
            file.bytes = grown;
          }
          file.bytes.set(wasm.heap8u().subarray(pSrc, pSrc + n), start);
          file.size = Math.max(file.size, end);
          if (file.onCommit) {
            for (
              let p = Math.floor(start / PAGE_SIZE);
              p * PAGE_SIZE < end;
              p++
            ) {
              file.dirty.add(p);
            }
          }
          return 0;
        },
        xTruncate(pFile, size) {
          const file = getFile(pFile);
          file.size = Math.min(file.size, Number(size));
          file.truncated = true;
          // VACUUM truncates after its last sync
          if (file.dirty.size === 0) {
            commit(file);
          }
          return 0;
        },
        xSync(pFile) {
          commit(getFile(pFile));
          return 0;
        },
        xFileSize(pFile, pSize) {
          wasm.poke64(pSize, BigInt(getFile(pFile).size));
          return 0;
        },
        // One connection per file, so no locking is needed
        xLock: () => 0,
        xUnlock: () => 0,
        xCheckReservedLock(_pFile, pOut) {
          wasm.poke32(pOut, 0);
          return 0;
        },
        xFileControl: () => capi.SQLITE_NOTFOUND,
        xSectorSize: () => PAGE_SIZE as Sqlite3Result,
        xDeviceCharacteristics: () =>
          (capi.SQLITE_IOCAP_SAFE_APPEND |
            capi.SQLITE_IOCAP_SEQUENTIAL |
            capi.SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN |
            capi.SQLITE_IOCAP_POWERSAFE_OVERWRITE) as Sqlite3Result,
      },
    },
    vfs: {
      struct: vfs,
      methods: {
        xOpen(_pVfs, zName, pFile, flags, pOutFlags) {
          const name = zName ? wasm.cstrToJs(zName) : null;
          const fileName = name ?? `/temp-${tempFiles++}`;
          if (!files.has(fileName)) {
            if (!(flags & capi.SQLITE_OPEN_CREATE)) {
              return capi.SQLITE_CANTOPEN;
            }
            addFile(fileName, new Uint8Array(0));
          }
          handles.set(pFile, {
            name: fileName,
            deleteOnClose:
              name == null || !!(flags & capi.SQLITE_OPEN_DELETEONCLOSE),
          });
          const file = new capi.sqlite3_file(pFile);
          file.$pMethods = io.pointer;
          file.dispose();
          if (pOutFlags) {
            wasm.poke32(pOutFlags, flags);
          }
          return 0;
        },
        xDelete(_pVfs, zName) {
          files.delete(wasm.cstrToJs(zName) ?? '');
          return 0;
        },
        xAccess(_pVfs, zName, _flags, pOut) {
          wasm.poke32(pOut, files.has(wasm.cstrToJs(zName) ?? '') ? 1 : 0);
          return 0;
        },
        xFullPathname(_pVfs, zName, nOut, pOut) {
          return wasm.cstrncpy(pOut, zName, nOut) < nOut
            ? 0
            : capi.SQLITE_CANTOPEN;
        },
        xCurrentTime(_pVfs, pOut) {
          wasm.poke(pOut, 2440587.5 + Date.now() / 86400000, 'double');
          return 0;
        },
        xCurrentTimeInt64(_pVfs, pOut) {
          wasm.poke(pOut, 2440587.5 * 86400000 + Date.now(), 'i64');
          return 0;
        },
        xGetLastError: () => 0,
      },
    },
  });
}
