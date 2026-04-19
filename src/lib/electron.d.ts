// Ambient declarations for the bridges exposed by `public/preload.js`.
//
// `window.api.http` proxies HTTP requests to the loopback FastAPI backend
// through the Electron main process. `window.electron` exposes the legacy
// IPC surface (window controls, file copy, screenshots, dir lookups).

// Mirrors the backend ErrorResponse envelope (pydantic ``ErrorResponse``)
// plus the IPC fallback (``code: "ipc_error"``). The renderer displays
// ``message`` and ``error_id``; ``code`` lets call sites branch on error
// classes without parsing free text.
export interface IpcError {
  code: string;
  message: string;
  detail: string | null;
  error_id: string;
  request_id?: string | null;
}

export type IpcResult<T> = { success: true; result: T } | { success: false; error: IpcError };

export interface ApiHttpBridge {
  request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body: unknown,
    requestId?: string
  ): Promise<IpcResult<T>>;
  runScenario<T>(body: unknown, requestId?: string): Promise<IpcResult<T>>;
  cancelScenario<T>(jobId: string, requestId?: string): Promise<IpcResult<T>>;
}

export interface ApiBridge {
  http: ApiHttpBridge;
  onBackendError: (callback: (envelope: IpcError) => void) => () => void;
}

export interface ElectronBridge {
  clearTempDir: () => Promise<unknown>;
  fetchTempDir: () => Promise<string>;
  fetchReportDir: () => Promise<string>;
  isDevelopmentEnv: () => Promise<boolean>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  remove: (channel: string, callback: (...args: unknown[]) => void) => void;
  send: (channel: string, data?: unknown) => void;
  saveScreenshot: (blob: string, filePath: string) => Promise<unknown>;
  onSaveScreenshotReply: (callback: (...args: unknown[]) => void) => void;
  copyFile: (sourcePath: string, destinationPath: string) => Promise<unknown>;
  onCopyFileReply: (callback: (...args: unknown[]) => void) => void;
  copyFolder: (sourceFolder: string, destinationFolder: string) => Promise<unknown>;
  onCopyFolderReply: (callback: (...args: unknown[]) => void) => void;
  openReport: (reportPath: string) => Promise<unknown>;
}

declare global {
  interface Window {
    api: ApiBridge;
    electron: ElectronBridge;
  }
}
