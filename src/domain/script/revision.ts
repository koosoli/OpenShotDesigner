export interface ScriptRevisionLine {
  type?: string;
  text: string;
  sceneNumber?: string;
  isSceneHeading?: boolean;
}

export interface ScriptSceneChange {
  key: string;
  label: string;
  kind: 'added' | 'removed' | 'changed' | 'unchanged';
}

export interface ScriptRevisionComparison {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  scenes: ScriptSceneChange[];
}

interface SceneSlice {
  key: string;
  label: string;
  content: string;
}

const scenesOf = (lines: readonly ScriptRevisionLine[]): SceneSlice[] => {
  const scenes: SceneSlice[] = [];
  let current: ScriptRevisionLine[] = [];
  const flush = () => {
    if (!current.length) return;
    const heading = current[0];
    const label = heading.sceneNumber
      ? `Scene ${heading.sceneNumber} — ${heading.text}`
      : heading.text || 'Unnumbered scene';
    const base = heading.sceneNumber?.trim() || heading.text.trim().toLocaleUpperCase();
    const occurrence = scenes.filter((scene) => scene.key.startsWith(`${base}#`)).length + 1;
    scenes.push({
      key: `${base}#${occurrence}`,
      label,
      content: current.map((line) => `${line.type ?? 'action'}:${line.text.trim()}`).join('\n'),
    });
    current = [];
  };
  for (const line of lines) {
    if (line.type === 'scene' || line.isSceneHeading) flush();
    if (current.length || line.type === 'scene' || line.isSceneHeading) current.push(line);
  }
  flush();
  return scenes;
};

export const compareScriptRevisions = (
  before: readonly ScriptRevisionLine[],
  after: readonly ScriptRevisionLine[],
): ScriptRevisionComparison => {
  const previous = new Map(scenesOf(before).map((scene) => [scene.key, scene]));
  const next = new Map(scenesOf(after).map((scene) => [scene.key, scene]));
  const keys = [...new Set([...previous.keys(), ...next.keys()])];
  const scenes: ScriptSceneChange[] = keys.map((key) => {
    const oldScene = previous.get(key);
    const newScene = next.get(key);
    if (!oldScene) return { key, label: newScene!.label, kind: 'added' };
    if (!newScene) return { key, label: oldScene.label, kind: 'removed' };
    return {
      key,
      label: newScene.label,
      kind: oldScene.content === newScene.content ? 'unchanged' : 'changed',
    };
  });
  return {
    added: scenes.filter((scene) => scene.kind === 'added').length,
    removed: scenes.filter((scene) => scene.kind === 'removed').length,
    changed: scenes.filter((scene) => scene.kind === 'changed').length,
    unchanged: scenes.filter((scene) => scene.kind === 'unchanged').length,
    scenes,
  };
};
