import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Shot } from '../../types';
import { SHOT_SIZES } from '../../constants/presets';
import { keyFrameImage } from '../../utils/storyboardFrames';
import { ProjectImage } from '../common/ProjectImage';

interface StoryboardLightboxProps {
  /** Shots that have a board, in list order. */
  shots: Shot[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  aspectRatio: number;
}

/**
 * One storyboard frame as large as the window allows, with the shot's
 * essentials underneath. Arrow keys step through the boards; Escape closes.
 */
export const StoryboardLightbox: React.FC<StoryboardLightboxProps> = ({ shots, index, onIndexChange, onClose, aspectRatio }) => {
  const shot = shots[index];
  const count = shots.length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowRight' && count > 1) onIndexChange((index + 1) % count);
      else if (event.key === 'ArrowLeft' && count > 1) onIndexChange((index - 1 + count) % count);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onIndexChange, onClose]);

  if (!shot) return null;
  const size = SHOT_SIZES.find((entry) => entry.value === shot.shotSize);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Storyboard for shot ${shot.shotNumber}`}
      className="fixed inset-0 z-[120] bg-black/85 flex flex-col items-center justify-center p-4 sm:p-8"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="relative w-full max-w-6xl flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
        {count > 1 && (
          <button
            type="button"
            onClick={() => onIndexChange((index - 1 + count) % count)}
            aria-label="Previous board"
            className="shrink-0 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div
            className="mx-auto overflow-hidden rounded-lg bg-slate-950 shadow-2xl"
            style={{ aspectRatio: `${aspectRatio} / 1`, maxHeight: '78vh', maxWidth: `calc(78vh * ${aspectRatio})` }}
          >
            <ProjectImage
              imageRef={keyFrameImage(shot)}
              alt={`Storyboard ${shot.shotNumber}`}
              className="w-full h-full block"
              style={{
                objectFit: shot.storyboardFit === 'contain' ? 'contain' : 'cover',
                objectPosition: `${shot.storyboardPosition?.x ?? 50}% ${shot.storyboardPosition?.y ?? 50}%`,
              }}
            />
          </div>
          <div className="mt-3 text-center text-white">
            <span className="font-mono font-bold text-sky-300">{shot.shotNumber}</span>
            {size && <span className="ml-2 text-xs font-semibold text-white/70">{size.code}</span>}
            {shot.lensMm ? <span className="ml-2 text-xs text-white/70">{shot.lensMm}mm</span> : null}
            {shot.framingDescription && <p className="mt-1 text-sm text-white/85 max-w-3xl mx-auto">{shot.framingDescription}</p>}
            <p className="mt-1 text-[11px] text-white/50">{index + 1} / {count} · ← → to step · Esc to close</p>
          </div>
        </div>
        {count > 1 && (
          <button
            type="button"
            onClick={() => onIndexChange((index + 1) % count)}
            aria-label="Next board"
            className="shrink-0 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
};
