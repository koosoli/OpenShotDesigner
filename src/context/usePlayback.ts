/**
 * Blocking-animation playback: the beat clock that drives actor and camera
 * movement on the plan. Extracted from `FloorPlanContext`.
 */
import { useEffect, useState } from 'react';

export const usePlayback = (totalBeats: number) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(1);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLooping, setIsLooping] = useState(true);

  // Advance in twentieths of a beat; one beat lasts two seconds at 1x.
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = 2000 / playbackSpeed;
    const interval = setInterval(() => {
      setCurrentBeat((prev) => {
        const next = prev + 0.05;
        if (next > totalBeats) {
          if (isLooping) return 1;
          setIsPlaying(false);
          return totalBeats;
        }
        return Math.round(next * 100) / 100;
      });
    }, intervalMs * 0.05);
    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, totalBeats, isLooping]);

  return { isPlaying, setIsPlaying, currentBeat, setCurrentBeat, playbackSpeed, setPlaybackSpeed, isLooping, setIsLooping };
};
