/**
 * Script breakdown and script-to-plan writes as commands: tagging elements,
 * removing one (with the scenes that cached its id), keeping imported drafts
 * in revision history, and creating floor-plan setups from scenes.
 */
import type { Project, SceneSetup, ScriptImportRevision } from '../../types';
import type { BreakdownItem } from '../script/types';
import { removeBreakdownItemReferences } from '../integrity';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

const meta = (type: string, description: string, entityId?: string): CommandResult['meta'] => ({
  type,
  timestamp: commandTimestamp(),
  description,
  ...(entityId ? { entityId } : {}),
});

export interface UpdateBreakdownItemsInput {
  update: (items: BreakdownItem[]) => BreakdownItem[];
  /** "Tag Ledger as a prop", "Untag line". */
  description?: string;
}

export const updateBreakdownItemsCommand = (project: Project, input: UpdateBreakdownItemsInput): CommandResult => {
  if (typeof input.update !== 'function') throw new Error('updateBreakdownItems: update must be a function.');
  return {
    project: { ...project, breakdownItems: input.update(project.breakdownItems ?? []) },
    meta: meta('updateBreakdownItems', input.description ?? 'Edit breakdown'),
  };
};

/** Remove an element and drop its id from every scene that listed it. */
export const removeBreakdownItemCommand = (project: Project, input: { itemId: string }): CommandResult => {
  const item = (project.breakdownItems ?? []).find((candidate) => candidate.id === input.itemId);
  if (!item) throw new Error(`removeBreakdownItem: unknown item id "${input.itemId}".`);
  const refs = removeBreakdownItemReferences({ breakdownItems: project.breakdownItems ?? [], scriptScenes: project.scriptScenes }, input.itemId);
  return {
    project: { ...project, ...refs },
    meta: meta('removeBreakdownItem', `Remove ${item.name} from the breakdown`, item.id),
  };
};

/** Keep the replaced draft in revision history. */
export const addScriptRevisionCommand = (project: Project, input: { revision: ScriptImportRevision }): CommandResult => ({
  project: { ...project, scriptRevisions: [...(project.scriptRevisions ?? []), input.revision] },
  meta: meta('addScriptRevision', `Keep the previous draft (${input.revision.sourceFileName}) in revision history`, input.revision.id),
});

/**
 * Add floor-plan setups (from script scenes) and open the first of them —
 * unless `open` is false, as when writing creates them in the background.
 */
export const addSetupsCommand = (project: Project, input: { setups: SceneSetup[]; open?: boolean }): CommandResult => {
  if (input.setups.length === 0) throw new Error('addSetups: nothing to add.');
  return {
    project: {
      ...project,
      setups: [...project.setups, ...input.setups],
      activeSetupId: input.open === false ? project.activeSetupId : input.setups[0].id,
    },
    meta: meta('addSetups', input.setups.length === 1 ? `Add setup ${input.setups[0].name}` : `Add ${input.setups.length} setups from the script`),
  };
};
