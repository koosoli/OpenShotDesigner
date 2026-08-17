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
