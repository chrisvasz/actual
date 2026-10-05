export {};

type FileDialogOptions = {
  properties?: Array<'openFile' | 'openDirectory'>;
  filters?: {
    name: string;
    extensions: string[];
  }[];
};

type Actual = {
  IS_DEV: boolean;
  ACTUAL_VERSION: string;
  openURLInBrowser: (url: string) => void;
  saveFile: (
    contents: string | Buffer,
    filename: string,
    dialogTitle?: string,
  ) => Promise<void>;
  openFileDialog: (options: FileDialogOptions) => Promise<string[]>;
  relaunch: () => void;
  reload: (() => Promise<void>) | undefined;
  applyAppUpdate: () => Promise<void>;
  getServerSocket: () => Promise<Worker | null>;
  setTheme: (theme: string) => void;
  isUpdateReadyForDownload: () => boolean;
  waitForUpdateReadyForDownload: () => Promise<void>;
};

declare global {
  var Actual: Actual;

  // oxlint-disable-next-line typescript/consistent-type-definitions -- global Window augmentation requires interface
  interface Window {
    Actual: Actual;
  }

  var IS_TESTING: boolean;

  var currentMonth: string | null;

  var emptyDatabase: (avoidUpdate?: boolean) => () => Promise<void>;
}
