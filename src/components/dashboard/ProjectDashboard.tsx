import React, { useRef, useState } from 'react';
import {
  Camera,
  Clapperboard,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Layers,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { readProject } from '../../utils/projectLibrary';

const formatUpdated = (iso: string): string => {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
};

/**
 * Project dashboard: start a new production, or pick up an older one. Shown on
 * first run and whenever the user opens "Projects" from the top bar.
 */
export const ProjectDashboard: React.FC = () => {
  const {
    projects,
    activeProjectId,
    isDashboardOpen,
    closeDashboard,
    createNewProject,
    openProjectById,
    duplicateProject,
    renameProject,
    deleteProjectById,
    loadProjectFromJson,
    theme,
  } = useFloorPlan();

  const isLight = theme === 'light';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTitle, setNewTitle] = useState('');
  const [startWithSamples, setStartWithSamples] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!isDashboardOpen) return null;

  const handleCreate = () => {
    createNewProject({
      title: newTitle.trim() || 'Untitled production',
      withSampleScenes: startWithSamples,
    });
    setNewTitle('');
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed?.setups?.length) loadProjectFromJson(parsed);
        else alert('That file is not an Open Shot Designer project.');
      } catch {
        alert('That file could not be read as a project.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const downloadProject = (id: string) => {
    const project = readProject(id);
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${project.title.toLowerCase().replace(/\s+/g, '_')}_openshotdesigner.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const panel = isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-slate-900 border-slate-800 text-slate-100';
  const field = `w-full rounded-lg border px-2.5 py-2 text-sm ${
    isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'
  }`;
  const ghostButton = `px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors ${
    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
  }`;

  return (
    <div
      id="project-dashboard"
      className={`fixed inset-0 z-[70] overflow-y-auto ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}
    >
      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-sky-500/15 text-sky-500 border border-sky-500/30">
              <Clapperboard className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight uppercase">Your productions</h1>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Start a new project, or pick up where you left off. Everything is saved in this browser.
              </p>
            </div>
          </div>

          {projects.length > 0 && (
            <button
              onClick={closeDashboard}
              title="Back to the workspace"
              className={`p-2 rounded-lg border ${isLight ? 'border-slate-300 hover:bg-slate-200' : 'border-slate-700 hover:bg-slate-800'}`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* New project */}
        <div className={`border rounded-2xl p-4 mb-6 shadow-sm ${panel}`}>
          <h2 className="text-xs font-bold uppercase tracking-wide mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-sky-500" /> New project
          </h2>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreate();
              }}
              placeholder="Production title (e.g. The Long Walk Home)"
              className={`${field} sm:flex-1`}
            />
            <button
              onClick={handleCreate}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Create
            </button>
            <button onClick={() => fileInputRef.current?.click()} className={`${ghostButton} justify-center py-2`}>
              <FolderOpen className="w-3.5 h-3.5" /> Import project file
            </button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-[11px] cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={startWithSamples}
              onChange={(event) => setStartWithSamples(event.target.checked)}
              className="accent-sky-600"
            />
            <span className={isLight ? 'text-slate-600' : 'text-slate-300'}>
              Start with the example scenes (dialogue coverage + noir interrogation) instead of an empty stage
            </span>
          </label>
        </div>

        {/* Saved projects */}
        <h2 className="text-xs font-bold uppercase tracking-wide mb-2 opacity-70">
          Saved projects {projects.length > 0 && `(${projects.length})`}
        </h2>

        {projects.length === 0 ? (
          <div
            className={`border border-dashed rounded-2xl p-10 text-center ${
              isLight ? 'border-slate-300 bg-white text-slate-500' : 'border-slate-700 text-slate-400'
            }`}
          >
            <Clapperboard className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-semibold">No projects yet</p>
            <p className="text-xs mt-1">Name your production above and press Create to get started.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((entry) => {
              const isActive = entry.id === activeProjectId;
              return (
                <div
                  key={entry.id}
                  className={`border rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-sm transition-colors ${panel} ${
                    isActive ? 'ring-2 ring-sky-500/60' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    {renamingId === entry.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onBlur={() => {
                          renameProject(entry.id, renameValue);
                          setRenamingId(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            renameProject(entry.id, renameValue);
                            setRenamingId(null);
                          }
                          if (event.key === 'Escape') setRenamingId(null);
                        }}
                        className={`${field} py-1 text-sm font-semibold`}
                      />
                    ) : (
                      <button
                        onClick={() => openProjectById(entry.id)}
                        className="text-left font-bold text-sm leading-snug hover:text-sky-500 transition-colors"
                      >
                        {entry.title}
                      </button>
                    )}
                    {isActive && (
                      <span className="px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-500 text-[9px] font-bold uppercase flex-shrink-0">
                        Open
                      </span>
                    )}
                  </div>

                  <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    <span className="flex items-center gap-1">
                      <Layers className="w-3 h-3" /> {entry.setupCount} scene{entry.setupCount === 1 ? '' : 's'}
                    </span>
                    <span className="flex items-center gap-1">
                      <Camera className="w-3 h-3" /> {entry.shotCount} shot{entry.shotCount === 1 ? '' : 's'}
                    </span>
                    {entry.hasScript && (
                      <span className="flex items-center gap-1 text-violet-500">
                        <FileText className="w-3 h-3" /> script
                      </span>
                    )}
                  </div>
                  <p className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                    {entry.director ? `${entry.director} · ` : ''}saved {formatUpdated(entry.updatedAt)}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-1">
                    <button
                      onClick={() => openProjectById(entry.id)}
                      className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold"
                    >
                      {isActive ? 'Continue' : 'Open'}
                    </button>
                    <button
                      onClick={() => {
                        setRenamingId(entry.id);
                        setRenameValue(entry.title);
                      }}
                      title="Rename"
                      className={ghostButton}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => duplicateProject(entry.id)} title="Duplicate" className={ghostButton}>
                      <Copy className="w-3 h-3" />
                    </button>
                    <button onClick={() => downloadProject(entry.id)} title="Download project file" className={ghostButton}>
                      <Download className="w-3 h-3" />
                    </button>

                    {confirmDeleteId === entry.id ? (
                      <span className="flex items-center gap-1 ml-auto">
                        <button
                          onClick={() => {
                            deleteProjectById(entry.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold"
                        >
                          Delete
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className={ghostButton}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(entry.id)}
                        title="Delete project"
                        className={`${ghostButton} ml-auto text-rose-500`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
