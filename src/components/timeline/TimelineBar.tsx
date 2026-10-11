import React from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  Film,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  Minus,
} from 'lucide-react';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

export const TimelineBar: React.FC = () => {
  const { playback, togglePlayback, setCurrentBeat, setPlaybackSpeed, setIsLooping, addBeat, removeBeat, activeSetup, displaySettings, updateDisplaySettings } = useFloorPlan();
  const { theme } = useWorkspaceUI();

  const isLight = theme === 'light';
  const { isPlaying, currentBeat, totalBeats, speed, isLooping } = playback;

  // Find all dialogue cues in current setup mapped to beats
  const dialogueBeats: { beat: number; actorName: string; cue: string }[] = [];
  activeSetup.elements.forEach((el) => {
    if (el.type === 'actor' && 'path' in el && Array.isArray(el.path)) {
      (el.speechCues || []).forEach((cue) => {
        if (cue.text.trim()) {
          dialogueBeats.push({ beat: cue.beat, actorName: el.characterName || el.name, cue: cue.text });
        }
      });
      el.path.forEach((wp) => {
        if (wp.dialogueCue) {
          dialogueBeats.push({
            beat: wp.beat,
            actorName: el.name,
            cue: wp.dialogueCue,
          });
        }
      });
    }
  });

  return (
    <div
      id="timeline-bar"
      className={`h-16 border-t px-4 py-2 flex items-center justify-between gap-4 select-none z-10 transition-colors ${
        'bg-white dark:bg-slate-900/95 border-line text-ink'
      }`}
    >
      {/* 1. Playback Controls (Play/Pause, Step, Speed, Loop) */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setCurrentBeat(1)}
          title="Rewind to Start (Beat 1)"
          aria-label="Rewind to Start (Beat 1)"
          className={`p-2 rounded-lg transition-colors text-ink-muted hover:text-ink hover:bg-surface-hover`}
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          onClick={() => setCurrentBeat(Math.max(1, Math.floor(currentBeat - 1)))}
          title="Previous Beat"
          aria-label="Previous Beat"
          className={`p-2 rounded-lg transition-colors text-ink-muted hover:text-ink hover:bg-surface-hover`}
        >
          <SkipBack className="w-4 h-4" />
        </button>

        <button
          id="btn-play-pause"
          onClick={togglePlayback}
          title={isPlaying ? 'Pause Simulation (Space)' : 'Play Blocking Animation'}
          aria-label={isPlaying ? 'Pause Simulation (Space)' : 'Play Blocking Animation'}
          className="flex items-center justify-center w-10 h-10 bg-accent hover:bg-accent-hover text-white rounded-xl shadow-lg transition-transform active:scale-95"
        >
          {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
        </button>

        <button
          onClick={() => setCurrentBeat(Math.min(totalBeats, Math.floor(currentBeat + 1)))}
          title="Next Beat"
          aria-label="Next Beat"
          className={`p-2 rounded-lg transition-colors text-ink-muted hover:text-ink hover:bg-surface-hover`}
        >
          <SkipForward className="w-4 h-4" />
        </button>

        <div className={`w-[1px] h-6 mx-1 bg-surface-muted`} />

        {/* Speed Toggle */}
        <button
          onClick={() => {
            const nextSpeed = speed === 1 ? 2 : speed === 2 ? 0.5 : 1;
            setPlaybackSpeed(nextSpeed);
          }}
          className={`px-2 py-1 text-xs font-mono font-bold rounded border ${
            isLight ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200' : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
          }`}
          title="Playback Speed"
          aria-label={`Playback speed ${speed}x`}
        >
          {speed}x
        </button>

        {/* Loop Toggle */}
        <button
          onClick={() => setIsLooping(!isLooping)}
          className={`p-2 rounded-lg transition-colors ${
            isLooping
              ? isLight ? 'bg-sky-100 text-sky-600 border border-sky-300' : 'bg-sky-950 text-sky-400 border border-sky-800/60'
              : 'text-ink-subtle hover:text-ink-soft'
          }`}
          title="Loop Animation"
          aria-label="Loop Animation"
          aria-pressed={isLooping}
        >
          <Repeat className="w-4 h-4" />
        </button>

        <button
          onClick={() => updateDisplaySettings({ showSpeechBubbles: !displaySettings.showSpeechBubbles })}
          className={`p-2 rounded-lg border transition-colors ${
            displaySettings.showSpeechBubbles
              ? 'bg-emerald-100 dark:bg-emerald-950/50 text-ok border-emerald-300 dark:border-emerald-800'
              : 'text-ink-subtle border-line hover:text-ink-soft'
          }`}
          title={displaySettings.showSpeechBubbles ? 'Hide actor speech bubbles' : 'Show actor speech bubbles'}
          aria-label={displaySettings.showSpeechBubbles ? 'Hide actor speech bubbles' : 'Show actor speech bubbles'}
          aria-pressed={displaySettings.showSpeechBubbles}
        >
          <MessageCircle className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Central Timeline Scrubber with Beat Markers & Dialogue tooltips */}
      <div className="flex-1 max-w-2xl px-4 flex flex-col justify-center">
        <div className="flex items-center justify-between text-[11px] font-mono mb-1">
          <span className="flex items-center gap-1.5 font-bold text-accent-ink">
            <Film className="w-3.5 h-3.5" />
            BEAT {Math.floor(currentBeat)} / {totalBeats}
            <span className={`text-[10px] text-ink-subtle`}>
              ({Math.round(((currentBeat - 1) / (totalBeats - 1 || 1)) * 100)}%)
            </span>
          </span>

          <div className="flex items-center gap-2">
            {dialogueBeats
              .filter((d) => Math.abs(d.beat - Math.round(currentBeat)) <= 0.5)
              .map((d, i) => (
                <span key={i} className="text-ok italic text-[11px] truncate max-w-xs font-semibold">
                  {d.actorName}: {d.cue}
                </span>
              ))}
          </div>
        </div>

        {/* Scrubber Track */}
        <div className="relative flex items-center h-5">
          {/* Beat Markers along track */}
          <div className={`absolute inset-x-0 h-1.5 rounded-full overflow-hidden bg-surface-muted`}>
            <div
              className="h-full bg-sky-500 transition-all duration-75"
              style={{
                width: `${((currentBeat - 1) / (totalBeats - 1 || 1)) * 100}%`,
              }}
            />
          </div>

          {/* Interactive Range Input */}
          <input
            type="range"
            min={1}
            max={totalBeats}
            step={0.01}
            aria-label="Playback position"
            value={currentBeat}
            onChange={(e) => setCurrentBeat(Number(e.target.value))}
            className="w-full relative z-10 opacity-0 cursor-pointer h-5"
          />

          {/* Visual Beat Indicator Dots */}
          {Array.from({ length: totalBeats }).map((_, i) => {
            const beatNum = i + 1;
            const leftPercent = ((beatNum - 1) / (totalBeats - 1 || 1)) * 100;
            const isPassed = currentBeat >= beatNum;

            return (
              <button
                key={beatNum}
                onClick={() => setCurrentBeat(beatNum)}
                aria-label={`Go to beat ${beatNum}`}
                style={{ left: `${leftPercent}%` }}
                className={`absolute -translate-x-1/2 w-4 h-4 rounded-full border-2 flex items-center justify-center text-[10px] font-bold font-mono transition-transform hover:scale-125 z-20 ${
                  Math.abs(currentBeat - beatNum) < 0.2
                    ? 'bg-sky-500 text-white border-white scale-110 shadow-lg'
                    : isPassed
                    ? 'bg-sky-100 dark:bg-sky-950 text-accent-ink border-sky-500'
                    : 'bg-surface text-ink-subtle border-line-strong'
                }`}
              >
                {beatNum}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Add / Remove Beat Action buttons */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={removeBeat}
          disabled={totalBeats <= 2}
          title="Remove last beat"
          aria-label="Remove last beat"
          className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg disabled:opacity-30 text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors"
        >
          <Minus className="w-3.5 h-3.5" />
          <span>Beat</span>
        </button>

        <button
          onClick={addBeat}
          title="Add new scene beat / choreography step"
          aria-label="Add beat"
          className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg text-accent-ink hover:bg-accent-soft transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Beat</span>
        </button>
      </div>
    </div>
  );
};
