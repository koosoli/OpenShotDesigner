/**
 * Which panel is open, which theme is on — the state of the workspace itself.
 *
 * This is the boundary rule 38 asks for, and it was the one `FloorPlanContext`
 * did not draw. Everything here describes **this browser tab right now**:
 * nothing in it belongs to a production, nothing in it should ever be sent to
 * another person, and nothing in it survives being handed a different project.
 *
 * Keeping it separate matters for a reason beyond tidiness. When two people
 * open the same production, the project state is what has to converge and this
 * state is what must NOT — a collaborator scrolling to the budget tab cannot
 * be allowed to move anybody else's. Mixed into one object those two kinds of
 * state are told apart only by remembering which is which, and the moment a
 * sync layer exists that memory becomes a bug.
 *
 * It provides a smaller benefit today: switching a tab or the theme no longer
 * changes the identity of the project context's value, so the canvas does not
 * re-render because someone opened the contacts panel.
 *
 * ## Why this provider is the OUTER one
 *
 * `FloorPlanProvider` consumes this context rather than the reverse, because
 * selecting an element on the canvas opens the inspector — project state
 * driving workspace state, which only works in that nesting order. The
 * dependency points one way and it is the way round that has no cycle: nothing
 * here reads a project.
 *
 * ## What deliberately stayed behind
 *
 * Three candidates turned out to be project state wearing a UI costume, and
 * each stayed in `FloorPlanContext` rather than being split across both:
 *
 *  - **The viewfinder.** `openViewfinder()` picks a camera out of
 *    `activeSetup.elements` when it is not given one. The open/closed flag
 *    could move; the action could not, and separating them would be worse
 *    than leaving both.
 *  - **`workspaceProfile` / `isModuleVisible`.** Keyed by project id and
 *    reloaded when the project changes, so moving them would mean handing
 *    this context a project — re-creating the coupling the split removes.
 *  - **`displaySettings`.** Reads as a preference, but is consumed almost
 *    entirely by canvas rendering.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/** The panel showing in the right-hand dock. */
export type RightTab =
  | 'shots'
  | 'storyboard'
  | 'script'
  | 'equipment'
  | 'schedule'
  | 'moodboard'
  | 'locations'
  | 'power'
  | 'logistics'
  | 'run_of_show'
  | 'continuity'
  | 'rigging'
  | 'contacts'
  | 'tasks'
  | 'budget'
  | 'inspector';

/** Which sheet the export & print studio opens on. */
export type ExportSection =
  | 'floorplan'
  | 'shotlist'
  | 'storyboard'
  | 'linedscript'
  | 'avscript'
  | 'sides'
  | 'scriptreports'
  | 'equipment'
  | 'dmx'
  | 'power'
  | 'rigging'
  | 'logistics'
  | 'runofshow'
  | 'continuity'
  | 'camerareport'
  | 'soundreport'
  | 'dailyprogress'
  | 'moodboard'
  | 'crew'
  | 'combined';

export type Theme = 'dark' | 'light';

export interface WorkspaceUIContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  activeRightTab: RightTab;
  setActiveRightTab: (tab: RightTab) => void;

  /**
   * Whether the right panel is expanded. It lives here rather than in `App`
   * because things outside the panel open it — double-clicking bare canvas
   * asks for the scene settings, and switching the tab behind a collapsed
   * panel would be a silent no-op.
   */
  isRightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;

  quickSearchOpen: boolean;
  setQuickSearchOpen: (open: boolean) => void;

  isDashboardOpen: boolean;
  openDashboard: () => void;
  closeDashboard: () => void;


  isExportModalOpen: boolean;
  exportSection: ExportSection;
  openExportModal: (section?: ExportSection) => void;
  setExportSection: (section: ExportSection) => void;
  closeExportModal: () => void;
}

const WorkspaceUIContext = createContext<WorkspaceUIContextType | undefined>(undefined);

export interface WorkspaceUIProviderProps {
  children: ReactNode;
  /**
   * Read once, to decide whether the app opens on the dashboard.
   *
   * Passed in rather than read here so this context never imports the project
   * library: a first run wants the dashboard so the first thing anyone does is
   * name their production, but that is the caller's fact to know, not this
   * one's.
   */
  startOnDashboard?: boolean;
  /** Storage key for the persisted theme. */
  themeStorageKey?: string;
  /** Theme to use when nothing is stored. */
  initialTheme?: Theme;
}

export const WorkspaceUIProvider = ({
  children,
  startOnDashboard = false,
  themeStorageKey = 'cineplan_theme',
  initialTheme = 'light',
}: WorkspaceUIProviderProps) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem(themeStorageKey);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // Private browsing and blocked storage both throw here. A theme is not
      // worth failing a mount over.
    }
    return initialTheme;
  });

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        localStorage.setItem(themeStorageKey, next);
      } catch {}
    },
    [themeStorageKey],
  );

  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [setTheme, theme],
  );

  // Tailwind's dark variants key off this class, so the document element is
  // the actual consumer of the theme — the value in context only tells
  // components which way round they are.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Inspector is the landing tab: it is the only one no workspace preset can
  // hide, so it is the single choice that is valid for every project — a
  // Blank Floor Plan has no shot list to open onto.
  const [activeRightTab, setActiveRightTab] = useState<RightTab>('inspector');
  const [isRightPanelOpen, setRightPanelOpen] = useState(true);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(startOnDashboard);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportSection, setExportSection] = useState<ExportSection>('floorplan');

  const openDashboard = useCallback(() => setIsDashboardOpen(true), []);
  const closeDashboard = useCallback(() => setIsDashboardOpen(false), []);
  const closeExportModal = useCallback(() => setIsExportModalOpen(false), []);

  const openExportModal = useCallback((section?: ExportSection) => {
    if (section) setExportSection(section);
    setIsExportModalOpen(true);
  }, []);

  // Small enough for an honest dependency list — unlike the project context,
  // which needs a shallow compare because no list over two hundred fields
  // stays correct.
  const value = useMemo<WorkspaceUIContextType>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      activeRightTab,
      setActiveRightTab,
      isRightPanelOpen,
      setRightPanelOpen,
      quickSearchOpen,
      setQuickSearchOpen,
      isDashboardOpen,
      openDashboard,
      closeDashboard,
      isExportModalOpen,
      exportSection,
      openExportModal,
      setExportSection,
      closeExportModal,
    }),
    [
      theme,
      setTheme,
      toggleTheme,
      activeRightTab,
      isRightPanelOpen,
      quickSearchOpen,
      isDashboardOpen,
      openDashboard,
      closeDashboard,
      isExportModalOpen,
      exportSection,
      openExportModal,
      closeExportModal,
    ],
  );

  return <WorkspaceUIContext.Provider value={value}>{children}</WorkspaceUIContext.Provider>;
};

export const useWorkspaceUI = (): WorkspaceUIContextType => {
  const context = useContext(WorkspaceUIContext);
  if (!context) {
    throw new Error('useWorkspaceUI must be used within a WorkspaceUIProvider');
  }
  return context;
};
