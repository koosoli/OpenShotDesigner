import React, { useMemo, useState } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { createId } from '../../domain/ids';
import {
  CameraElement,
  FloorPlanElement,
  PlanGroup,
  PropElement,
  ShapeElement,
  WallElement,
} from '../../types';
import { Package, Plus, Search, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

/**
 * Reusable assemblies (plan §6.5): named, workspace-level element templates
 * that can be re-inserted onto any plan as a grouped set. Assembly definitions
 * are NOT project data — they live in localStorage under `assemblies_v1` and
 * store serialized element clones with template-local positions.
 */
export interface AssemblyDefinition {
  id: string;
  name: string;
  category: 'custom' | 'builtin';
  elements: FloorPlanElement[];
}

const ASSEMBLIES_STORAGE_KEY = 'assemblies_v1';

const loadCustomAssemblies = (): AssemblyDefinition[] => {
  try {
    const raw = localStorage.getItem(ASSEMBLIES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (a): a is AssemblyDefinition =>
        a && typeof a.id === 'string' && typeof a.name === 'string' && Array.isArray(a.elements)
    );
  } catch {
    return [];
  }
};

const persistCustomAssemblies = (assemblies: AssemblyDefinition[]) => {
  try {
    localStorage.setItem(ASSEMBLIES_STORAGE_KEY, JSON.stringify(assemblies));
  } catch {
    // Storage full or unavailable — assembly saving degrades silently.
  }
};

/**
 * Serialize a selection into an assembly definition. Element positions are
 * normalized so the template's bounding-box top-left sits at the origin.
 */
export const buildAssemblyFromElements = (name: string, elements: FloorPlanElement[]): AssemblyDefinition | null => {
  if (elements.length === 0) return null;
  const clones = JSON.parse(JSON.stringify(elements)) as FloorPlanElement[];
  let minX = Infinity;
  let minY = Infinity;
  clones.forEach((el) => {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
  });
  if (!Number.isFinite(minX)) return null;
  clones.forEach((el) => {
    el.x -= minX;
    el.y -= minY;
  });
  return {
    id: createId('assembly'),
    name: name.trim() || 'Untitled Assembly',
    category: 'custom',
    elements: clones,
  };
};

/** Prompt-and-save flow shared by the context menu and the Inspector button. */
export const promptSaveAssemblyFromIds = (ids: string[], allElements: FloorPlanElement[]): boolean => {
  if (ids.length === 0) return false;
  const elements = ids
    .map((id) => allElements.find((el) => el.id === id))
    .filter((el): el is FloorPlanElement => !!el);
  if (elements.length === 0) return false;
  const name = window.prompt('Name this assembly:', elements.length === 1 ? elements[0].name : `${elements.length} elements`);
  if (!name) return false;
  const definition = buildAssemblyFromElements(name, elements);
  if (!definition) return false;
  persistCustomAssemblies([...loadCustomAssemblies(), definition]);
  return true;
};

const propTemplate = (
  id: string,
  name: string,
  propType: PropElement['propType'],
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  rotation = 0
): PropElement => ({
  id,
  type: 'prop',
  name,
  propType,
  x,
  y,
  rotation,
  locked: false,
  width,
  height,
  color,
});

const shapeTemplate = (
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  label?: string
): ShapeElement => ({
  id,
  type: 'shape',
  name,
  shapeType: 'rectangle',
  x,
  y,
  rotation: 0,
  locked: false,
  width,
  height,
  color: '#1e293b',
  filled: true,
  opacity: 0.85,
  strokeColor: '#38bdf8',
  strokeWidth: 2,
  strokeOpacity: 1,
  dashStyle: 'solid',
  cornerRadius: 4,
  ...(label ? { label } : {}),
});

const cameraTemplate = (id: string, name: string, x: number, y: number, rotation: number): CameraElement => ({
  id,
  type: 'camera',
  name,
  x,
  y,
  rotation,
  locked: false,
  cameraLabel: 'A',
  color: '#0ea5e9',
  focalLength: 35,
  sensorFormat: 'Super35',
  fovAngle: 54.4,
  aspectRatio: '16:9',
  cameraHeight: 'Eye Level',
  rigType: 'Tripod',
  throwDistance: 280,
  path: [],
  associatedShotId: undefined,
});

/** Built-in examples so the concept is visible without any setup (plan §6.5). */
const BUILT_IN_ASSEMBLIES: AssemblyDefinition[] = [
  {
    id: 'assembly-builtin-interview',
    name: 'Interview Setup',
    category: 'builtin',
    elements: [
      propTemplate('tpl-interview-chair-a', 'Chair A', 'director_chair', -70, -30, 45, 45, '#1e293b'),
      propTemplate('tpl-interview-chair-b', 'Chair B', 'director_chair', 25, -30, 45, 45, '#1e293b'),
      cameraTemplate('tpl-interview-cam', 'Interview Cam', -22, 180, 180),
    ],
  },
  {
    id: 'assembly-builtin-video-village',
    name: 'Video Village',
    category: 'builtin',
    elements: [
      propTemplate('tpl-village-cart', 'Camera Cart', 'camera_cart', -55, 20, 110, 55, '#475569'),
      shapeTemplate('tpl-village-monitor-a', 'Monitor 1', -100, -50, 80, 60, 'MON 1'),
      shapeTemplate('tpl-village-monitor-b', 'Monitor 2', 5, -50, 80, 60, 'MON 2'),
    ],
  },
];

/** Bounding box helpers over the subset of geometry assemblies care about. */
const assemblyBounds = (elements: FloorPlanElement[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  elements.forEach((el) => {
    const x2 = (el as Partial<WallElement>).x2;
    const y2 = (el as Partial<WallElement>).y2;
    const width = (el as Partial<ShapeElement>).width;
    const height = (el as Partial<ShapeElement>).height;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, x2 ?? (width ? el.x + width : el.x));
    maxY = Math.max(maxY, y2 ?? (height ? el.y + height : el.y));
  });
  if (!Number.isFinite(minX)) return { cx: 0, cy: 0 };
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};

/**
 * Collapsible Inspector section: search and insert reusable assemblies.
 * Insertion deep-clones the template with fresh ids, places its center at the
 * visible canvas center, and inserts it as one plan group (plan §6.4).
 */
export const AssembliesPanel: React.FC = () => {
  const { activeSetup, updateSetupMeta, getCanvasCenterPosition, selectElements } = useFloorPlan();
  const { theme } = useWorkspaceUI();
  const isLight = theme === 'light';
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [customVersion, setCustomVersion] = useState(0);

  const assemblies = useMemo(() => {
    void customVersion;
    const custom = loadCustomAssemblies();
    return [...BUILT_IN_ASSEMBLIES, ...custom];
  }, [customVersion]);

  const filtered = assemblies.filter((a) =>
    a.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  const insertAssembly = (definition: AssemblyDefinition) => {
    const clones = JSON.parse(JSON.stringify(definition.elements)) as FloorPlanElement[];
    // Fresh globally-unique ids for every inserted element.
    clones.forEach((el) => {
      el.id = createId('el');
    });
    // Center the assembly on the currently visible canvas area.
    const bounds = assemblyBounds(definition.elements);
    const center = getCanvasCenterPosition();
    const dx = Math.round(center.x - bounds.cx);
    const dy = Math.round(center.y - bounds.cy);
    clones.forEach((el) => {
      el.x += dx;
      el.y += dy;
      const wall = el as Partial<WallElement>;
      if (typeof wall.x2 === 'number') wall.x2 += dx;
      if (typeof wall.y2 === 'number') wall.y2 += dy;
    });

    const childIds = clones.map((el) => el.id);
    const group: PlanGroup = {
      id: createId('group'),
      name: definition.name,
      childIds,
    };

    updateSetupMeta({
      elements: [...activeSetup.elements, ...clones],
      groups: [...(activeSetup.groups || []), group],
    });
    selectElements(childIds);
  };

  const deleteAssembly = (id: string) => {
    persistCustomAssemblies(loadCustomAssemblies().filter((a) => a.id !== id));
    setCustomVersion((v) => v + 1);
  };

  return (
    <div className={`rounded-xl border ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-900/50'}`}>
      <button
        onClick={() => setIsCollapsed((c) => !c)}
        aria-expanded={!isCollapsed}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl"
      >
        <span className="flex items-center gap-2 font-bold uppercase tracking-wider text-[10px]">
          <Package className="w-3.5 h-3.5 text-sky-500" />
          Reusable Assemblies
        </span>
        {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 opacity-60" /> : <ChevronDown className="w-3.5 h-3.5 opacity-60" />}
      </button>

      {!isCollapsed && (
        <div className="px-3 pb-3 space-y-2">
          <div className={`flex items-center gap-1.5 border rounded-lg px-2 py-1.5 ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'}`}>
            <Search className="w-3 h-3 opacity-50" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assemblies…"
              className="w-full bg-transparent text-[11px] focus:outline-none"
            />
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
            {filtered.length === 0 && (
              <p className="text-[10px] italic opacity-60 py-1">No assemblies match.</p>
            )}
            {filtered.map((assembly) => (
              <div
                key={assembly.id}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900'}`}
              >
                <button
                  onClick={() => insertAssembly(assembly)}
                  title={`Insert "${assembly.name}" grouped at canvas center`}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left text-[11px] hover:text-sky-500 transition-colors"
                >
                  <Plus className="w-3 h-3 flex-shrink-0 text-sky-500" />
                  <span className="truncate">{assembly.name}</span>
                  <span className="text-[9px] opacity-50 flex-shrink-0">
                    {assembly.category === 'builtin' ? 'example' : `${assembly.elements.length} els`}
                  </span>
                </button>
                {assembly.category === 'custom' && (
                  <button
                    onClick={() => deleteAssembly(assembly.id)}
                    title="Delete this saved assembly"
                    aria-label="Delete this saved assembly"
                    className="p-1 rounded hover:bg-red-500/10 text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <p className="text-[9px] italic opacity-50">
            Saved assemblies are workspace templates (not project data); inserting creates fresh grouped copies.
          </p>
        </div>
      )}
    </div>
  );
};
