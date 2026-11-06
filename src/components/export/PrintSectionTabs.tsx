import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
export function PrintSectionTabs() {
  const { exportSection, setExportSection } = useWorkspaceUI();
  return (<>
          {/* Section Mode Segmented Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setExportSection('floorplan')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'floorplan'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Floor Plan Blueprint
            </button>
            <button
              onClick={() => setExportSection('shotlist')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'shotlist'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Shot List
            </button>
            <button
              onClick={() => setExportSection('storyboard')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'storyboard'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Storyboard
            </button>
            <button
              onClick={() => setExportSection('linedscript')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'linedscript'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Lined Script
            </button>
            <button
              onClick={() => setExportSection('avscript')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'avscript'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              AV Script
            </button>
            <button
              onClick={() => setExportSection('sides')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'sides'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Script Sides
            </button>
            <button
              onClick={() => setExportSection('scriptreports')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'scriptreports'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Script Reports
            </button>
            <button
              onClick={() => setExportSection('dmx')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'dmx'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              DMX Patch
            </button>
            <button
              onClick={() => setExportSection('crew')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'crew'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Contact List
            </button>
            <button
              onClick={() => setExportSection('equipment')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'equipment'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Equipment List
            </button>
            <button
              onClick={() => setExportSection('power')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'power'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Power Plan
            </button>
            <button
              onClick={() => setExportSection('rigging')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'rigging'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Rigging Plot
            </button>
            <button
              onClick={() => setExportSection('logistics')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'logistics'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Load List
            </button>
            <button
              onClick={() => setExportSection('continuity')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'continuity'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Continuity
            </button>
            <button
              onClick={() => setExportSection('camerareport')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'camerareport'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Camera Report
            </button>
            <button
              onClick={() => setExportSection('soundreport')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'soundreport'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sound Report
            </button>
            <button
              onClick={() => setExportSection('dailyprogress')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'dailyprogress'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Daily Report
            </button>
            <button
              onClick={() => setExportSection('runofshow')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'runofshow'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Run of Show
            </button>
            <button
              onClick={() => setExportSection('moodboard')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'moodboard'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mood Board
            </button>
            <button
              onClick={() => setExportSection('combined')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                exportSection === 'combined'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Complete Package
            </button>
          </div>


</>);
}
