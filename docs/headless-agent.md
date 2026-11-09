# Headless automation and MCP

Run these tools from a source checkout with an up-to-date Node.js 22 installation and dependencies installed with `npm ci`. Both interfaces work offline on a file you select. Export an `.osd` project from the app to carry its media, or use a standalone project JSON backup. Both generations of `.osd` are accepted.

## Command line

```sh
node --import tsx scripts/project-agent.ts inspect --project production.osd
node --import tsx scripts/project-agent.ts shots --project production.osd --setup <setup-id>
node --import tsx scripts/project-agent.ts validate --project production.osd
node --import tsx scripts/project-agent.ts apply --project production.osd --changes changes.json --output reviewed.osd
```

Use the setup and location IDs returned by `inspect`. The CLI writes JSON results to stdout and errors to stderr. Exit code `0` indicates success, `1` indicates a command failure, and `2` indicates that validation found project errors.

Example `changes.json`

```json
[
  {"type":"production_details","updates":{"title":"Night Shoot","director":"Alex"}},
  {"type":"document_language","language":"de"},
  {"type":"setup_location","setupId":"<setup-id>","locationId":"<location-id>"}
]
```

Production details accepts `title`, `director`, `cinematographer`, and `productionCompany`. Paperwork language accepts `en` and `de`. Use `null` as the location ID to clear a setup's location.

All edits in a batch must succeed before the result is published. Choose a new output path on a local filesystem that supports hard links. The tool creates `.osd` v2 output with referenced media for `.osd` input and `.json` output for JSON input. JSON backups retain their media references. Review the result and open it through the app's project import flow.

## MCP

Use the following configuration shape in an MCP client that supports local stdio. Use absolute paths for the scripts and project files. JSON paths on Windows can use forward slashes.

```json
{
  "mcpServers": {
    "open-shot-designer": {
      "command": "node",
      "args": [
        "/path/to/OpenShotDesigner/node_modules/tsx/dist/cli.mjs",
        "/path/to/OpenShotDesigner/scripts/project-mcp.ts",
        "--project", "/path/to/production.osd"
      ]
    }
  }
}
```

The server exposes `inspect_project`, `list_shots`, and `validate_project`. To expose `apply_project_changes`, append `"--output", "/path/to/reviewed.osd"` to the launch arguments. The tool takes a `changes` array in the same format as the CLI. Each call reads the configured source file. To continue editing a generated copy, restart the server with that copy as the source and choose a fresh output path.

The MCP client provides the agent and model. The local server exposes project operations and runs independently of the browser, its IndexedDB library, and any collaboration session. Pick a file whose production data you want to make available to the configured client.

## Implementation scope

- Storage and package automation follows implementation plan §5.1, §5.2.2, and §5.3. Edits use existing domain commands on project files.
- The persisted schema stays at its current version. The tools run existing migrations when they read older files.
- The official MCP server SDK handles protocol negotiation and stdio. Zod shares input validation between MCP and the CLI. Both are dev dependencies for the local tools.
- Integration tests cover CLI migration and failure handling, MCP negotiation and tool calls, and media preservation on a package round trip.
- The standalone and GitHub Pages builds use the existing browser entry points. The automation entry points are local Node.js processes.
- Changes target the shared persistent project document in a separate export. Live collaboration, presence, and browser preferences are outside the file workflow.
