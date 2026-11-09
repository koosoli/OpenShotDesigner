import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { projectOperations } from './agent/operations';

const usage = `Usage:
  node --import tsx scripts/project-agent.ts inspect --project <file>
  node --import tsx scripts/project-agent.ts shots --project <file> --setup <id>
  node --import tsx scripts/project-agent.ts validate --project <file>
  node --import tsx scripts/project-agent.ts apply --project <file> --changes <json-file> --output <new-file>`;

try {
  const { values, positionals: [command, ...extra] } = parseArgs({
    allowPositionals: true,
    options: {
      project: { type: 'string' },
      setup: { type: 'string' },
      changes: { type: 'string' },
      output: { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(usage);
  } else {
    if (!values.project || extra.length) throw new Error(usage);
    const operations = projectOperations(values.project, values.output);
    let result;
    switch (command) {
      case 'inspect':
        result = await operations.inspect();
        break;
      case 'shots':
        if (!values.setup) throw new Error('--setup is required for shots.');
        result = await operations.shots(values.setup);
        break;
      case 'validate':
        result = await operations.validate();
        if (!result.valid) process.exitCode = 2;
        break;
      case 'apply':
        if (!values.changes || !values.output) throw new Error('--changes and --output are required for apply.');
        result = await operations.apply(JSON.parse(await readFile(values.changes, 'utf8')));
        break;
      default:
        throw new Error(usage);
    }
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
