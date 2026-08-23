import React, { Suspense, useEffect, useState } from 'react';
import { FloorPlanProvider, useFloorPlan } from './context/FloorPlanContext';
import { TopNavbar } from './components/toolbar/TopNavbar';
import { LeftToolbar } from './components/toolbar/LeftToolbar';
import { FloorPlanCanvas } from './components/canvas/FloorPlanCanvas';
import { TimelineBar } from './components/timeline/TimelineBar';
import { ShotListPanel } from './components/shotlist/ShotListPanel';
import { StoryboardPanel } from './components/storyboard/StoryboardPanel';
import { ScriptPanel } from './components/script/ScriptPanel';
import { InspectorPanel } from './components/inspector/InspectorPanel';
import { QuickAssetSearch } from './components/toolbar/QuickAssetSearch';
import { ensureBundledFixtureSnapshot } from './domain/fixtures';

/**
 * Code-split surfaces (plan §5.3 first-load budget).
 *
 * None of these is on the first-paint path: the export studio and the
 * viewfinder are modals, and every production/technical panel is behind a tab
 * the user has to choose. Loading them eagerly put the print stack (a dozen
 * report views), the camera stack and nine panels into the entry chunk that
 * everyone downloads before they can see their floor plan.
 *
 * Each is rendered inside <Suspense> with a quiet fallback, and the modals are
 * additionally gated on their open flag so the chunk is not even requested
 * until the user opens them.
 */
const ViewfinderModal = React.lazy(() =>
  import('./components/viewfinder/ViewfinderModal').then((m) => ({ default: m.ViewfinderModal })),
);
const PrintableShotPlan = React.lazy(() =>
  import('./components/export/PrintableShotPlan').then((m) => ({ default: m.PrintableShotPlan })),
);
const EquipmentPanel = React.lazy(() =>
  import('./components/equipment/EquipmentPanel').then((m) => ({ default: m.EquipmentPanel })),
);
const SchedulePanel = React.lazy(() =>
  import('./components/schedule/SchedulePanel').then((m) => ({ default: m.SchedulePanel })),
);
const MoodBoardPanel = React.lazy(() =>
  import('./components/moodboard/MoodBoardPanel').then((m) => ({ default: m.MoodBoardPanel })),
);
const LocationsPanel = React.lazy(() =>
  import('./components/locations/LocationsPanel').then((m) => ({ default: m.LocationsPanel })),
);
const PowerPanel = React.lazy(() =>
  import('./components/power/PowerPanel').then((m) => ({ default: m.PowerPanel })),
);
const LogisticsPanel = React.lazy(() =>
  import('./components/logistics/LogisticsPanel').then((m) => ({ default: m.LogisticsPanel })),
);
const RunOfShowPanel = React.lazy(() =>
  import('./components/runofshow/RunOfShowPanel').then((m) => ({ default: m.RunOfShowPanel })),
);
const RiggingPanel = React.lazy(() =>
  import('./components/rigging/RiggingPanel').then((m) => ({ default: m.RiggingPanel })),
);
const ContactsPanel = React.lazy(() =>
  import('./components/contacts/ContactsPanel').then((m) => ({ default: m.ContactsPanel })),
);
const BudgetPanel = React.lazy(() =>
  import('./components/budget/BudgetPanel').then((module) => ({ default: module.BudgetPanel })),
);
const TaskBoardPanel = React.lazy(() =>
  import('./components/tasks/TaskBoardPanel').then((m) => ({ default: m.TaskBoardPanel })),
);

/** Quiet placeholder while a panel chunk arrives; never a layout jump. */
const PanelFallback: React.FC = () => (
  <div className="h-full flex items-center justify-center text-xs opacity-50">Loading…</div>
);
import { ProjectDashboard } from './components/dashboard/ProjectDashboard';
import { useBreakpoint } from './utils/useMediaQuery';
import { AlertTriangle, Zap, Package, ListOrdered, Anchor, Film, FileText, Image as ImageIcon, Sliders, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, X, Boxes, CalendarDays, Images, KanbanSquare, Coins, MapPin, Maximize2, Minimize2, Users } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { deriveSceneEquipment } from './utils/equipmentList';

type WorkspaceModule = 'shots' | 'storyboard' | 'script' | 'equipment' | 'schedule' | 'moodboard' | 'locations' | 'power' | 'logistics' | 'run_of_show' | 'rigging' | 'contacts' | 'tasks' | 'budget' | 'inspector';
type WorkspaceGroup = 'creative' | 'production' | 'technical';

const MainLayout: React.FC = () => {
  const { project, activeSetup, selectedElementIds, activeRightTab, setActiveRightTab, theme, storageWarning, dismissStorageWarning, isModuleVisible, isViewfinderOpen, isExportModalOpen } = useFloorPlan();
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);

  // Pull the bundled fixture snapshot in after first paint. It is a dynamic
  // import so it stays out of the entry chunk; starting it here means it has
  // normally arrived long before anyone opens the fixture picker, while the
  // app is already interactive.
  useEffect(() => {
    void ensureBundledFixtureSnapshot();
  }, []);
  const [isSidebarFullscreen, setIsSidebarFullscreen] = useState(false);
  const calculateDefaultSidebarWidth = (): number => {
    if (typeof window === 'undefined') return 860;
    const vw = window.innerWidth;
    // Extended ~10% more (860px) so Shot List, Storyboard, Script, Gear Manifest, and Inspector
    // are completely open and readable with comfortable breathing room.
    if (vw >= 1600) return 860;
    if (vw >= 1280) return 820;
    if (vw >= 1024) return 760;
    return 660;
  };

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('openshotdesigner_sidebar_width');
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed >= 320 && parsed <= 1400) {
          if (parsed <= 800) return 860;
          return parsed;
        }
      }
    } catch {}
    return calculateDefaultSidebarWidth();
  });

  const [isResizing, setIsResizing] = useState(false);
  const { isCompact: isMobile } = useBreakpoint();
  // Bottom-sheet height on phones: peek (tabs only), half, or nearly full screen.
  const [sheetSize, setSheetSize] = useState<'peek' | 'half' | 'full'>('half');
  const [isProductionMenuOpen, setIsProductionMenuOpen] = useState(false);

  const isLight = theme === 'light';
  const sheetHeight = sheetSize === 'peek' ? '3.25rem' : sheetSize === 'full' ? '88vh' : 'min(52vh, 520px)';
  const sceneEquipCount = React.useMemo(
    () => deriveSceneEquipment(activeSetup).reduce((sum, item) => sum + item.quantity, 0),
    [activeSetup]
  );

  const workspaceModules: Array<{
    id: WorkspaceModule;
    group: WorkspaceGroup;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
    visible: boolean;
  }> = [
    { id: 'shots', group: 'creative', label: 'Shot list', icon: Film, count: activeSetup.shots.length, visible: isModuleVisible('shots') },
    { id: 'storyboard', group: 'creative', label: 'Storyboard', icon: ImageIcon, visible: isModuleVisible('storyboard') },
    { id: 'script', group: 'creative', label: 'Script', icon: FileText, visible: isModuleVisible('script') },
    { id: 'moodboard', group: 'creative', label: 'Moodboard', icon: Images, visible: isModuleVisible('moodboard') },
    { id: 'locations', group: 'creative', label: 'Locations', icon: MapPin, visible: isModuleVisible('locations') },
    { id: 'schedule', group: 'production', label: 'Schedule', icon: CalendarDays, visible: isModuleVisible('schedule') },
    { id: 'equipment', group: 'production', label: 'Gear', icon: Boxes, count: sceneEquipCount, visible: isModuleVisible('equipment') },
    { id: 'logistics', group: 'production', label: 'Logistics', icon: Package, visible: isModuleVisible('logistics') },
    { id: 'run_of_show', group: 'production', label: 'Run of show', icon: ListOrdered, visible: isModuleVisible('run_of_show') },
    { id: 'contacts', group: 'production', label: 'Crew', icon: Users, count: project.people?.length || undefined, visible: isModuleVisible('contacts') },
    { id: 'tasks', group: 'production', label: 'Tasks', icon: KanbanSquare, count: project.tasks?.length || undefined, visible: isModuleVisible('tasks') },
    { id: 'budget', group: 'production', label: 'Budget', icon: Coins, visible: isModuleVisible('budget') },
    { id: 'power', group: 'technical', label: 'Power', icon: Zap, visible: isModuleVisible('power') },
    { id: 'rigging', group: 'technical', label: 'Rigging', icon: Anchor, visible: isModuleVisible('rigging') },
    { id: 'inspector', group: 'technical', label: 'Inspector', icon: Sliders, visible: true },
  ];

  // Sidebar drag to resize
  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      const maxAllowed = typeof window !== 'undefined' ? Math.min(window.innerWidth - 220, 1600) : 1400;
      const newWidth = Math.min(maxAllowed, Math.max(320, startWidth + delta));
      setSidebarWidth(newWidth);
      try {
        localStorage.setItem('openshotdesigner_sidebar_width', String(newWidth));
      } catch {}
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const toggleSidebarWidth = () => {
    setSidebarWidth((prev) => {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
      let nextWidth: number;
      // Cycle: Optimal Full-Read (780px) -> Compact (520px) -> Wide (980px)
      if (prev < 650) {
        nextWidth = 780;
      } else if (prev < 880) {
        nextWidth = Math.min(vw - 260, 980);
      } else {
        nextWidth = 520;
      }
      try {
        localStorage.setItem('openshotdesigner_sidebar_width', String(nextWidth));
      } catch {}
      return nextWidth;
    });
  };

  const primaryModuleIds: WorkspaceModule[] = ['shots', 'storyboard', 'script', 'equipment', 'inspector'];
  const productionToolIds: WorkspaceModule[] = ['schedule', 'locations', 'moodboard', 'contacts', 'tasks', 'budget', 'logistics', 'run_of_show', 'power', 'rigging'];
  const activeProductionTool = workspaceModules.find((module) => module.id === activeRightTab && productionToolIds.includes(module.id));

  return (
    <div id="app-root" className={`flex flex-col w-screen h-screen overflow-hidden font-sans select-none transition-colors ${
      isLight ? 'bg-slate-50 text-slate-900' : 'bg-slate-950 text-slate-100'
    } ${isResizing ? 'cursor-col-resize' : ''}`}>
      {/* 1. Top Navbar */}
      <TopNavbar />

      {/* 2. Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Vertical Tool Palette */}
        <LeftToolbar />

        {/* Center Canvas Area with Timeline at Bottom */}
        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
          <div className="flex-1 relative overflow-hidden">
            <FloorPlanCanvas />
          </div>

          {/* Director's Blocking Playback Timeline */}
          <TimelineBar />
        </div>

        {/* Storage Warning Banner (large embedded storyboards exceed localStorage quota) */}
        {storageWarning && (
          <div
            className={`absolute top-3 left-1/2 -translate-x-1/2 z-[60] max-w-xl w-[92%] flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border shadow-2xl animate-in fade-in slide-in-from-top-1 ${
              isLight ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-amber-950/95 border-amber-700 text-amber-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 flex-shrink-0" />
            <p className="text-[11px] leading-relaxed flex-1">{storageWarning}</p>
            <button
              onClick={dismissStorageWarning}
              title="Dismiss"
              className={`p-1 rounded transition-colors flex-shrink-0 ${
                isLight ? 'text-amber-700 hover:bg-amber-200/60' : 'text-amber-300 hover:bg-amber-900/60'
              }`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Right Sidebar: Synchronized Shot List & Contextual Inspector */}
        {isRightPanelOpen ? (
          <aside
            id="right-sidebar"
            style={
              ({
                    '--sidebar-width': `${sidebarWidth}px`,
                    '--sheet-height': sheetHeight,
                    // Inline height wins over the h-full utility class on phones
                    ...(isMobile ? { height: sheetHeight } : null),
                  } as React.CSSProperties)
            }
            className={`${isSidebarFullscreen ? 'is-fullscreen absolute inset-0 z-40 w-full' : 'h-full relative z-20 flex-shrink-0'} flex flex-col border-l shadow-2xl transition-colors ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}
          >
            {/* Resizing left edge bar */}
            {(
              <div
                onPointerDown={handleResizePointerDown}
                onDoubleClick={toggleSidebarWidth}
                title="Drag to resize panel (Double-click to toggle Wide / UltraWide / Standard)"
                className={`absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 group flex items-center justify-center`}
              >
                <div className={`w-1 h-12 rounded-full transition-all ${
                  isResizing ? 'bg-sky-500 w-1.5' : 'bg-transparent group-hover:bg-sky-400/80'
                }`} />
              </div>
            )}

            {/* Core tabs stay quiet; optional production modules live in one menu. */}
            <div className={`flex items-center justify-between border-b px-2 py-1.5 gap-2 ${
              isLight ? 'border-slate-200 bg-slate-100/70' : 'border-slate-800 bg-slate-950/60'
            }`}>
              <nav aria-label="Workspace modules" className="flex-1 min-w-0 flex items-center gap-1">
                  {workspaceModules.filter((module) => primaryModuleIds.includes(module.id) && module.visible).map((module) => {
                    const Icon = module.icon;
                    const active = activeRightTab === module.id;
                    return <button key={module.id} id={`tab-${module.id}`} onClick={() => { setActiveRightTab(module.id); setIsProductionMenuOpen(false); }} title={module.label} className={`flex-1 min-w-0 h-8 px-2 rounded-md flex items-center justify-center gap-1.5 text-[10px] font-semibold transition-colors ${active ? 'bg-sky-600 text-white shadow-sm' : isLight ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}><Icon className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{module.label}</span>{module.count !== undefined && <span className={`rounded px-1 font-mono text-[8px] ${active ? 'bg-white/20' : isLight ? 'bg-slate-200' : 'bg-slate-950'}`}>{module.count}</span>}{module.id === 'inspector' && selectedElementIds.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}</button>;
                  })}
                  <div className="relative flex-1 min-w-0">
                    <button type="button" onClick={() => setIsProductionMenuOpen((open) => !open)} aria-expanded={isProductionMenuOpen} className={`w-full h-8 px-2 rounded-md flex items-center justify-center gap-1.5 text-[10px] font-semibold transition-colors ${activeProductionTool ? 'bg-sky-600 text-white shadow-sm' : isLight ? 'text-slate-600 hover:bg-slate-200 hover:text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
                      {activeProductionTool ? React.createElement(activeProductionTool.icon, { className: 'w-3.5 h-3.5 shrink-0' }) : <CalendarDays className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate">{activeProductionTool?.label ?? 'Production'}</span><ChevronDown className="w-3 h-3 shrink-0" />
                    </button>
                    {isProductionMenuOpen && <div className={`absolute top-10 right-0 z-50 w-64 rounded-xl border shadow-2xl p-2 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700'}`}>
                      {([
                        ['Planning', ['schedule', 'locations', 'moodboard']],
                        ['People & money', ['contacts', 'tasks', 'budget']],
                        ['Operations', ['logistics', 'run_of_show']],
                        ['Technical', ['power', 'rigging']],
                      ] as Array<[string, WorkspaceModule[]]>).map(([label, ids]) => <section key={label} className="mb-2 last:mb-0"><div className={`px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{label}</div>{ids.map((id) => workspaceModules.find((module) => module.id === id)).filter((module): module is NonNullable<typeof module> => Boolean(module?.visible)).map((module) => { const Icon = module.icon; return <button key={module.id} onClick={() => { setActiveRightTab(module.id); setIsProductionMenuOpen(false); }} className={`w-full h-9 px-2 rounded-lg flex items-center gap-2 text-[11px] font-semibold ${activeRightTab === module.id ? 'bg-sky-600 text-white' : isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-200 hover:bg-slate-800'}`}><Icon className="w-4 h-4" />{module.label}</button>; })}</section>)}
                    </div>}
                  </div>
              </nav>

              {/* Panel width presets (desktop) / bottom-sheet height (mobile) & Fullscreen toggle */}
              <div className="flex items-center gap-0.5 ml-1">
                <button
                  onClick={() => setIsSidebarFullscreen((fullscreen) => !fullscreen)}
                  title={isSidebarFullscreen ? 'Restore side panel' : 'Open side panel full screen'}
                  aria-label={isSidebarFullscreen ? 'Restore side panel' : 'Open side panel full screen'}
                  aria-pressed={isSidebarFullscreen}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isSidebarFullscreen
                      ? 'bg-sky-600 text-white'
                      : isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {isSidebarFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                {isMobile ? (
                  <>
                    <button
                      onClick={() => setSheetSize((prev) => (prev === 'full' ? 'half' : 'peek'))}
                      title="Shrink panel"
                      className={`p-1.5 rounded-lg transition-colors ${
                        isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setSheetSize((prev) => (prev === 'peek' ? 'half' : 'full'))}
                      title="Enlarge panel"
                      className={`p-1.5 rounded-lg transition-colors ${
                        isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  (
                    <button
                      onClick={toggleSidebarWidth}
                      title="Toggle Side Panel Width (Standard / Wide / Ultra-Wide)"
                      className={`p-1.5 rounded-lg text-xs font-bold transition-colors ${
                        isLight ? 'text-slate-700 hover:text-slate-950 hover:bg-slate-200' : 'text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[11px] font-mono font-black">{sidebarWidth > 900 ? '‹‹|››' : sidebarWidth > 650 ? '‹|›' : '›|‹'}</span>
                    </button>
                  )
                )}

                {/* Collapse Sidebar Button */}
                <button
                  onClick={() => {
                    setIsSidebarFullscreen(false);
                    setIsRightPanelOpen(false);
                  }}
                  title={isMobile ? 'Hide panel' : 'Collapse sidebar'}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {isMobile ? <X className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Tab Content. One Suspense boundary around the whole switch: only
                one panel is mounted at a time, and a per-panel boundary would
                just repeat the same fallback. */}
            <div className="flex-1 overflow-hidden">
              <Suspense fallback={<PanelFallback />}>
              {activeRightTab === 'shots' ? (
                <ShotListPanel />
              ) : activeRightTab === 'storyboard' ? (
                <StoryboardPanel />
              ) : activeRightTab === 'script' ? (
                <ScriptPanel />
              ) : activeRightTab === 'equipment' ? (
                <EquipmentPanel />
              ) : activeRightTab === 'schedule' ? (
                <SchedulePanel />
              ) : activeRightTab === 'moodboard' ? (
                <MoodBoardPanel />
              ) : activeRightTab === 'locations' ? (
                <LocationsPanel />
              ) : activeRightTab === 'power' ? (
                <PowerPanel />
              ) : activeRightTab === 'logistics' ? (
                <LogisticsPanel />
              ) : activeRightTab === 'run_of_show' ? (
                <RunOfShowPanel />
              ) : activeRightTab === 'rigging' ? (
                <RiggingPanel />
              ) : activeRightTab === 'contacts' ? (
                <ContactsPanel />
              ) : activeRightTab === 'tasks' ? (
                <TaskBoardPanel />
              ) : activeRightTab === 'budget' ? (
                <BudgetPanel />
              ) : (
                <InspectorPanel />
              )}
              </Suspense>
            </div>
          </aside>
        ) : (
          /* Collapsed Reopen Button */
          <button
            onClick={() => {
              setIsRightPanelOpen(true);
              if (isMobile) setSheetSize('half');
            }}
            title="Expand Shot List, Script & Inspector"
            className={
              isMobile
                ? `absolute bottom-3 left-1/2 -translate-x-1/2 z-30 px-4 py-2.5 rounded-full shadow-2xl border flex items-center gap-2 text-xs font-semibold ${
                    isLight ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-200'
                  }`
                : `absolute right-0 top-16 z-30 p-2 border-l border-t border-b rounded-l-xl shadow-xl flex items-center gap-1.5 transition-colors ${
                    isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                  }`
            }
          >
            {isMobile ? <ChevronUp className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            <Film className="w-3.5 h-3.5 text-sky-500" />
            {isMobile && <span>Shots &amp; Script</span>}
          </button>
        )}
      </div>

      {/* 3. Modals — gated so their chunks load on first open, not on boot. */}
      {isViewfinderOpen && (
        <Suspense fallback={null}>
          <ViewfinderModal />
        </Suspense>
      )}
      {isExportModalOpen && (
        <Suspense fallback={null}>
          <PrintableShotPlan />
        </Suspense>
      )}
      <QuickAssetSearch />
      <ProjectDashboard />
    </div>
  );
};


export default function App() {
  return (
    <ErrorBoundary>
      <FloorPlanProvider>
        <MainLayout />
      </FloorPlanProvider>
    </ErrorBoundary>
  );
}
