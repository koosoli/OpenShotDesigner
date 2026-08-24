/**
 * Capture what a download hands to the browser.
 *
 * jsdom implements neither `URL.createObjectURL` nor a meaningful
 * `HTMLAnchorElement.click()`, so without this every test of an export path
 * either throws or silently asserts nothing. Both are worse than no test — the
 * second especially, since it looks like coverage.
 *
 * The interesting property is captured at CLICK time rather than afterwards:
 * whether the anchor was attached to the document. A detached anchor does not
 * download in Firefox, and three export paths in this codebase had one.
 */
import { expect, vi } from 'vitest';

export interface CapturedDownload {
  filename: string;
  blob: Blob;
  /** Whether the anchor was in the document at the moment it was clicked. */
  attachedWhenClicked: boolean;
}

export interface DownloadCapture {
  files: CapturedDownload[];
  objectUrlsCreated: string[];
  objectUrlsRevoked: string[];
  /** The single file produced, decoded and as raw bytes. Fails if not exactly one. */
  only: () => Promise<CapturedDownload & { text: string; bytes: Uint8Array }>;
  reset: () => void;
}

/** The three bytes a UTF-8 byte-order mark is written as. */
export const startsWithBom = (bytes: Uint8Array): boolean =>
  bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;

/**
 * Install the capture. Call in `beforeEach`; `vi.restoreAllMocks()` in
 * `afterEach` puts the originals back.
 */
export const captureDownloads = (): DownloadCapture => {
  const files: CapturedDownload[] = [];
  const objectUrlsCreated: string[] = [];
  const objectUrlsRevoked: string[] = [];
  const blobsByUrl = new Map<string, Blob>();
  let counter = 0;

  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:test/${(counter += 1)}`;
    objectUrlsCreated.push(url);
    blobsByUrl.set(url, blob);
    return url;
  });
  URL.revokeObjectURL = vi.fn((url: string) => {
    objectUrlsRevoked.push(url);
  });

  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    files.push({
      filename: this.download,
      blob: blobsByUrl.get(this.href) as Blob,
      attachedWhenClicked: this.isConnected,
    });
  };

  return {
    files,
    objectUrlsCreated,
    objectUrlsRevoked,
    only: async () => {
      expect(files).toHaveLength(1);
      const file = files[0];
      return {
        ...file,
        // `Blob.text()` runs the WHATWG UTF-8 decode, which STRIPS a leading
        // byte-order mark — so a BOM assertion made through it can never see
        // one and would pass against code that writes none. Hence `bytes`.
        text: await file.blob.text(),
        bytes: new Uint8Array(await file.blob.arrayBuffer()),
      };
    },
    reset: () => {
      files.length = 0;
      objectUrlsCreated.length = 0;
      objectUrlsRevoked.length = 0;
      blobsByUrl.clear();
    },
  };
};
