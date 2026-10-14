/** Vitest reads the bundled workbook from disk. The app itself does not import Node. */
declare module "node:fs" {
  export function readFileSync(path: URL | string): Uint8Array;
}
