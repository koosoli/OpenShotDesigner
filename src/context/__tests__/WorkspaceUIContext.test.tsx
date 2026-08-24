/**
 * The workspace-chrome context.
 *
 * Most of what is worth asserting here is the BOUNDARY rather than the
 * behaviour: that this state is genuinely independent of any project, that the
 * theme survives a reload and a blocked localStorage, and that the provider is
 * required rather than silently absent.
 *
 * The independence cases are the ones that would catch a regression that
 * matters. The reason this context exists is that workspace state must not
 * travel with a production — so a test that it can be driven with no project
 * anywhere in the tree is the test of the split itself.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import {
  WorkspaceUIProvider,
  useWorkspaceUI,
  type WorkspaceUIContextType,
} from '../WorkspaceUIContext';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <WorkspaceUIProvider>{children}</WorkspaceUIProvider>
);

/** Render the context on its own. Not a hook — a helper that renders one. */
const renderUI = () => renderHook(() => useWorkspaceUI(), { wrapper });

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
});
afterEach(cleanup);

describe('the provider is required', () => {
  it('says so rather than handing back undefined', () => {
    // A context read outside its provider returning `undefined` fails later,
    // somewhere else, as a property access on nothing.
    expect(() => renderHook(() => useWorkspaceUI())).toThrow(
      /must be used within a WorkspaceUIProvider/,
    );
  });
});

describe('theme', () => {
  it('defaults to light', () => {
    expect(renderUI().result.current.theme).toBe('light');
  });

  it('reads what was stored', () => {
    localStorage.setItem('cineplan_theme', 'dark');
    expect(renderUI().result.current.theme).toBe('dark');
  });

  it('ignores a stored value that is not a theme', () => {
    // Anything can end up in localStorage — another app on the same origin, a
    // half-finished migration, a user with the console open.
    localStorage.setItem('cineplan_theme', 'chartreuse');
    expect(renderUI().result.current.theme).toBe('light');
  });

  it('persists a toggle', () => {
    const { result } = renderUI();
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(localStorage.getItem('cineplan_theme')).toBe('dark');
  });

  it('toggles back', () => {
    const { result } = renderUI();
    act(() => result.current.toggleTheme());
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
    expect(localStorage.getItem('cineplan_theme')).toBe('light');
  });

  it('drives the document class, which is what Tailwind actually reads', () => {
    const { result } = renderUI();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    act(() => result.current.setTheme('dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => result.current.setTheme('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('still mounts when storage throws', () => {
    // Private browsing and blocked third-party storage both throw on read.
    // A theme preference is not worth failing a mount over.
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('storage disabled');
    };
    try {
      expect(renderUI().result.current.theme).toBe('light');
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it('still toggles when storage throws on write', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded');
    };
    try {
      const { result } = renderUI();
      act(() => result.current.toggleTheme());
      // The preference is lost on reload, but the app does not break now.
      expect(result.current.theme).toBe('dark');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});

describe('the export modal', () => {
  it('starts closed on the floor plan', () => {
    const { result } = renderUI();
    expect(result.current.isExportModalOpen).toBe(false);
    expect(result.current.exportSection).toBe('floorplan');
  });

  it('opens on the section it was asked for', () => {
    const { result } = renderUI();
    act(() => result.current.openExportModal('continuity'));
    expect(result.current.isExportModalOpen).toBe(true);
    expect(result.current.exportSection).toBe('continuity');
  });

  it('keeps the last section when opened with no argument', () => {
    // Reopening the studio should land where the user left it, not reset.
    const { result } = renderUI();
    act(() => result.current.openExportModal('camerareport'));
    act(() => result.current.closeExportModal());
    act(() => result.current.openExportModal());
    expect(result.current.exportSection).toBe('camerareport');
  });

  it('remembers the section after closing', () => {
    const { result } = renderUI();
    act(() => result.current.openExportModal('soundreport'));
    act(() => result.current.closeExportModal());
    expect(result.current.isExportModalOpen).toBe(false);
    expect(result.current.exportSection).toBe('soundreport');
  });
});

describe('panels and the dashboard', () => {
  it('opens on the shots tab', () => {
    expect(renderUI().result.current.activeRightTab).toBe('shots');
  });

  it('switches tab', () => {
    const { result } = renderUI();
    act(() => result.current.setActiveRightTab('budget'));
    expect(result.current.activeRightTab).toBe('budget');
  });

  it('stays off the dashboard unless told otherwise', () => {
    expect(renderUI().result.current.isDashboardOpen).toBe(false);
  });

  it('starts on the dashboard when the caller says it is a first run', () => {
    const { result } = renderHook(() => useWorkspaceUI(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <WorkspaceUIProvider startOnDashboard>{children}</WorkspaceUIProvider>
      ),
    });
    expect(result.current.isDashboardOpen).toBe(true);
  });

  it('opens and closes the dashboard', () => {
    const { result } = renderUI();
    act(() => result.current.openDashboard());
    expect(result.current.isDashboardOpen).toBe(true);
    act(() => result.current.closeDashboard());
    expect(result.current.isDashboardOpen).toBe(false);
  });

  it('opens and closes quick search', () => {
    const { result } = renderUI();
    act(() => result.current.setQuickSearchOpen(true));
    expect(result.current.quickSearchOpen).toBe(true);
    act(() => result.current.setQuickSearchOpen(false));
    expect(result.current.quickSearchOpen).toBe(false);
  });
});

describe('independence from any project', () => {
  /**
   * The whole reason this context exists. Nothing here may need a project, a
   * setup, or the floor-plan provider — if any of it did, the state would
   * travel with a production, and a collaborator switching tabs would move
   * everybody else's.
   */
  it('drives every member with no project context in the tree', () => {
    const Chrome = () => {
      const ui = useWorkspaceUI();
      return (
        <div>
          <span data-testid="theme">{ui.theme}</span>
          <span data-testid="tab">{ui.activeRightTab}</span>
          <button onClick={() => ui.toggleTheme()}>theme</button>
          <button onClick={() => ui.setActiveRightTab('script')}>script</button>
        </div>
      );
    };

    render(
      <WorkspaceUIProvider>
        <Chrome />
      </WorkspaceUIProvider>,
    );

    expect(screen.getByTestId('theme').textContent).toBe('light');
    act(() => screen.getByText('theme').click());
    act(() => screen.getByText('script').click());
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('tab').textContent).toBe('script');
  });

  it('exposes nothing that reads like project data', () => {
    // A guard against the boundary eroding: the next person to add a field
    // here has to notice that a project-shaped name does not belong.
    const { result } = renderUI();
    const projectish = Object.keys(result.current as WorkspaceUIContextType).filter((key) =>
      /project|setup|shot|element|scene|script|storyboard/i.test(key),
    );
    expect(projectish).toEqual([]);
  });
});
