import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Clapperboard,
  Cloud,
  Coffee,
  Copy,
  Download,
  FileText,
  FolderOpen,
  HardDrive,
  Heart,
  History,
  Layers,
  Package,
  Pencil,
  Plus,
  Server,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { APP_VERSION, SPONSOR_LINKS } from '../../config/version';
import { GOOGLE_DRIVE_CLIENT_ID_DEFAULT } from '../../config/cloud';
import { usePersistentUiState } from '../../utils/usePersistentUiState';
import { exportProjectPackageV2 } from '../../utils/projectPackageV2';
import {
  backupAgeText,
  backupIsStale,
  getLastBackupAt,
  recordBackup,
} from '../../utils/cloud/backupHistory';
import {
  isDriveUnauthorized,
  requestDriveAccessToken,
  revokeDriveAccessToken,
  uploadProjectToDrive,
} from '../../utils/cloud/googleDrive';
import {
  downloadWebdavPackage,
  isWebdavUnauthorized,
  listWebdavPackages,
  uploadWebdavPackage,
  type WebdavConfig,
  type WebdavFile,
} from '../../utils/cloud/webdav';
import { listUnreadableProjects, readProject } from '../../utils/projectLibrary';
import {
  MODULE_PICKER_GROUPS,
  PICKABLE_MODULES,
  WORKSPACE_PRESETS,
  getPreset,
  type ModuleId,
  type WorkspacePresetId,
} from '../../domain/workspace';
import { useDialogs } from '../dialog/DialogProvider';
import {
  applyAssetRemap,
  bindNativeProjectHandle,
  listRecentProjectFiles,
  openNativeProjectFile,
  parseProjectFileBytes,
  supportsNativeProjectOpen,
  type ParsedProjectFile,
} from '../../utils/nativeProjectFile';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';
import { downloadBlob, safeFileName } from '../../utils/download';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { saveNativeProjectFile } from '../../utils/nativeProjectFile';
import {
  deleteOrphanedAssets,
  inspectAssetStorage,
  type AssetStorageInspection,
} from '../../utils/assetStorageInspection';

const triggerDownload = (blob: Blob, filename: string) => downloadBlob(blob, filename);

/** localStorage key for the optionally remembered WebDAV password. */
const NC_PASSWORD_KEY = 'openshotdesigner_ui_cloud.webdav.password';

/** Human host for "Connected to …" (never the full credential path). */
const hostOf = (baseUrl: string): string => {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
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
  const { project, projects, activeProjectId, createNewProject, openProjectById, duplicateProject, renameProject, deleteProjectById, loadProjectFromJson, restoreRevision } = useFloorPlan();
  const { isDashboardOpen, closeDashboard, theme } = useWorkspaceUI();
  const { notice } = useDialogs();

  const isLight = theme === 'light';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTitle, setNewTitle] = useState('');
  const [startWithSamples, setStartWithSamples] = useState(false);
  // Read on every render rather than memoised: it is a Map spread, and the
  // registry is filled by readProject as the library hydrates, so any memo key
  // would be a guess about when that finished.
  const unreadable = isDashboardOpen ? listUnreadableProjects() : [];
  const [presetId, setPresetId] = useState<WorkspacePresetId>('shot_planning');
  /**
   * Module selection for the Custom preset. Seeded from whichever preset was
   * highlighted when Custom was picked, so "Narrative minus budget" is two
   * clicks rather than fifteen.
   */
  const [customModules, setCustomModules] = useState<ModuleId[]>(
    () => getPreset('shot_planning').enabledModules,
  );
  const chooseCustom = () => {
    setCustomModules(getPreset(presetId).enabledModules);
    setPresetId('custom');
  };
  const toggleCustomModule = (moduleId: ModuleId, enabled: boolean) => {
    setCustomModules((current) =>
      enabled ? [...new Set([...current, moduleId])] : current.filter((id) => id !== moduleId),
    );
  };
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  /** Project whose revisions list is open (null = closed). */
  const [revisionsProjectId, setRevisionsProjectId] = useState<string | null>(null);
  /** Revision id awaiting restore confirmation. */
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [storageOpen, setStorageOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [storageInspection, setStorageInspection] = useState<AssetStorageInspection | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [confirmStorageCleanup, setConfirmStorageCleanup] = useState(false);
  // Google Drive backup: the Client ID is a per-viewer preference (local,
  // never project data); the access token lives in memory only and dies
  // with the tab. No project state, no context growth.
  const [driveClientId, setDriveClientId] = usePersistentUiState('cloud.drive.clientId', '');
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveConnecting, setDriveConnecting] = useState(false);
  /** Project id currently uploading, or 'connect' while signing in. */
  const [driveBusyId, setDriveBusyId] = useState<string | null>(null);
  /** Last backup clock for the stale-backup reminder; refreshed on open and after every local backup. */
  const [backupAt, setBackupAt] = useState<string | null>(() => getLastBackupAt());
  const refreshBackupAge = () => setBackupAt(getLastBackupAt());
  useEffect(() => {
    if (isDashboardOpen) refreshBackupAge();
  }, [isDashboardOpen]);
  const [cloudTab, setCloudTab] = useState<'drive' | 'nextcloud'>('drive');
  // Nextcloud/WebDAV session: server and user are viewer preferences, the
  // password persists only on request, the live session is memory-only.
  const [ncUrl, setNcUrl] = usePersistentUiState('cloud.webdav.url', '');
  const [ncUser, setNcUser] = usePersistentUiState('cloud.webdav.username', '');
  const [ncRemember, setNcRemember] = usePersistentUiState('cloud.webdav.remember', false);
  const [ncPassword, setNcPassword] = useState<string>(() => {
    try {
      return localStorage.getItem('openshotdesigner_ui_cloud.webdav.remember') === 'true'
        ? (localStorage.getItem(NC_PASSWORD_KEY) ?? '')
        : '';
    } catch {
      return '';
    }
  });
  const [nextcloud, setNextcloud] = useState<WebdavConfig | null>(null);
  const [ncFiles, setNcFiles] = useState<WebdavFile[]>([]);
  const [ncBusy, setNcBusy] = useState(false);
  const [ncBusyFile, setNcBusyFile] = useState<string | null>(null);
  /** The owner's built-in ID wins unless a self-hoster typed their own. */
  const hasBuiltInClientId = GOOGLE_DRIVE_CLIENT_ID_DEFAULT.trim() !== '';
  const effectiveDriveClientId = driveClientId.trim() || GOOGLE_DRIVE_CLIENT_ID_DEFAULT.trim();
  // The revisions list is the one true modal on this screen — it dims the
  // dashboard behind it — so keyboard focus has to stay inside it while open.
  const revisionsDialogRef = useDialogFocusTrap(revisionsProjectId !== null);
  const storageDialogRef = useDialogFocusTrap(storageOpen);
  const driveDialogRef = useDialogFocusTrap(driveOpen);

  if (!isDashboardOpen) return null;

  const handleCreate = () => {
    createNewProject({
      title: newTitle.trim() || 'Untitled production',
      withSampleScenes: startWithSamples,
      workspacePreset: presetId,
      workspaceModules: presetId === 'custom' ? customModules : undefined,
    });
    setNewTitle('');
  };

  /** Commit a parsed file: register media, remap upgraded ids, load, optionally bind. */
  const commitParsedFile = async (
    parsed: ParsedProjectFile,
    bind?: { fileName: string; handle: unknown },
  ): Promise<void> => {
    const remapped = await parsed.importAssets();
    const finalProject = applyAssetRemap(parsed.project, remapped);
    const result = loadProjectFromJson(finalProject);
    if (!result.ok) {
      await notice({ title: 'Import failed', message: result.message });
      return;
    }
    if (bind) bindNativeProjectHandle(result.project.id, bind.fileName, bind.handle);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    // Read as bytes, not text: v2 packages are ZIP archives. Format is
    // sniffed from the content so a renamed file still imports correctly.
    void (async () => {
      try {
        await commitParsedFile(await parseProjectFileBytes(await file.arrayBuffer()));
      } catch (err) {
        await notice({
          title: 'Import failed',
          message: err instanceof Error ? err.message : 'unknown error',
        });
      }
    })();
    event.target.value = '';
  };

  /** Native Open…: pick a file with a bound handle so Ctrl+S writes back to it. */
  const handleNativeOpen = () => {
    void (async () => {
      try {
        const opened = await openNativeProjectFile();
        if (!opened) {
          // No File System Access API here — fall back to the classic input.
          fileInputRef.current?.click();
          return;
        }
        const remapped = opened.remapped;
        const finalProject = applyAssetRemap(opened.project, remapped);
        const result = loadProjectFromJson(finalProject);
        if (!result.ok) {
          await notice({ title: 'Import failed', message: result.message });
          return;
        }
        bindNativeProjectHandle(result.project.id, opened.fileName, opened.handle);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        await notice({
          title: 'Import failed',
          message: err instanceof Error ? err.message : 'unknown error',
        });
      }
    })();
  };

  const downloadProject = (id: string) => {
    const project = readProject(id);
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `${safeFileName(project.title, 'project').toLowerCase()}_openshotdesigner.json`);
    recordBackup();
    refreshBackupAge();
  };

  /** Full portable package: project + referenced assets (plan §5.2.2). */
  const downloadProjectPackage = (id: string) => {
    const project = readProject(id);
    if (!project) return;
    // Library exports must not steal Ctrl+S's binding from the open workspace.
    // saveNativeProjectFile stamps the backup clock itself on success.
    void saveNativeProjectFile(project, { saveAs: true, bindHandle: false })
      .then(() => refreshBackupAge())
      .catch((error) => {
      if ((error as Error)?.name !== 'AbortError') {
        void notice({
          title: 'Project save failed',
          message: error instanceof Error ? error.message : 'unknown error',
        });
      }
    });
  };

  const connectDrive = async () => {
    setDriveConnecting(true);
    try {
      setDriveToken(await requestDriveAccessToken(effectiveDriveClientId));
    } catch (error) {
      await notice({
        title: 'Google Drive',
        message: error instanceof Error ? error.message : 'Sign-in failed.',
      });
    } finally {
      setDriveConnecting(false);
    }
  };

  const disconnectDrive = () => {
    if (driveToken) void revokeDriveAccessToken(driveToken);
    setDriveToken(null);
  };

  /** One-way backup of a project package to the user's Drive. */
  const uploadProjectToDriveHandler = async (id: string) => {
    if (!driveToken) {
      await notice({ title: 'Google Drive', message: 'Open the Google button above first to connect.' });
      return;
    }
    const stored = readProject(id);
    if (!stored) return;
    setDriveBusyId(id);
    try {
      const packageBlob = await exportProjectPackageV2(stored);
      const fileName = `${safeFileName(stored.title, 'project').toLowerCase()}.osd`;
      const attempt = (token: string) => uploadProjectToDrive({ accessToken: token, fileName, packageBlob });
      try {
        const ref = await attempt(driveToken);
        recordBackup();
        refreshBackupAge();
        await notice({ title: 'Saved to Google Drive', message: `${ref.name} is now in your Drive folder OpenShotDesigner.` });
      } catch (error) {
        // One silent retry: the hour-long token may have expired between visits.
        if (!isDriveUnauthorized(error)) throw error;
        const fresh = await requestDriveAccessToken(effectiveDriveClientId, { silent: true });
        setDriveToken(fresh);
        const ref = await attempt(fresh);
        recordBackup();
        refreshBackupAge();
        await notice({ title: 'Saved to Google Drive', message: `${ref.name} is now in your Drive folder OpenShotDesigner.` });
      }
    } catch (error) {
      if (isDriveUnauthorized(error)) setDriveToken(null);
      await notice({
        title: 'Google Drive upload failed',
        message: error instanceof Error ? error.message : 'The upload could not be completed.',
      });
    } finally {
      setDriveBusyId(null);
    }
  };

  const refreshNcFileList = async (config: WebdavConfig = {
    baseUrl: ncUrl,
    username: ncUser,
    password: ncPassword,
  }): Promise<void> => {
    setNcBusy(true);
    try {
      setNcFiles(await listWebdavPackages(config));
    } catch (error) {
      await notice({
        title: 'Nextcloud',
        message: error instanceof Error ? error.message : 'The file list could not be loaded.',
      });
    } finally {
      setNcBusy(false);
    }
  };

  const connectNextcloud = async () => {
    setNcBusy(true);
    try {
      const config: WebdavConfig = { baseUrl: ncUrl, username: ncUser, password: ncPassword };
      const files = await listWebdavPackages(config);
      setNextcloud(config);
      setNcFiles(files);
      try {
        if (ncRemember) localStorage.setItem(NC_PASSWORD_KEY, ncPassword);
        else localStorage.removeItem(NC_PASSWORD_KEY);
      } catch {
        // Convenience only — the session works without it.
      }
    } catch (error) {
      await notice({
        title: 'Nextcloud',
        message: error instanceof Error ? error.message : 'Sign-in failed.',
      });
    } finally {
      setNcBusy(false);
    }
  };

  const disconnectNextcloud = () => {
    setNextcloud(null);
    setNcFiles([]);
    if (!ncRemember) setNcPassword('');
  };

  /** One-way backup of a project package to the connected WebDAV server. */
  const uploadProjectToNextcloud = async (id: string) => {
    if (!nextcloud) {
      await notice({ title: 'Nextcloud', message: 'Open the cloud dialog (Google button above) and connect Nextcloud first.' });
      return;
    }
    const stored = readProject(id);
    if (!stored) return;
    setDriveBusyId(id);
    try {
      const packageBlob = await exportProjectPackageV2(stored);
      const fileName = `${safeFileName(stored.title, 'project').toLowerCase()}.osd`;
      await uploadWebdavPackage(nextcloud, fileName, packageBlob);
      recordBackup();
      refreshBackupAge();
      await refreshNcFileList(nextcloud);
      await notice({ title: 'Saved to Nextcloud', message: `${fileName} is now in the OpenShotDesigner folder.` });
    } catch (error) {
      if (isWebdavUnauthorized(error)) setNextcloud(null);
      await notice({
        title: 'Nextcloud upload failed',
        message: error instanceof Error ? error.message : 'The upload could not be completed.',
      });
    } finally {
      setDriveBusyId(null);
    }
  };

  /** Restore a server backup into this browser, through the file-import path. */
  const importWebdavFile = async (file: WebdavFile) => {
    if (!nextcloud) return;
    setNcBusyFile(file.name);
    try {
      const blob = await downloadWebdavPackage(nextcloud, file.name);
      await commitParsedFile(await parseProjectFileBytes(await blob.arrayBuffer()));
      await notice({ title: 'Imported from Nextcloud', message: `${file.name} is now a project in this browser.` });
    } catch (error) {
      await notice({
        title: 'Import failed',
        message: error instanceof Error ? error.message : 'unknown error',
      });
    } finally {
      setNcBusyFile(null);
    }
  };

  const revisionsProject = revisionsProjectId ? readProject(revisionsProjectId) : null;  const revisionsList = revisionsProject?.revisions || [];

  const handleRestore = (revisionId: string) => {
    if (!revisionsProjectId) return;
    restoreRevision(revisionId, revisionsProjectId);
    setConfirmRestoreId(null);
    setRevisionsProjectId(null);
  };

  const scanStorage = async () => {
    setStorageBusy(true);
    try {
      const saved = projects
        .map((entry) => (entry.id === project.id ? project : readProject(entry.id)))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      setStorageInspection(await inspectAssetStorage(saved));
    } finally {
      setStorageBusy(false);
    }
  };

  const openStorage = () => {
    setStorageOpen(true);
    setConfirmStorageCleanup(false);
    void scanStorage();
  };

  const cleanStorage = async () => {
    if (!storageInspection?.orphanedIds.length) return;
    setStorageBusy(true);
    try {
      await deleteOrphanedAssets(storageInspection.orphanedIds);
      setConfirmStorageCleanup(false);
      await scanStorage();
    } finally {
      setStorageBusy(false);
    }
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDriveOpen(true)}
              title={driveToken ? 'Google Drive: connected — manage backup' : 'Google Drive backup: sign in and save .osd packages'}
              aria-label="Google Drive backup"
              className={`px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'border-slate-300 hover:bg-slate-200' : 'border-slate-700 hover:bg-slate-800'}`}
            >
              <Cloud className={`w-4 h-4 ${driveToken ? 'text-emerald-500' : 'text-sky-500'}`} /> Google
              {driveToken && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />}
            </button>
            <button
              onClick={openStorage}
              title="Inspect browser media storage"
              className={`px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'border-slate-300 hover:bg-slate-200' : 'border-slate-700 hover:bg-slate-800'}`}
            >
              <HardDrive className="w-4 h-4" /> Storage
            </button>
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
            {supportsNativeProjectOpen() && (
              <button
                onClick={handleNativeOpen}
                title="Open a .osd file with write-back: Ctrl+S saves into the same file"
                className={`${ghostButton} justify-center py-2`}
              >
                <FolderOpen className="w-3.5 h-3.5" /> Open…
              </button>
            )}
            <input ref={fileInputRef} type="file" accept=".osd,.json,application/json" onChange={handleImport} className="hidden" />
          </div>
          {listRecentProjectFiles().length > 0 && (
            <div className="mt-3 text-[11px] opacity-80">
              <span className="font-bold uppercase tracking-wide text-[10px]">Recent files: </span>
              {listRecentProjectFiles().map((entry) => (
                <button
                  key={`${entry.fileName}-${entry.savedAt}`}
                  onClick={handleNativeOpen}
                  title={`Locate ${entry.fileName} (${formatUpdated(entry.savedAt)})`}
                  className="underline underline-offset-2 hover:opacity-100 mr-3"
                >
                  {entry.fileName}
                </button>
              ))}
            </div>
          )}
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
                  onClick={() => (preset.id === 'custom' ? chooseCustom() : setPresetId(preset.id))}
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
            {presetId === 'custom' && (
              <div
                className={`mt-2.5 rounded-lg border p-2.5 ${
                  isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide opacity-60">
                    Modules to show
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCustomModules(PICKABLE_MODULES.map((module) => module.id))}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        isLight ? 'border-slate-300 hover:bg-slate-200' : 'border-slate-600 hover:bg-slate-800'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomModules([])}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        isLight ? 'border-slate-300 hover:bg-slate-200' : 'border-slate-600 hover:bg-slate-800'
                      }`}
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                  {MODULE_PICKER_GROUPS.map((group) => (
                    <section key={group.label}>
                      <div className="text-[9px] font-black uppercase tracking-[0.14em] opacity-40 mb-1">
                        {group.label}
                      </div>
                      {group.modules.map((module) => (
                        <label
                          key={module.id}
                          className="flex items-center gap-1.5 cursor-pointer text-[11px] min-w-0 py-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={customModules.includes(module.id)}
                            onChange={(event) => toggleCustomModule(module.id, event.target.checked)}
                            className="rounded accent-sky-500 w-3.5 h-3.5 cursor-pointer flex-shrink-0"
                          />
                          <span className="truncate">{module.label}</span>
                        </label>
                      ))}
                    </section>
                  ))}
                </div>
                <p className={`mt-2 text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  The floor plan and Inspector are always available.
                </p>
              </div>
            )}
            <p className={`mt-2 text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
              {getPreset(presetId).description} Presets only change which tools are shown — you can enable or hide modules at any time.
            </p>
          </div>
        </div>

        {/* Cloud export lives behind the Google button in the header now. */}

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
        {projects.length > 0 && backupIsStale(backupAt) && (
          <div
            className={`mb-4 rounded-2xl border p-3.5 flex items-center gap-2.5 ${
              isLight ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-amber-800 bg-amber-950/40 text-amber-100'
            }`}
          >
            <History className="w-4 h-4 flex-shrink-0" />
            <p className="text-xs">
              <strong>Last backup {backupAgeText(backupAt)}.</strong> Your productions live in this browser
              only — use a project's package, file or cloud button below to back them up.
            </p>
          </div>
        )}
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
                      title="Save .osd project (including attached media)"
                      aria-label="Save .osd project (including attached media)"
                      className={ghostButton}
                    >
                      <Package className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => void uploadProjectToDriveHandler(entry.id)}
                      disabled={!driveToken || driveBusyId !== null}
                      title={driveToken ? 'Save .osd project to Google Drive' : 'Connect Google Drive in the cloud dialog first'}
                      aria-label="Save .osd project to Google Drive"
                      className={`${ghostButton} disabled:opacity-40`}
                    >
                      <Upload className="w-3 h-3" />{driveBusyId === entry.id ? '…' : ''}
                    </button>
                    <button
                      onClick={() => void uploadProjectToNextcloud(entry.id)}
                      disabled={!nextcloud || driveBusyId !== null}
                      title={nextcloud ? 'Save .osd project to Nextcloud' : 'Connect Nextcloud in the cloud dialog first'}
                      aria-label="Save .osd project to Nextcloud"
                      className={`${ghostButton} disabled:opacity-40`}
                    >
                      <Server className="w-3 h-3" />{driveBusyId === entry.id ? '…' : ''}
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

        {/* Release footer: version, licence, discrete support links. */}
        <footer
          className={`mt-8 pt-4 border-t flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] ${
            isLight ? 'border-slate-200 text-slate-400' : 'border-slate-800 text-slate-500'
          }`}
        >
          <span className="font-mono">Open Shot Designer v{APP_VERSION}</span>
          <span aria-hidden="true">·</span>
          <span>Free &amp; open source (GPL-3.0)</span>
          <span aria-hidden="true">·</span>
          <a
            href={SPONSOR_LINKS.github}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 hover:underline"
          >
            <Heart className="w-3 h-3" /> Sponsor
          </a>
          <span aria-hidden="true">·</span>
          <a
            href={SPONSOR_LINKS.coffee}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 hover:underline"
          >
            <Coffee className="w-3 h-3" /> Buy me a coffee
          </a>
        </footer>

        {/* Google Drive backup: manual one-way .osd export. Backup dialog,
            not sync: nothing uploads itself. */}
        {driveOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div
              className={`absolute inset-0 ${isLight ? 'bg-slate-950/40' : 'bg-black/60'}`}
              onClick={() => setDriveOpen(false)}
            />
            <div
              ref={driveDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-drive-title"
              tabIndex={-1}
              className={`relative w-full max-w-lg border rounded-2xl shadow-2xl p-4 ${panel}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="dashboard-drive-title" className="text-sm font-bold flex items-center gap-1.5">
                    <Cloud className="w-4 h-4 text-sky-500" /> Cloud backup
                  </h3>
                  <p className={`text-[11px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Manual one-way .osd backups — Google Drive or your own Nextcloud/WebDAV server.
                    Re-saving refreshes its file. Needs internet; everything else keeps working offline.
                  </p>
                  <div className="flex gap-1.5 mt-2.5" role="tablist" aria-label="Cloud provider">
                    <button
                      role="tab"
                      aria-selected={cloudTab === 'drive'}
                      onClick={() => setCloudTab('drive')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                        cloudTab === 'drive'
                          ? 'bg-sky-600 text-white'
                          : isLight ? 'border border-slate-300 text-slate-600 hover:bg-slate-100' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Cloud className="w-3.5 h-3.5" /> Google Drive
                    </button>
                    <button
                      role="tab"
                      aria-selected={cloudTab === 'nextcloud'}
                      onClick={() => setCloudTab('nextcloud')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
                        cloudTab === 'nextcloud'
                          ? 'bg-sky-600 text-white'
                          : isLight ? 'border border-slate-300 text-slate-600 hover:bg-slate-100' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Server className="w-3.5 h-3.5" /> Nextcloud
                    </button>
                  </div>
                </div>
                <button onClick={() => setDriveOpen(false)} aria-label="Close cloud backup" className={ghostButton}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {cloudTab === 'drive' && (
              <div className="mt-4">
                {driveToken ? (
                  <button onClick={disconnectDrive} className={`${ghostButton} justify-center py-2 w-fit`} title="Sign out of Google Drive on this browser">
                    <Cloud className="w-3.5 h-3.5" /> Connected — disconnect
                  </button>
                ) : hasBuiltInClientId ? (
                  <button
                    onClick={() => void connectDrive()}
                    disabled={driveConnecting}
                    className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-1.5 w-fit"
                    title="Sign in with Google"
                  >
                    <Cloud className="w-4 h-4" /> {driveConnecting ? 'Connecting…' : 'Connect with Google'}
                  </button>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <input
                      value={driveClientId}
                      onChange={(event) => setDriveClientId(event.target.value.trim())}
                      placeholder="Google OAuth Client ID (see setup steps)"
                      aria-label="Google OAuth Client ID"
                      className={`${field} sm:flex-1 font-mono text-xs`}
                    />
                    <button
                      onClick={() => void connectDrive()}
                      disabled={driveConnecting || effectiveDriveClientId === ''}
                      className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
                      title={effectiveDriveClientId === '' ? 'Enter your OAuth Client ID first' : 'Sign in with Google'}
                    >
                      <Cloud className="w-4 h-4" /> {driveConnecting ? 'Connecting…' : 'Connect'}
                    </button>
                  </div>
                )}

              <details className={`mt-3 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                <summary className="cursor-pointer font-semibold hover:underline w-fit">
                  {hasBuiltInClientId ? 'Self-hosting? Use your own Client ID' : 'One-time setup: get your own Client ID'}
                </summary>
                {hasBuiltInClientId ? (
                  <div className="mt-1.5 space-y-2">
                    <p>This copy comes with sign-in ready. Only if you host the app yourself (own domain),
                      register your own OAuth Client ID — origins are bound to it — and paste it here:</p>
                    <input
                      value={driveClientId}
                      onChange={(event) => setDriveClientId(event.target.value.trim())}
                      placeholder="Your own Google OAuth Client ID (overrides the built-in one)"
                      aria-label="Own Google OAuth Client ID"
                      className={`${field} font-mono text-xs`}
                    />
                  </div>
                ) : (
                  <ol className="mt-1.5 ml-4 list-decimal space-y-1">
                    <li>Open the Google Cloud Console → APIs &amp; Services → Credentials.</li>
                    <li>Create Credentials → OAuth client ID → application type “Web application”.</li>
                    <li>Under Authorized JavaScript origins add this site's address (and http://localhost:3000 for local use).</li>
                    <li>Enable the Google Drive API under APIs &amp; Services → Library.</li>
                    <li>Paste the Client ID above and press Connect. The app only ever asks for access to files it created itself.</li>
                  </ol>
                )}
              </details>

              <p className={`mt-3 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Connected? Close this window and press the upload button on any production below.
              </p>
              </div>
              )}

              {cloudTab === 'nextcloud' && (
              <div className="mt-4">
                {nextcloud ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] font-semibold flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                      <Server className="w-3.5 h-3.5 text-emerald-500" /> Connected to {hostOf(nextcloud.baseUrl)}
                    </span>
                    <button onClick={() => void refreshNcFileList()} disabled={ncBusy} className={ghostButton}>
                      {ncBusy ? 'Refreshing…' : 'Refresh'}
                    </button>
                    <button onClick={disconnectNextcloud} className={ghostButton} title="Forget this server on this browser">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      value={ncUrl}
                      onChange={(event) => setNcUrl(event.target.value.trim())}
                      placeholder="Server address, e.g. https://cloud.example.com/remote.php/dav/files/alex"
                      aria-label="Nextcloud server address"
                      className={`${field} font-mono text-xs`}
                    />
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={ncUser}
                        onChange={(event) => setNcUser(event.target.value)}
                        placeholder="User name"
                        aria-label="Nextcloud user name"
                        autoComplete="username"
                        className={`${field} sm:flex-1 text-xs`}
                      />
                      <input
                        type="password"
                        value={ncPassword}
                        onChange={(event) => setNcPassword(event.target.value)}
                        placeholder="Password or app password"
                        aria-label="Nextcloud password or app password"
                        autoComplete="current-password"
                        className={`${field} sm:flex-1 font-mono text-xs`}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => void connectNextcloud()}
                        disabled={ncBusy || ncUrl.trim() === '' || ncUser === '' || ncPassword === ''}
                        className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
                        title="Connect to Nextcloud"
                      >
                        <Server className="w-4 h-4" /> {ncBusy ? 'Connecting…' : 'Connect'}
                      </button>
                      <label className={`flex items-center gap-1.5 text-[11px] cursor-pointer ${isLight ? 'text-slate-500' : 'text-slate-400'}`} title="Keep the password in this browser for next time">
                        <input
                          type="checkbox"
                          checked={ncRemember}
                          onChange={(event) => setNcRemember(event.target.checked)}
                          className="accent-sky-600"
                        />
                        Remember password
                      </label>
                    </div>
                  </div>
                )}

                {nextcloud && (
                  <div className="mt-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide opacity-60 mb-1.5">
                      Backups on this server {ncFiles.length > 0 && `(${ncFiles.length})`}
                    </div>
                    {ncFiles.length === 0 ? (
                      <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Nothing here yet — press the server button on a production below to save its first backup.
                      </p>
                    ) : (
                      <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                        {ncFiles.map((file) => (
                          <li
                            key={file.href}
                            className={`border rounded-xl px-3 py-2 flex items-center justify-between gap-2 ${
                              isLight ? 'border-slate-200' : 'border-slate-800'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">{file.name}</div>
                              {file.size !== undefined && (
                                <div className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                                  {formatBytes(file.size)}
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => void importWebdavFile(file)}
                              disabled={ncBusyFile !== null}
                              title={`Import ${file.name} as a project in this browser`}
                              className={`${ghostButton} flex-shrink-0 disabled:opacity-40`}
                            >
                              <Download className="w-3 h-3" /> {ncBusyFile === file.name ? 'Importing…' : 'Import'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <details className={`mt-3 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  <summary className="cursor-pointer font-semibold hover:underline w-fit">
                    Where is the address? Use an app password
                  </summary>
                  <div className="mt-1.5 space-y-1">
                    <p>Nextcloud: Files app → Settings → “Copy WebDAV address” (ends in <span className="font-mono">/dav/files/&lt;you&gt;</span>). Then Personal settings → Security → Devices &amp; sessions → Create an app password — your main password stays out of this browser.</p>
                    <p>Plain WebDAV shares work too: anything answering PROPFIND/PUT/GET with Basic auth.</p>
                  </div>
                </details>

                <p className={`mt-3 text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  To save: close this window and press the server button on any production below. To restore: press Import beside a backup.
                </p>
              </div>
              )}
            </div>
          </div>
        )}

        {storageOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <div
              className={`absolute inset-0 ${isLight ? 'bg-slate-950/40' : 'bg-black/60'}`}
              onClick={() => setStorageOpen(false)}
            />
            <div
              ref={storageDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-storage-title"
              tabIndex={-1}
              className={`relative w-full max-w-lg border rounded-2xl shadow-2xl p-4 ${panel}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id="dashboard-storage-title" className="text-sm font-bold flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4 text-sky-500" /> Browser media storage
                  </h3>
                  <p className={`text-[11px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Checks attached media against every saved project. Cleanup never removes a file still referenced by a project.
                  </p>
                </div>
                <button onClick={() => setStorageOpen(false)} aria-label="Close storage inspector" className={ghostButton}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {storageBusy && !storageInspection ? (
                <p className="py-8 text-center text-xs opacity-60">Scanning media…</p>
              ) : storageInspection ? (
                <>
                  <div className="grid grid-cols-3 gap-2 my-4">
                    {[
                      ['Stored', formatBytes(storageInspection.storedBytes)],
                      ['In projects', formatBytes(storageInspection.referencedBytes)],
                      ['Orphaned', formatBytes(storageInspection.orphanedBytes)],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-xl border p-2.5 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/50'}`}>
                        <div className="text-[9px] font-bold uppercase opacity-50">{label}</div>
                        <div className="text-sm font-mono font-bold mt-0.5">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className={`rounded-xl border p-3 text-xs ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                    <div className="flex justify-between gap-3"><span>Stored files</span><strong>{storageInspection.assets.length}</strong></div>
                    <div className="flex justify-between gap-3 mt-1"><span>Unreferenced files</span><strong>{storageInspection.orphanedIds.length}</strong></div>
                    <div className={`flex justify-between gap-3 mt-1 ${storageInspection.missingIds.length ? 'text-rose-500' : ''}`}>
                      <span>Missing referenced files</span><strong>{storageInspection.missingIds.length}</strong>
                    </div>
                  </div>
                  {storageInspection.missingIds.length > 0 && (
                    <p className="mt-3 text-[11px] text-rose-500">
                      Some project media is missing. Export a package from a device that still has the files, then import it here.
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <button onClick={() => void scanStorage()} disabled={storageBusy} className={ghostButton}>
                      {storageBusy ? 'Scanning…' : 'Scan again'}
                    </button>
                    {storageInspection.orphanedIds.length > 0 && (
                      confirmStorageCleanup ? (
                        <span className="flex items-center gap-1.5">
                          <span className="text-[10px] opacity-60">Delete {storageInspection.orphanedIds.length} file(s)?</span>
                          <button onClick={() => void cleanStorage()} disabled={storageBusy} className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold">Delete</button>
                          <button onClick={() => setConfirmStorageCleanup(false)} className={ghostButton}>Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmStorageCleanup(true)} className={`${ghostButton} text-rose-500`}>
                          <Trash2 className="w-3 h-3" /> Clean orphaned media
                        </button>
                      )
                    )}
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-xs text-rose-500">Storage could not be inspected.</p>
              )}
            </div>
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
