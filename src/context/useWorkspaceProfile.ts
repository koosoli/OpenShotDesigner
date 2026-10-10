/**
 * Which modules this project shows (plan §1.2): a local preference keyed by
 * the project id, so presets stay a presentation concern. Projects without a
 * stored preset show every module. Extracted from `FloorPlanContext`.
 */
import { useEffect, useState } from 'react';
import {
  ALL_MODULES_PROFILE,
  getWorkspaceProfile,
  isModuleEnabled as isModuleEnabledIn,
  setWorkspaceProfile as persistWorkspaceProfile,
  withModuleToggled,
} from '../domain/workspace';
import type { ModuleId, WorkspaceProfile } from '../domain/workspace';

export const useWorkspaceProfile = (projectId: string) => {
  const [workspaceProfile, setWorkspaceProfileState] = useState<WorkspaceProfile>(
    () => getWorkspaceProfile(projectId) ?? ALL_MODULES_PROFILE,
  );
  useEffect(() => {
    setWorkspaceProfileState(getWorkspaceProfile(projectId) ?? ALL_MODULES_PROFILE);
  }, [projectId]);
  const isModuleVisible = (moduleId: ModuleId) => isModuleEnabledIn(workspaceProfile, moduleId);
  const setModuleVisible = (moduleId: ModuleId, visible: boolean) => {
    setWorkspaceProfileState((current) => {
      const next = withModuleToggled(current, moduleId, visible);
      persistWorkspaceProfile(projectId, next);
      return next;
    });
  };
  return { workspaceProfile, setWorkspaceProfileState, isModuleVisible, setModuleVisible };
};
