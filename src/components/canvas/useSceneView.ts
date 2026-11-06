import { useSyncExternalStore } from 'react';
import { readSceneView, subscribeSceneView } from '../../utils/sceneViewSession';
export function useSceneView(key: string) {
  return useSyncExternalStore(subscribeSceneView, () => readSceneView(key));
}
