import { BackgroundImage } from '../types';

/**
 * Reads an image file (screenshot, blueprint, scout photo) and produces a
 * BackgroundImage object with sensible default sizing for the floor plan canvas.
 */
export function loadBackgroundImageFile(file: File): Promise<BackgroundImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const aspect = img.width / img.height || 1;
        const defaultWidth = 800;
        const defaultHeight = defaultWidth / aspect;

        resolve({
          url,
          name: file.name,
          x: 50,
          y: 50,
          width: Math.round(defaultWidth),
          height: Math.round(defaultHeight),
          opacity: 0.5,
          locked: false,
          visible: true,
          naturalWidth: img.width,
          naturalHeight: img.height,
        });
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Reads a production logo and scales it down (keeping transparency) so it can
 * be stored with the project without eating the browser's storage quota.
 */
export function loadLogoFile(file: File, maxSize = 320): Promise<{ dataUrl: string; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the logo file.'));
    reader.onload = (event) => {
      const source = event.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a readable image.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: source, name: file.name });
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve({ dataUrl: canvas.toDataURL('image/png'), name: file.name });
      };
      img.src = source;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Reads a photo (camera roll, webcam grab, scan) and returns a data URL that is
 * safe to keep in the project: full-size phone photos are several megabytes and
 * blow the browser's storage quota, so the long edge is capped and the result
 * is re-encoded as JPEG.
 */
export function loadStoryboardImageFile(file: File, maxSize = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = (event) => {
      const source = event.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a readable image.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(source);
          return;
        }
        // White backing: JPEG has no alpha, and a transparent PNG would go black
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = source;
    };
    reader.readAsDataURL(file);
  });
}
