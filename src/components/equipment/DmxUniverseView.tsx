import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, GripVertical, X, Zap } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';
import { LightElement } from '../../types';
import { DMX_CHANNELS_PER_UNIVERSE, FixturePatch, FixturePlacementPreview, collectFixturePatches, findConflicts, findFreeRange, previewFixturePlacement, universeOccupancy } from '../../utils/dmxPatch';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

const CHANNELS_PER_ROW = 32;
const CHANNEL_ROWS = DMX_CHANNELS_PER_UNIVERSE / CHANNELS_PER_ROW;
const CELL_WIDTH = 25;
const ROW_HEIGHT = 33;
const GRID_WIDTH = CHANNELS_PER_ROW * CELL_WIDTH;
const GRID_HEIGHT = CHANNEL_ROWS * ROW_HEIGHT;
const OVERLAP_PATTERN = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.45) 0 4px, transparent 4px 8px)';
const ERROR_PATTERN = 'repeating-linear-gradient(45deg, rgba(0,0,0,0.3) 0 3px, transparent 3px 6px)';

type BlockStatus = 'ok' | 'overlap' | 'error';
interface DisplayBlock { patch: FixturePatch; start: number; end: number; status: BlockStatus; }
interface BlockFragment { block: DisplayBlock; start: number; end: number; row: number; first: boolean; }
interface DmxUniverseViewProps { onClose: () => void; focusFixtureId?: string; }

const rangeFragments = (block: DisplayBlock): BlockFragment[] => {
  const fragments: BlockFragment[] = [];
  let start = block.start;
  while (start <= block.end) {
    const row = Math.floor((start - 1) / CHANNELS_PER_ROW);
    const end = Math.min(block.end, (row + 1) * CHANNELS_PER_ROW);
    fragments.push({ block, start, end, row, first: start === block.start });
    start = end + 1;
  }
  return fragments;
};

const placementMessage = (preview: FixturePlacementPreview): string => {
  if (preview.fits) return `Drop at ${preview.address}–${preview.end}.`;
  if (preview.issue === 'overlap') return `Channels ${preview.address}–${preview.end} are already occupied.`;
  if (preview.issue === 'outside_universe') return `This footprint runs past channel ${DMX_CHANNELS_PER_UNIVERSE}.`;
  if (preview.issue === 'unknown_footprint') return 'Set this fixture’s real mode footprint before patching.';
  return 'Choose a valid address in this universe.';
};

export const DmxUniverseView: React.FC<DmxUniverseViewProps> = ({ onClose, focusFixtureId }) => {
  const { activeSetup, updateElement, selectElement, selectedElementIds } = useFloorPlan();
  const { theme } = useWorkspaceUI();
  const isLight = theme === 'light';
  const selectedId = selectedElementIds.length > 0 ? selectedElementIds[selectedElementIds.length - 1] : null;
  const [activeFixtureId, setActiveFixtureId] = useState<string | null>(focusFixtureId ?? selectedId);
  const fixtureElements = useMemo(() => (activeSetup.elements || []).filter((element): element is LightElement => element.type === 'light'), [activeSetup.elements]);
  const patches = useMemo(() => findConflicts(collectFixturePatches(fixtureElements)), [fixtureElements]);
  const focusPatch = patches.find((patch) => patch.light.id === (focusFixtureId ?? activeFixtureId));
  const [universe, setUniverse] = useState<number>(() => focusPatch?.universe ?? 1);
  const [draggedFixtureId, setDraggedFixtureId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<FixturePlacementPreview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const usedUniverses = useMemo(() => Array.from(new Set(patches.filter((patch) => patch.dmxable && typeof patch.universe === 'number').map((patch) => patch.universe as number))).sort((a, b) => a - b), [patches]);
  const unpatched = useMemo(() => patches.filter((patch) => patch.dmxable && !(patch.universe && patch.address)), [patches]);
  const universePatches = useMemo(() => patches.filter((patch) => patch.dmxable && patch.universe === universe), [patches, universe]);
  const selectedPatch = useMemo(() => patches.find((patch) => patch.light.id === (activeFixtureId ?? selectedId)) ?? null, [activeFixtureId, patches, selectedId]);
  const blocks = useMemo<DisplayBlock[]>(() => universePatches.flatMap((patch) => {
    if (typeof patch.address !== 'number' || patch.address < 1 || patch.address > DMX_CHANNELS_PER_UNIVERSE || patch.channels === undefined) return [];
    const rawEnd = patch.address + patch.channels - 1;
    return [{ patch, start: patch.address, end: Math.min(rawEnd, DMX_CHANNELS_PER_UNIVERSE), status: rawEnd > DMX_CHANNELS_PER_UNIVERSE ? 'error' : patch.conflict ? 'overlap' : 'ok' }];
  }), [universePatches]);
  const fragments = useMemo(() => blocks.flatMap(rangeFragments), [blocks]);
  const nextFreeAddress = useMemo(() => !selectedPatch || selectedPatch.channels === undefined ? null : findFreeRange(universeOccupancy(patches.filter((patch) => patch.light.id !== selectedPatch.light.id), universe), selectedPatch.channels), [patches, selectedPatch, universe]);
  const blockVisual = (status: BlockStatus): React.CSSProperties => status === 'overlap' ? { backgroundColor: '#f59e0b', backgroundImage: OVERLAP_PATTERN, border: '2px dashed #92400e' } : status === 'error' ? { backgroundColor: '#e11d48', backgroundImage: ERROR_PATTERN, border: '2px solid #881337' } : { backgroundColor: '#0d9488', border: '1px solid #0f766e' };
  const addressFromEvent = (event: React.DragEvent<HTMLDivElement>): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    const column = Math.max(0, Math.min(CHANNELS_PER_ROW - 1, Math.floor((event.clientX - rect.left) / CELL_WIDTH)));
    const row = Math.max(0, Math.min(CHANNEL_ROWS - 1, Math.floor((event.clientY - rect.top) / ROW_HEIGHT)));
    return row * CHANNELS_PER_ROW + column + 1;
  };
  const beginDrag = (event: React.DragEvent<HTMLElement>, patch: FixturePatch) => {
    if (patch.channels === undefined) return;
    event.dataTransfer.setData('application/x-cineplan-dmx-fixture', patch.light.id);
    event.dataTransfer.effectAllowed = 'move';
    setDraggedFixtureId(patch.light.id); setActiveFixtureId(patch.light.id); setMessage(null);
  };
  const selectPatch = (patch: FixturePatch) => { selectElement(patch.light.id); setActiveFixtureId(patch.light.id); if (patch.universe) setUniverse(patch.universe); setMessage(null); };
  const previewDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const fixtureId = event.dataTransfer.getData('application/x-cineplan-dmx-fixture') || draggedFixtureId;
    if (!fixtureId) return;
    event.dataTransfer.dropEffect = 'move';
    setDropPreview(previewFixturePlacement(patches, fixtureId, universe, addressFromEvent(event)));
  };
  const dropFixture = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const fixtureId = event.dataTransfer.getData('application/x-cineplan-dmx-fixture') || draggedFixtureId;
    if (!fixtureId) return;
    const preview = previewFixturePlacement(patches, fixtureId, universe, addressFromEvent(event));
    setDropPreview(null); setDraggedFixtureId(null);
    if (!preview.fits) { setMessage(placementMessage(preview)); return; }
    const patch = patches.find((candidate) => candidate.light.id === fixtureId);
    if (!patch) return;
    updateElement(fixtureId, { dmxUniverse: universe, dmxAddress: preview.address }); selectElement(fixtureId); setActiveFixtureId(fixtureId);
    const sequential = preview.end && preview.end < DMX_CHANNELS_PER_UNIVERSE ? preview.end + 1 : null;
    setMessage(`Patched “${patch.label}” at U${universe}:${String(preview.address).padStart(3, '0')}–${String(preview.end).padStart(3, '0')}.${sequential ? ` Next sequential address: ${sequential}.` : ''}`);
  };
  const nudge = (delta: -1 | 1) => {
    if (!selectedPatch || selectedPatch.address === undefined) return;
    const preview = previewFixturePlacement(patches, selectedPatch.light.id, selectedPatch.universe ?? universe, selectedPatch.address + delta);
    if (!preview.fits) { setMessage(placementMessage(preview)); return; }
    updateElement(selectedPatch.light.id, { dmxUniverse: selectedPatch.universe ?? universe, dmxAddress: preview.address }); setMessage(`Moved to address ${preview.address}.`);
  };
  // The patch bay is always mounted open by its parent, so the trap is armed
  // unconditionally; it releases focus back to the caller when this unmounts.
  const dialogRef = useDialogFocusTrap(true);
  const panelBg = isLight ? 'bg-white border-slate-300 text-slate-950' : 'bg-slate-900 border-slate-700 text-slate-100';
  const subtleText = isLight ? 'text-slate-600' : 'text-slate-400';
  const control = isLight ? 'border-slate-300 bg-white text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-100';

  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dmx-patch-bay-title" tabIndex={-1} className={`w-full max-w-6xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden outline-hidden ${panelBg}`}>
      <header className={`flex items-center justify-between gap-3 px-4 py-3 border-b ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'}`}><div className="flex items-center gap-2"><span className={`p-1.5 rounded-lg ${isLight ? 'bg-amber-100 text-amber-900' : 'bg-amber-500/15 text-amber-400'}`}><Zap className="w-4 h-4" /></span><div><h3 id="dmx-patch-bay-title" className="text-sm font-black">DMX Patch Bay</h3><p className={`text-[11px] font-semibold ${subtleText}`}>Drag fixture blocks onto the 512-channel grid. Their real mode footprint determines the space used.</p></div></div><button onClick={onClose} aria-label="Close DMX patch bay" className={`min-w-[36px] min-h-[36px] rounded-lg flex items-center justify-center ${isLight ? 'hover:bg-slate-200' : 'hover:bg-slate-800'}`}><X className="w-4 h-4" /></button></header>
      <div className={`flex items-center gap-2 flex-wrap px-4 py-2.5 border-b ${isLight ? 'border-slate-200' : 'border-slate-800'}`}><span className="text-[10px] font-black uppercase tracking-wider">Universe</span>{usedUniverses.map((value) => <button key={value} onClick={() => setUniverse(value)} className={`min-h-[32px] px-2.5 rounded-md text-[11px] font-black border ${universe === value ? 'bg-amber-500 border-amber-500 text-white' : control}`}>U{value}</button>)}<input aria-label="Universe number" type="number" min={1} value={universe} onChange={(event) => setUniverse(Math.max(1, Math.floor(Number(event.target.value) || 1)))} className={`w-20 min-h-[32px] rounded-md border px-2 font-mono text-xs font-bold ${control}`} /><span className={`text-[10px] font-semibold ${subtleText}`}>{universePatches.length} fixture{universePatches.length === 1 ? '' : 's'} on U{universe}</span></div>
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden"><section className="flex-1 min-w-0 p-4 overflow-y-auto custom-scrollbar"><div className={`mb-2 flex items-center justify-between gap-2 text-[10px] font-bold ${subtleText}`}><span>Channels 1–512 · 32 per row</span><span>{dropPreview ? placementMessage(dropPreview) : 'Drag a block to preview its exact address range.'}</span></div><div className={`overflow-auto rounded-xl border p-2 ${isLight ? 'border-slate-300 bg-slate-100' : 'border-slate-700 bg-slate-950'}`}><div className="ml-8" style={{ width: GRID_WIDTH }}><div className="grid h-5 text-[8px] font-mono font-bold opacity-60" style={{ gridTemplateColumns: `repeat(${CHANNELS_PER_ROW}, ${CELL_WIDTH}px)` }}>{Array.from({ length: CHANNELS_PER_ROW }, (_, index) => <span key={index} className="text-center">{index + 1}</span>)}</div><div className="relative" style={{ width: GRID_WIDTH, height: GRID_HEIGHT, backgroundImage: `linear-gradient(to right, ${isLight ? 'rgba(100,116,139,.25)' : 'rgba(100,116,139,.38)'} 1px, transparent 1px), linear-gradient(to bottom, ${isLight ? 'rgba(100,116,139,.25)' : 'rgba(100,116,139,.38)'} 1px, transparent 1px)`, backgroundSize: `${CELL_WIDTH}px ${ROW_HEIGHT}px` }} onDragOver={previewDrop} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropPreview(null); }} onDrop={dropFixture}>{Array.from({ length: CHANNEL_ROWS }, (_, row) => <span key={row} className={`absolute -left-8 text-right w-7 text-[9px] font-mono font-black ${subtleText}`} style={{ top: row * ROW_HEIGHT + 10 }}>{String(row * CHANNELS_PER_ROW + 1).padStart(3, '0')}</span>)}{fragments.map((fragment) => { const width = (fragment.end - fragment.start + 1) * CELL_WIDTH - 3; const left = ((fragment.start - 1) % CHANNELS_PER_ROW) * CELL_WIDTH + 1; const selected = fragment.block.patch.light.id === (activeFixtureId ?? selectedId); return <button key={`${fragment.block.patch.light.id}-${fragment.start}`} draggable={fragment.block.patch.channels !== undefined} onDragStart={(event) => beginDrag(event, fragment.block.patch)} onDragEnd={() => { setDraggedFixtureId(null); setDropPreview(null); }} onClick={() => selectPatch(fragment.block.patch)} title={`${fragment.block.patch.label}: ${fragment.start}–${fragment.end} (${fragment.block.patch.channels}ch)`} className={`absolute h-[29px] overflow-hidden text-left text-[9px] font-black text-white rounded-sm px-1 cursor-grab active:cursor-grabbing ${selected ? 'ring-2 ring-sky-400 z-20' : 'z-10'}`} style={{ left, top: fragment.row * ROW_HEIGHT + 2, width, ...blockVisual(fragment.block.status) }}>{fragment.first ? <span className="flex items-center gap-0.5 truncate"><GripVertical className="w-3 h-3 shrink-0 opacity-75" />{fragment.block.patch.label}</span> : <span className="opacity-70">↳</span>}</button>; })}{dropPreview?.end !== undefined && rangeFragments({ patch: { light: {} as LightElement, dmxable: true, label: '', conflict: false }, start: dropPreview.address, end: Math.min(dropPreview.end, DMX_CHANNELS_PER_UNIVERSE), status: 'ok' }).map((fragment) => <div key={`preview-${fragment.start}`} className={`absolute h-[29px] rounded-sm border-2 border-dashed pointer-events-none ${dropPreview.fits ? 'bg-emerald-400/35 border-emerald-300' : 'bg-rose-400/35 border-rose-300'}`} style={{ left: ((fragment.start - 1) % CHANNELS_PER_ROW) * CELL_WIDTH + 1, top: fragment.row * ROW_HEIGHT + 2, width: (fragment.end - fragment.start + 1) * CELL_WIDTH - 3 }} />)}</div></div></div>
      <div className={`mt-3 rounded-xl border p-3 ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950/40'}`}><div className="flex items-center justify-between gap-2"><h4 className="text-[10px] uppercase tracking-wider font-black">Unpatched fixtures</h4><span className={`text-[10px] ${subtleText}`}>Drag these blocks into U{universe}</span></div><div className="mt-2 flex flex-wrap gap-2">{unpatched.map((patch) => <button key={patch.light.id} draggable={patch.channels !== undefined} onDragStart={(event) => beginDrag(event, patch)} onDragEnd={() => { setDraggedFixtureId(null); setDropPreview(null); }} onClick={() => selectPatch(patch)} title={patch.channels === undefined ? 'Set a real mode footprint in the fixture inspector before patching.' : `Drag ${patch.channels} channels into the grid`} className={`min-h-[36px] flex items-center gap-1.5 px-2 rounded-lg border text-[11px] font-bold ${patch.channels === undefined ? 'opacity-60 cursor-not-allowed border-amber-500/60' : 'cursor-grab active:cursor-grabbing'} ${patch.light.id === (activeFixtureId ?? selectedId) ? 'bg-sky-600 border-sky-600 text-white' : control}`}><GripVertical className="w-3.5 h-3.5 opacity-60" /><span>{patch.label}</span><span className="font-mono opacity-70">{patch.channels === undefined ? 'footprint needed' : `${patch.channels}ch`}</span></button>)}{unpatched.length === 0 && <span className={`text-[11px] ${subtleText}`}>Everything with a known footprint is patched.</span>}</div></div></section>
      <aside className={`lg:w-80 shrink-0 border-t lg:border-t-0 lg:border-l p-4 overflow-y-auto custom-scrollbar ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/40'}`}><h4 className="text-[10px] font-black uppercase tracking-wider">Fixture inspector</h4>{selectedPatch ? <div className={`mt-2 rounded-xl border p-3 space-y-2 ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'}`}><strong className="text-xs block break-words">{selectedPatch.label}</strong><dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]"><dt className={subtleText}>Mode</dt><dd>{selectedPatch.light.dmxModeName ?? 'Not named'}</dd><dt className={subtleText}>Footprint</dt><dd className="font-mono">{selectedPatch.channels === undefined ? 'Unknown — set it in fixture inspector' : `${selectedPatch.channels} channels`}</dd><dt className={subtleText}>Patch</dt><dd className="font-mono">{selectedPatch.universe && selectedPatch.address ? `U${selectedPatch.universe}:${String(selectedPatch.address).padStart(3, '0')}` : 'Unpatched'}</dd><dt className={subtleText}>First free fit</dt><dd className="font-mono">{nextFreeAddress === null ? 'No space' : `${nextFreeAddress}`}</dd></dl>{selectedPatch.conflict && <p className="flex gap-1.5 text-[11px] text-rose-600 dark:text-rose-300 font-bold"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />Existing conflict — drag this block to a free range.</p>}{selectedPatch.address !== undefined && selectedPatch.channels !== undefined && <div className="flex gap-1.5"><button onClick={() => nudge(-1)} className={`min-w-[36px] min-h-[36px] border rounded-lg flex items-center justify-center ${control}`} aria-label="Move back one address"><ChevronLeft className="w-4 h-4" /></button><button onClick={() => nudge(1)} className={`min-w-[36px] min-h-[36px] border rounded-lg flex items-center justify-center ${control}`} aria-label="Move forward one address"><ChevronRight className="w-4 h-4" /></button><span className={`self-center text-[10px] ${subtleText}`}>Nudge without overlaps</span></div>}</div> : <p className={`mt-2 text-[11px] ${subtleText}`}>Select or drag a fixture block to inspect it.</p>}{message && <p className={`mt-3 rounded-lg border p-2 text-[11px] font-semibold ${message.includes('occupied') || message.includes('past') ? 'border-rose-500/60 text-rose-600 dark:text-rose-300' : 'border-sky-500/50 text-sky-700 dark:text-sky-300'}`}>{message}</p>}</aside></main>
    </div>
  </div>;
};
