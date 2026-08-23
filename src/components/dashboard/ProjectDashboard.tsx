import React, { useRef, useState } from 'react';
import {
  Camera,
  Clapperboard,
  Copy,
  Download,
  FileText,
  FolderOpen,
  History,
  Layers,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { listUnreadableProjects, readProject } from '../../utils/projectLibrary';
import { WORKSPACE_PRESETS, getPreset, type WorkspacePresetId } from '../../domain/workspace';
import { BRANDING } from '../../config/branding';
import { exportProjectPackage, importProjectPackageAssets, parseProjectPackage } from '../../utils/projectPackage';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

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
    restoreRevision,
    theme,
  } = useFloorPlan();

  const isLight = theme === 'light';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTitle, setNewTitle] = useState('');
  const [startWithSamples, setStartWithSamples] = useState(false);
  // Read on every render rather than memoised: it is a Map spread, and the
  // registry is filled by readProject as the library hydrates, so any memo key
  // would be a guess about when that finished.
  const unreadable = isDashboardOpen ? listUnreadableProjects() : [];
  const [presetId, setPresetId] = useState<WorkspacePresetId>('shot_planning');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** Project whose revisions list is open (null = closed). */
  const [revisionsProjectId, setRevisionsProjectId] = useState<string | null>(null);
  /** Revision id awaiting restore confirmation. */
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  // The revisions list is the one true modal on this screen — it dims the
  // dashboard behind it — so keyboard focus has to stay inside it while open.
  const revisionsDialogRef = useDialogFocusTrap(revisionsProjectId !== null);

  if (!isDashboardOpen) return null;

  const handleCreate = () => {
    createNewProject({
      title: newTitle.trim() || 'Untitled production',
      withSampleScenes: startWithSamples,
      workspacePreset: presetId,
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
        if (parsed?.manifest?.formatVersion === 1) {
          // Project package (plan §5.2.2): re-register assets, then import.
          void (async () => {
            try {
              const { project, assets } = await parseProjectPackage(file);
              const count = await importProjectPackageAssets(assets);
              if (assets.length > 0) {
                alert(`Imported ${count}/${assets.length} attached media file(s).`);
              }
              loadProjectFromJson(project);
            } catch (err) {
              alert(`Package import failed: ${err instanceof Error ? err.message : 'unknown error'}`);
            }
          })();
        } else if (parsed?.setups?.length) loadProjectFromJson(parsed);
        else alert(`That file is not a ${BRANDING.productName} project.`);
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
    triggerDownload(blob, `${project.title.toLowerCase().replace(/\s+/g, '_')}_openshotdesigner.json`);
  };

  /** Full portable package: project + referenced assets (plan §5.2.2). */
  const downloadProjectPackage = (id: string) => {
    const project = readProject(id);
    if (!project) return;
    void exportProjectPackage(project).then((blob) => {
      triggerDownload(blob, `${project.title.toLowerCase().replace(/\s+/g, '_')}_package.json`);
    });
  };

  const revisionsProject = revisionsProjectId ? readProject(revisionsProjectId) : null;
  const revisionsList = revisionsProject?.revisions || [];

  const handleRestore = (revisionId: string) => {
    if (!revisionsProjectId) return;
    restoreRevision(revisionId, revisionsProjectId);
    setConfirmRestoreId(null);
    setRevisionsProjectId(null);
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
              aria-label="Back to the workspace"
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

          {/* Workspace preset (plan §1.2): configures module visibility only */}
          <div className="mt-4">
            <div className="text-[10px] font-bold uppercase tracking-wide opacity-60 mb-1.5">
              Workspace preset
            </div>
            <div className="flex flex-wrap gap-1.5">
              {WORKSPACE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setPresetId(preset.id)}
                  title={preset.description}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    presetId === preset.id
                      ? 'bg-sky-600 border-sky-500 text-white'
                      : isLight
                        ? 'border-slate-300 text-slate-600 hover:bg-slate-100'
                        : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className={`mt-2 text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              {getPreset(presetId).description} Presets only change which tools are shown — you can enable or hide modules at any time.
            </p>
          </div>
        </div>

        {/* Projects that exist but could not be migrated. Previously these were
            indistinguishable from "not found", so a production simply appeared
            to have vanished. The stored data is untouched; say so plainly. */}
        {unreadable.length > 0 && (
          <div
            className={`mb-4 rounded-2xl border p-4 ${
              isLight ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-amber-800 bg-amber-950/40 text-amber-100'
            }`}
          >
            <h2 className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
              <Clapperboard className="w-4 h-4" />
              {unreadable.length} project{unreadable.length === 1 ? '' : 's'} could not be opened
            </h2>
            <ul className="mt-2 space-y-1.5 text-xs">
              {unreadable.map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.title}</strong>
                  {entry.schemaVersion !== null && ` — saved with schema v${entry.schemaVersion}`}
                  <div className="opacity-80">{entry.message}</div>
                  {entry.issues.length > 0 && (
                    <ul className="mt-0.5 ml-4 list-disc opacity-70">
                      {entry.issues.slice(0, 4).map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] opacity-80">
              Nothing has been deleted or rewritten — the saved data is exactly as it was. This usually
              means the file came from a newer build.
            </p>
          </div>
        )}

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
                      aria-label="Rename"
                      className={ghostButton}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button onClick={() => duplicateProject(entry.id)} title="Duplicate" aria-label="Duplicate" className={ghostButton}>
                      <Copy className="w-3 h-3" />
                    </button>
                    <button onClick={() => downloadProject(entry.id)} title="Download project file" aria-label="Download project file" className={ghostButton}>
                      <Download className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => downloadProjectPackage(entry.id)}
                      title="Download package (project + attached media)"
                      aria-label="Download package (project + attached media)"
                      className={ghostButton}
                    >
                      <Package className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setRevisionsProjectId(entry.id);
                        setConfirmRestoreId(null);
                      }}
                      title="Named revisions"
                      aria-label="Named revisions"
                      className={ghostButton}
                    >
                      <History className="w-3 h-3" />
                      {(readProject(entry.id)?.revisions?.length || 0) > 0 && (
                        <span className="font-mono">{readProject(entry.id)?.revisions?.length}</span>
                      )}
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
                        aria-label="Delete project"
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

        {/* Revisions list for one project (named milestones, plan §13.2) */}
        {revisionsProject && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div
              className={`absolute inset-0 ${isLight ? 'bg-slate-950/40' : 'bg-black/60'}`}
              onClick={() => {
                setRevisionsProjectId(null);
                setConfirmRestoreId(null);
              }}
            />
            <div
              ref={revisionsDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-revisions-title"
              tabIndex={-1}
              className={`relative w-full max-w-md border rounded-2xl shadow-2xl p-4 ${panel}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h3 id="dashboard-revisions-title" className="text-sm font-bold flex items-center gap-1.5">
                    <History className="w-4 h-4 text-sky-500" /> Revisions — {revisionsProject.title}
                  </h3>
                  <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Named milestones of this production. Restoring keeps the revision history — a safety revision is saved first.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setRevisionsProjectId(null);
                    setConfirmRestoreId(null);
                  }}
                  title="Close"
                  aria-label="Close"
                  className={`p-1.5 rounded-lg border ${isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {revisionsList.length === 0 ? (
                <p className={`text-xs py-6 text-center ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  No revisions saved yet. Use “Save revision…” in the top bar to mark one.
                </p>
              ) : (
                <ul className="max-h-72 overflow-y-auto space-y-1.5">
                  {[...revisionsList].reverse().map((revision) => (
                    <li
                      key={revision.id}
                      className={`border rounded-xl px-3 py-2 flex items-center justify-between gap-2 ${
                        isLight ? 'border-slate-200' : 'border-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">{revision.name}</div>
                        <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                          {new Date(revision.createdAt).toLocaleString()}
                          {revision.note ? ` · ${revision.note}` : ''}
                        </div>
                      </div>
                      {confirmRestoreId === revision.id ? (
                        <span className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => handleRestore(revision.id)}
                            className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold"
                          >
                            Confirm
                          </button>
                          <button onClick={() => setConfirmRestoreId(null)} className={ghostButton}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmRestoreId(revision.id)}
                          title="Restore this revision"
                          className={`${ghostButton} flex-shrink-0`}
                        >
                          Restore
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
