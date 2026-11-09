import { parseArgs } from 'node:util';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { changesSchema, projectOperations } from './agent/operations';
import { version } from '../package.json';

const reply = (result: Record<string, unknown>) => ({
  structuredContent: result,
  content: [{ type: 'text' as const, text: JSON.stringify(result) }],
});

try {
  const { values } = parseArgs({
    options: { project: { type: 'string' }, output: { type: 'string' } },
  });
  if (!values.project) throw new Error('Pass --project <file> and optionally --output <new-file>.');
  const operations = projectOperations(values.project, values.output);
  serveStdio(() => {
    const server = new McpServer({ name: 'open-shot-designer', version });
    server.registerTool('inspect_project', {
      description: 'Read production metadata and discover setup and location IDs.',
      inputSchema: z.strictObject({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async () => reply(await operations.inspect()));
    server.registerTool('list_shots', {
      description: 'List shot metadata for a setup in the configured project.',
      inputSchema: z.strictObject({ setupId: z.string().min(1) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ setupId }) => reply(await operations.shots(setupId)));
    server.registerTool('validate_project', {
      description: 'Check project IDs and references and return structured issues.',
      inputSchema: z.strictObject({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, async () => reply(await operations.validate()));
    if (values.output) {
      server.registerTool('apply_project_changes', {
        description: 'Apply a batch of production details, paperwork language, and setup location changes to a new project file. Existing files are never overwritten.',
        inputSchema: z.strictObject({ changes: changesSchema }),
        annotations: { destructiveHint: false, openWorldHint: false },
      }, async ({ changes }) => reply(await operations.apply(changes)));
    }
    return server;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
