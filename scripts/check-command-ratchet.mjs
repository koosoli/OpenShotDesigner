/**
 * Ratchet on free-form project writes.
 *
 * `updateProjectMeta(patch)` lets any component write any shape into the
 * project. That is how the app got 93 call sites whose undo entry and change
 * log all read "Update project metadata", and how domain invariants — the
 * reference sweep when a person is deleted, for one — ended up living inside
 * React components where nothing else could reach them.
 *
 * The replacement is a pure command in `src/domain/commands`, dispatched with
 * `runCommand`. Migrating all of them at once would be a large, risky diff
 * touching every panel, so this does what the bundle budget does instead: it
 * fixes today's number as a ceiling. New writes have to be commands, and the
 * ceiling comes down as clusters are migrated.
 *
 * Lower CEILING whenever a migration lands. Never raise it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

/**
 * Highest number of `updateProjectMeta(` call sites allowed in components.
 *
 * 93 at the 2026-09-08 audit; 84 after the people domain moved to commands;
 * 83 once SchedulePanel's block placement went through moveScheduleBlockCommand;
 * 78 after the rigging domain followed; 76 after continuity; 72 after locations.
 */
const CEILING = 72;

const ROOT = join(process.cwd(), 'src', 'components');
const CALL = /\bupdateProjectMeta\s*\(/g;

const walk = async (dir) => {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Tests exercise the call sites; they are not themselves call sites.
      if (entry.name === '__tests__') continue;
      found.push(...(await walk(path)));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(path);
    }
  }
  return found;
};

const files = await walk(ROOT);
const perFile = [];
let total = 0;

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const count = (source.match(CALL) ?? []).length;
  if (count > 0) {
    perFile.push({ file: relative(process.cwd(), file), count });
    total += count;
  }
}

perFile.sort((a, b) => b.count - a.count);

console.log(`Free-form updateProjectMeta call sites: ${total} (ceiling ${CEILING})`);

if (total > CEILING) {
  const worst = perFile
    .slice(0, 5)
    .map(({ file, count }) => `  ${count}  ${file}`)
    .join('\n');
  throw new Error(
    `${total - CEILING} new free-form project write(s) were added.\n\n` +
      'New writes must be pure commands in src/domain/commands, dispatched\n' +
      'with runCommand(), so the change carries its own description and the\n' +
      'domain rule lives outside the component. See src/domain/commands/people.ts\n' +
      'for the pattern.\n\nBiggest remaining holders:\n' +
      worst,
  );
}

if (total < CEILING) {
  console.log(
    `${CEILING - total} call site(s) below the ceiling — lower CEILING in ` +
      'scripts/check-command-ratchet.mjs to lock the progress in.',
  );
}
