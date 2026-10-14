/// <reference types="vite/client" />

declare module "sql.js/dist/sql-wasm.js" {
  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }
  export interface Statement {
    run(params?: unknown[]): void;
    reset(): void;
    free(): void;
  }
  export interface Database {
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    export(): Uint8Array;
    close(): void;
  }
  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }
  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}

declare module "*.svg?raw" {
  const content: string;
  export default content;
}

declare module "*.sql?raw" {
  const content: string;
  export default content;
}

declare module "sql.js/dist/sql-wasm.wasm?url" {
  const url: string;
  export default url;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const url: string;
  export default url;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

interface Window {
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}
