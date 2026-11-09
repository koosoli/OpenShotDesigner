import type { OrbitView } from '../domain/plan/scenePreviewMesh';

/** Local session-only visualization options. Never persisted or synchronized. */
export interface SceneViewSettings extends OrbitView {
  lighting: boolean; bounce: boolean; ambient: number; lightTilt: number; includeInPrint: boolean;
}
export const DEFAULT_SCENE_VIEW: SceneViewSettings = Object.freeze({ angle: 35, tilt: 36, zoom: 1,
  panX: 0, panY: 0, lighting: false, bounce: false, ambient: .18, lightTilt: 20, includeInPrint: false });
const views = new Map<string, SceneViewSettings>();
const listeners = new Set<() => void>();
export const readSceneView = (key: string) => views.get(key) ?? DEFAULT_SCENE_VIEW;
export const subscribeSceneView = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function updateSceneView(key: string, patch: Partial<SceneViewSettings>) {
  views.set(key, { ...readSceneView(key), ...patch });
  listeners.forEach(listener => listener());
}
