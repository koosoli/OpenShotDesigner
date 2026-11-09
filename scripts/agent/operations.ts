import * as z from 'zod/v4';
import { DOCUMENT_LANGUAGES } from '../../src/domain/documentText';
import { setDocumentLanguageCommand } from '../../src/domain/commands/project';
import {
  setSetupLocationCommand,
  updateProductionDetailsCommand,
} from '../../src/domain/commands/productionDetails';
import { validateProject } from '../../src/domain/validation/project';
import { loadAgentProject, saveAgentProject } from './project-file';

const id = z.string().min(1);
const text = z.string().max(500);
export const changesSchema = z.array(z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('production_details'),
    updates: z.strictObject({
      title: text.trim().min(1).optional(),
      director: text.optional(),
      cinematographer: text.optional(),
      productionCompany: text.optional(),
    }).refine(updates => Object.keys(updates).length > 0, 'Provide at least one production field.'),
  }),
  z.strictObject({ type: z.literal('document_language'), language: z.enum(DOCUMENT_LANGUAGES) }),
  z.strictObject({
    type: z.literal('setup_location'),
    setupId: id,
    locationId: id.nullable().describe('Use null to clear the location.'),
  }),
])).min(1).max(100);

export function projectOperations(input: string, output?: string) {
  return {
    async inspect() {
      const { project, migratedFrom } = await loadAgentProject(input);
      return {
        id: project.id,
        title: project.title,
        schemaVersion: project.schemaVersion,
        migratedFrom,
        director: project.director,
        cinematographer: project.cinematographer,
        productionCompany: project.productionCompany,
        documentLanguage: project.documentLanguage ?? 'en',
        setups: project.setups.map(({ id, name, sceneNumber, locationId, elements, shots }) => ({
          id, name, sceneNumber, locationId, elementCount: elements.length, shotCount: shots.length,
        })),
        locations: (project.locations ?? []).map(({ id, name }) => ({ id, name })),
      };
    },
    async shots(setupId: string) {
      const { project } = await loadAgentProject(input);
      const setup = project.setups.find(setup => setup.id === setupId);
      if (!setup) throw new Error(`Unknown setup: ${setupId}`);
      return {
        setupId,
        shots: setup.shots.map(({
          id, name, shotNumber, status, cameraId, shotSize, lensMm, framingDescription,
        }) => ({ id, name, shotNumber, status, cameraId, shotSize, lensMm, framingDescription })),
      };
    },
    async validate() {
      const { project } = await loadAgentProject(input);
      const issues = validateProject(project);
      return { valid: !issues.some(issue => issue.severity === 'error'), issues };
    },
    async apply(rawChanges: unknown) {
      if (!output) throw new Error('Configure a new output path to enable edits.');
      const changes = changesSchema.parse(rawChanges);
      const loaded = await loadAgentProject(input);
      let { project } = loaded;
      for (const change of changes) {
        switch (change.type) {
          case 'production_details':
            project = updateProductionDetailsCommand(project, change).project;
            break;
          case 'document_language':
            project = setDocumentLanguageCommand(project, change).project;
            break;
          case 'setup_location': {
            const { setupId, locationId } = change;
            if (!project.setups.some(setup => setup.id === setupId)) {
              throw new Error(`Unknown setup: ${setupId}`);
            }
            if (locationId !== null && !project.locations?.some(location => location.id === locationId)) {
              throw new Error(`Unknown location: ${locationId}`);
            }
            project = setSetupLocationCommand(project, {
              setupId,
              locationId: locationId ?? undefined,
            }).project;
            break;
          }
        }
      }
      return {
        output: await saveAgentProject(output, project, loaded.media),
        projectId: project.id,
        changesApplied: changes.length,
      };
    },
  };
}
