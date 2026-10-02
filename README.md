# diff-vis

An agent-authored, visual guide to large code changes. Review the story first, then open captured evidence in a local browser or VS Code.

Implementation is underway from the accepted six-milestone plan. The workspace now includes the shared contracts and core, local CLI/MCP/browser runtime, React explorer, VS Code extension, Claude Code integration files, and portable export. Runtime verification and real-host acceptance checks are still pending; licensing and release infrastructure remain undecided.

## Requirements

- Node.js 22.12 or newer (the repository selects the Node 24 LTS line) and npm 10 or newer
- Git available on `PATH`
- A Git worktree for source capture

## Build and check

```sh
npm install
npm run build
npm run typecheck
```

The packages use npm workspaces. The lockfile pins the resolved dependency tree. `npm run build` builds the shared core, browser explorer, local tools, and VS Code extension assets.

## Local review

Build once, then run these commands from the diff-vis checkout:

```sh
node apps/local/dist/cli.js init --root /path/to/worktree
node apps/local/dist/cli.js prepare --root /path/to/worktree
node apps/local/dist/cli.js serve --root /path/to/worktree
```

Open `http://127.0.0.1:4317`. `prepare` prints the source ID, selected base, and a page of change-unit references; continue with `--offset N` and `--limit N` for large inventories. The base can be selected explicitly with `--base <ref>` and is remembered per worktree. The tool does not fetch, stage, execute project code, or alter the reviewed index.

The review folder is `.diff-vis/`, ignored locally by `init`. It stores source snapshots, content-addressed evidence, immutable report revisions, and the latest pointer. Keep it local: reports and evidence may contain private source.

## Claude Code producer

After building, run `npm link` from this checkout to make the CLI available on `PATH`, then install the integration:

```sh
diff-vis setup-claude --root /path/to/worktree
```

This installs the `change-story` skill when absent and merges local Claude hooks and MCP settings without replacing existing entries. Review generated integration files before committing them. The Stop hook allows two repair continuations per source state and then reports the unresolved status.

The MCP server exposes `prepare_review`, `publish_update`, `check_review`, and compact revision-pinned reads. The skill instructions live in [integrations/claude/change-story/SKILL.md](integrations/claude/change-story/SKILL.md).

## VS Code

Open this project in VS Code, run `npm run build`, and press F5 from the extension workspace to launch an Extension Development Host. Use **diff-vis: Open Change Explorer** or **diff-vis: Prepare Review**. The extension renders the same explorer bundle and opens historical evidence through readonly virtual documents.

## Export

```sh
diff-vis export --scope <scope> --revision <revision> --out ./review-export
diff-vis serve --export ./review-export
```

The export contains a report snapshot, source manifest, referenced evidence, and the viewer assets. It can be served without the original worktree. Exports are not sanitized; inspect before sharing.

## Synthetic large-change example

After building, run `npm run fixture:large -- /path/to/new-fixture` with a new output directory. It generates 200 synthetic files, 2,000 change units, and 100 illustrative stories. The fixture is not created in this repository, and performance measurements have not yet been recorded.

## Documentation

- [Report schema](packages/core/schema/report.schema.json)
- [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

Public repository content must use synthetic examples and repository-relative paths. No license, private vulnerability-reporting channel, or public release has been selected.
