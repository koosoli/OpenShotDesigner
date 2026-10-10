/**
 * Print a PDF the app generated, so what comes out of the printer is the same
 * document the PDF button downloads — one layout, not a screen print and a
 * separate file that can drift apart.
 *
 * The PDF loads into a hidden iframe and its own viewer prints it. Where a
 * browser refuses that (some mobile browsers), it opens in a new tab instead,
 * where the viewer's print button does the same job.
 */
export const printPdfBytes = (bytes: Uint8Array): void => {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.title = 'Print preview';
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  const cleanup = () => {
    frame.remove();
    URL.revokeObjectURL(url);
  };
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      // The dialog is modal in most browsers; give it a generous window anyway.
      setTimeout(cleanup, 60_000);
    } catch {
      cleanup();
      window.open(URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })), '_blank');
    }
  };
  frame.src = url;
  document.body.appendChild(frame);
};
