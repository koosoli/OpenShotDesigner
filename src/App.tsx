import React, { useState } from 'react';
import { FloorPlanProvider, useFloorPlan } from './context/FloorPlanContext';
import { TopNavbar } from './components/toolbar/TopNavbar';
import { LeftToolbar } from './components/toolbar/LeftToolbar';
import { FloorPlanCanvas } from './components/canvas/FloorPlanCanvas';
import { TimelineBar } from './components/timeline/TimelineBar';
import { ShotListPanel } from './components/shotlist/ShotListPanel';
import { StoryboardPanel } from './components/storyboard/StoryboardPanel';
import { ScriptPanel } from './components/script/ScriptPanel';
import { InspectorPanel } from './components/inspector/InspectorPanel';
import { ViewfinderModal } from './components/viewfinder/ViewfinderModal';
import { PrintableShotPlan } from './components/export/PrintableShotPlan';
import { QuickAssetSearch } from './components/toolbar/QuickAssetSearch';
import { ProjectDashboard } from './components/dashboard/ProjectDashboard';
import { useBreakpoint } from './utils/useMediaQuery';
import { AlertTriangle, Film, FileText, Image as ImageIcon, Sliders, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Maximize2, Minimize2, X } from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';

const MainLayout: React.FC = () => {
  const { activeSetup, selectedElementIds, activeRightTab, setActiveRightTab, theme, storageWarning, dismissStorageWarning } = useFloorPlan();
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [isRightPanelFullscreen, setIsRightPanelFullscreen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(700); // Default wide enough to show the full shot list
  const [isResizing, setIsResizing] = useState(false);
  const { isCompact: isMobile } = useBreakpoint();
  // Bottom-sheet height on phones: peek (tabs only), half, or nearly full screen.
  const [sheetSize, setSheetSize] = useState<'peek' | 'half' | 'full'>('half');

  const isLight = theme === 'light';
  const sheetHeight = sheetSize === 'peek' ? '3.25rem' : sheetSize === 'full' ? '88vh' : 'min(52vh, 520px)';

  // Exit fullscreen on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isRightPanelFullscreen) {
        setIsRightPanelFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRightPanelFullscreen]);

  // Sidebar drag to resize
  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(850, Math.max(280, startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div className={`flex flex-col w-screen h-screen overflow-hidden font-sans select-none transition-colors ${
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
              isRightPanelFullscreen
                ? undefined
                : ({
                    '--sidebar-width': `${sidebarWidth}px`,
                    '--sheet-height': sheetHeight,
                    // Inline height wins over the h-full utility class on phones
                    ...(isMobile ? { height: sheetHeight } : null),
                  } as React.CSSProperties)
            }
            className={`transition-colors ${
              isRightPanelFullscreen
                ? `fixed inset-0 z-50 w-screen h-screen flex flex-col ${isLight ? 'bg-white text-slate-900' : 'bg-slate-950 text-slate-100'}`
                : `h-full flex flex-col border-l shadow-2xl relative z-20 flex-shrink-0 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`
            }`}
          >
            {/* Resizing left edge bar (hidden in fullscreen) */}
            {!isRightPanelFullscreen && (
              <div
                onPointerDown={handleResizePointerDown}
                onDoubleClick={() => setSidebarWidth((prev) => (prev > 500 ? 360 : 700))}
                title="Drag to resize panel (Double click to toggle wide/standard)"
                className={`absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 group flex items-center justify-center`}
              >
                <div className={`w-1 h-12 rounded-full transition-all ${
                  isResizing ? 'bg-sky-500 w-1.5' : 'bg-transparent group-hover:bg-sky-400/80'
                }`} />
              </div>
            )}

            {/* Tab Header (Shot List vs Inspector) */}
            <div className={`flex items-center justify-between border-b p-1.5 ${
              isLight ? 'border-slate-200 bg-slate-100/70' : 'border-slate-800 bg-slate-950/60'
            }`}>
              <div className="flex items-center gap-1 flex-1">
                <button
                  id="tab-shot-list"
                  onClick={() => setActiveRightTab('shots')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                    activeRightTab === 'shots'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>Shot List</span>
                  <span className={`ml-1 px-1.5 py-0.2 text-[10px] font-mono rounded-full ${
                    isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-950/80 text-slate-300'
                  }`}>
                    {activeSetup.shots.length}
                  </span>
                </button>

                <button
                  id="tab-storyboard"
                  onClick={() => setActiveRightTab('storyboard')}
                  title="Storyboard view"
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                    activeRightTab === 'storyboard'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>Board</span>
                </button>

                <button
                  id="tab-script"
                  onClick={() => setActiveRightTab('script')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all ${
                    activeRightTab === 'script'
                      ? 'bg-violet-600 text-white shadow-sm'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Script</span>
                </button>

                <button
                  id="tab-inspector"
                  onClick={() => setActiveRightTab('inspector')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                    activeRightTab === 'inspector'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Inspector</span>
                  {selectedElementIds.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  )}
                </button>
              </div>

              {/* Panel width presets (desktop) / bottom-sheet height (mobile) & Fullscreen toggle */}
              <div className="flex items-center gap-0.5 ml-1">
                {/* Full Screen Toggle Button */}
                <button
                  onClick={() => setIsRightPanelFullscreen((prev) => !prev)}
                  title={isRightPanelFullscreen ? 'Exit Full Screen (Esc)' : 'Full Screen Panel View'}
                  className={`p-1.5 rounded-lg text-xs transition-colors ${
                    isRightPanelFullscreen
                      ? 'bg-violet-600 text-white shadow-sm'
                      : isLight
                      ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {isRightPanelFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
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
                  !isRightPanelFullscreen && (
                    <button
                      onClick={() => setSidebarWidth((prev) => (prev > 500 ? 360 : 700))}
                      title={sidebarWidth > 500 ? 'Compact panel width' : 'Expand panel width'}
                      className={`p-1.5 rounded-lg text-xs transition-colors ${
                        isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[10px] font-mono font-bold">{sidebarWidth > 500 ? '‹|›' : '›|‹'}</span>
                    </button>
                  )
                )}

                {/* Collapse Sidebar Button */}
                <button
                  onClick={() => {
                    setIsRightPanelFullscreen(false);
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

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeRightTab === 'shots' ? (
                <ShotListPanel />
              ) : activeRightTab === 'storyboard' ? (
                <StoryboardPanel />
              ) : activeRightTab === 'script' ? (
                <ScriptPanel />
              ) : (
                <InspectorPanel />
              )}
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

      {/* 3. Modals */}
      <ViewfinderModal />
      <PrintableShotPlan />
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
