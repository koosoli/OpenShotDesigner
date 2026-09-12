/**
 * Project-level settings as commands.
 *
 * These are single-field writes with no referential consequences, so unlike
 * the people and rigging clusters they carry no invariant worth protecting.
 * They are commands for the other reason: `updateProjectMeta` logged every one
 * of them as "Update project metadata", so an undo stack full of production
 * settings changes was indistinguishable from an undo stack full of anything
 * else.
 */
import type { Project } from '../../types';
import { DOCUMENT_LANGUAGE_LABELS, DOCUMENT_LANGUAGES } from '../documentText';
import type { DocumentLanguage } from '../documentText';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

export interface SetDocumentLanguageInput {
  language: DocumentLanguage;
}

/**
 * Choose the language the production's paperwork prints in.
 *
 * Worth its own entry in the log rather than a generic one: this changes every
 * call sheet the production will ever issue, and an issued revision compares
 * as changed afterwards — so a producer looking at "changed since Rev 2" needs
 * to be able to see that this is why.
 */
export const setDocumentLanguageCommand = (
  project: Project,
  input: SetDocumentLanguageInput,
): CommandResult => {
  if (!DOCUMENT_LANGUAGES.includes(input.language)) {
    throw new Error(`setDocumentLanguage: unsupported language "${input.language}".`);
  }
  return {
    project: { ...project, documentLanguage: input.language },
    meta: {
      type: 'setDocumentLanguage',
      timestamp: commandTimestamp(),
      description: `Print paperwork in ${DOCUMENT_LANGUAGE_LABELS[input.language]}`,
    },
  };
};
