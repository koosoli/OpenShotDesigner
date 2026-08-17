import React, { useState } from 'react';
import { FloorPlanProvider, useFloorPlan } from './context/FloorPlanContext';
import { TopNavbar } from './components/toolbar/TopNavbar';
import { LeftToolbar } from './components/toolbar/LeftToolbar';
import { FloorPlanCanvas } from './components/canvas/FloorPlanCanvas';
import { TimelineBar } from './components/timeline/TimelineBar';
import { ShotListPanel } from './components/shotlist/ShotListPanel';
import { InspectorPanel } from './components/inspector/InspectorPanel';
import { ViewfinderModal } from './components/viewfinder/ViewfinderModal';
import { PrintableShotPlan } from './components/export/PrintableShotPlan';
import { Film, Sliders, ChevronRight, ChevronLeft } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { activeSetup, selectedElementIds, activeRightTab, setActiveRightTab, theme } = useFloorPlan();
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(520); // Default expanded width
  const [isResizing, setIsResizing] = useState(false);

  const isLight = theme === 'light';

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

        {/* Right Sidebar: Synchronized Shot List & Contextual Inspector */}
        {isRightPanelOpen ? (
          <aside
            id="right-sidebar"
            style={{ width: `${sidebarWidth}px` }}
            className={`h-full flex flex-col border-l shadow-2xl relative z-20 transition-colors flex-shrink-0 ${
              isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
            }`}
          >
            {/* Resizing left edge bar */}
            <div
              onPointerDown={handleResizePointerDown}
              onDoubleClick={() => setSidebarWidth((prev) => (prev > 450 ? 340 : 580))}
              title="Drag to resize panel (Double click to toggle wide/standard)"
              className={`absolute -left-1.5 top-0 bottom-0 w-3 cursor-col-resize z-30 group flex items-center justify-center`}
            >
              <div className={`w-1 h-12 rounded-full transition-all ${
                isResizing ? 'bg-sky-500 w-1.5' : 'bg-transparent group-hover:bg-sky-400/80'
              }`} />
            </div>

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

              {/* Panel Width Preset Quick Toggles */}
              <div className="flex items-center gap-0.5 ml-1">
                <button
                  onClick={() => setSidebarWidth((prev) => (prev > 450 ? 340 : 580))}
                  title={sidebarWidth > 450 ? 'Compact panel width' : 'Expand panel width'}
                  className={`p-1.5 rounded-lg text-xs transition-colors ${
                    isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span className="text-[10px] font-mono font-bold">{sidebarWidth > 450 ? '‹|›' : '›|‹'}</span>
                </button>

                {/* Collapse Sidebar Button */}
                <button
                  onClick={() => setIsRightPanelOpen(false)}
                  title="Collapse sidebar"
                  className={`p-1.5 rounded-lg transition-colors ${
                    isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {activeRightTab === 'shots' ? <ShotListPanel /> : <InspectorPanel />}
            </div>
          </aside>
        ) : (
          /* Collapsed Reopen Button */
          <button
            onClick={() => setIsRightPanelOpen(true)}
            title="Expand Shot List & Inspector"
            className={`absolute right-0 top-16 z-30 p-2 border-l border-t border-b rounded-l-xl shadow-xl flex items-center gap-1.5 transition-colors ${
              isLight ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100' : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            <Film className="w-3.5 h-3.5 text-sky-500" />
          </button>
        )}
      </div>

      {/* 3. Modals */}
      <ViewfinderModal />
      <PrintableShotPlan />
    </div>
  );
};

export default function App() {
  return (
    <FloorPlanProvider>
      <MainLayout />
    </FloorPlanProvider>
  );
}
