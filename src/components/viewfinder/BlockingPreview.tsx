import { Eye, User } from 'lucide-react';
import type { ActorElement, PropElement } from '../../types';

type Framed<T, K extends string> = Record<K, T> & { normalizedX: number; distance: number };

interface Props {
  visibleActors: Framed<ActorElement, 'actor'>[];
  visibleProps: Framed<PropElement, 'prop'>[];
  simulatedMagnification: number;
}

export function BlockingPreview({ visibleActors, visibleProps, simulatedMagnification }: Props) {
  return (
    <>
      {/* Cinematic Studio Horizon & Perspective Grid */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-end pointer-events-none">
        {/* Ceiling grid lines */}
        <div className="w-full h-1/3 bg-slate-950/60 border-b border-slate-800/40" />
        {/* Studio Stage floor */}
        <div className="w-full h-2/5 bg-gradient-to-t from-slate-900 to-slate-950 border-t border-slate-800/80">
          <div className="w-full h-full opacity-20 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
        </div>
      </div>

      {/* Simulated 3D Props in FOV (hidden behind live video / artwork) */}
      {visibleProps.map(({ prop, normalizedX, distance }) => {
        const scale = Math.max(0.3, Math.min(3.2, (160 / distance) * simulatedMagnification));
        const leftPercent = 50 + normalizedX * 42;
        return (
          <div
            key={prop.id}
            className="absolute bottom-[22%] -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-300 z-10 opacity-75"
            style={{
              left: `${leftPercent}%`,
              transform: `translateX(-50%) scale(${scale})`,
              transformOrigin: 'bottom center',
            }}
          >
            <div className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700 shadow mb-1">
              {prop.name || prop.propType} ({(distance / 50).toFixed(1)}m)
            </div>
            <div className="w-24 h-16 rounded-lg bg-slate-700/80 border-2 border-slate-600 shadow-xl flex items-center justify-center text-xs font-semibold text-slate-300">
              {prop.name || prop.propType}
            </div>
          </div>
        );
      })}

      {/* Simulated 3D Actor Silhouettes in FOV */}
      {visibleActors.length === 0 && visibleProps.length === 0 ? (
        <div className="relative z-10 text-center text-slate-400 text-xs px-6 py-4 bg-slate-950/70 border border-slate-800 rounded-xl">
          <Eye className="w-6 h-6 mx-auto text-sky-500 mb-1.5" />
          <p className="font-mono font-bold text-slate-200">NO SUBJECTS IN FIELD OF VIEW</p>
          <p className="text-[11px] mt-1 text-slate-400">
            Rotate the camera or adjust actors on the floor plan to place them inside this camera's coverage cone.
          </p>
        </div>
      ) : (
        visibleActors.map(({ actor, normalizedX, distance }) => {
          // Closer distance = larger silhouette scale
          const scale = Math.max(0.35, Math.min(4, (190 / distance) * simulatedMagnification));
          const leftPercent = 50 + normalizedX * 44;
          const color = actor.color || '#3b82f6';
          const meters = (distance / 50).toFixed(1);

          return (
            <div
              key={actor.id}
              className="absolute bottom-[20%] -translate-x-1/2 flex flex-col items-center pointer-events-none transition-all duration-300 z-15"
              style={{
                left: `${leftPercent}%`,
                transform: `translateX(-50%) scale(${scale})`,
                transformOrigin: 'bottom center',
              }}
            >
              {/* Character Tag Pill */}
              <div
                className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-xl mb-1 flex items-center gap-1 border border-white/30"
                style={{ backgroundColor: color }}
              >
                <User className="w-2.5 h-2.5" />
                <span>{actor.name} ({actor.characterLetter}) • {meters}m</span>
              </div>

              {/* Actor Silhouette Figure */}
              <div className="relative flex flex-col items-center">
                {/* Head with character avatar */}
                <div
                  className="w-14 h-14 rounded-full border-2 border-white shadow-xl flex items-center justify-center font-bold text-white text-base shadow-black/60"
                  style={{ backgroundColor: color }}
                >
                  {actor.characterLetter}
                </div>

                {/* Torso */}
                <div
                  className="w-24 h-32 rounded-t-3xl mt-1 border-t-2 border-white/50 shadow-2xl"
                  style={{
                    backgroundColor: color,
                    opacity: 0.9,
                  }}
                />
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
