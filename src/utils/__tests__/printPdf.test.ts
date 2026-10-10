import { describe, expect, it, vi } from 'vitest';
import { printPdfBytes } from '../printPdf';

describe('printPdfBytes', () => {
  it('prints the PDF from a hidden frame rather than a pop-up', () => {
    const open = vi.spyOn(window, 'open');
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    printPdfBytes(new Uint8Array([37, 80, 68, 70]));
    const frame = document.querySelector('iframe[aria-hidden="true"]') as HTMLIFrameElement;
    expect(frame).toBeTruthy();
    expect(frame.src).toBe('blob:test');
    expect(open).not.toHaveBeenCalled();
    create.mockRestore();
    frame.remove();
  });
});
