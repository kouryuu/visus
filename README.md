<p align="center">
  <img src="packages/explorer/src/assets/visus-icon.svg" width="96" alt="visus logo: a blue neon eye" />
</p>

<h1 align="center">visus</h1>

<p align="center"><strong>Review the story before the diff.</strong></p>

<p align="center">
  Agent-written, visual guides to large code changes. Understand what changed and why, then jump straight to the code. Local-first, in your browser or a VS Code extension.
</p>

<p align="center">
  <img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue" />
  <img alt="Node.js 22.12 or newer" src="https://img.shields.io/badge/node-%E2%89%A522.12-339933" />
  <img alt="Status: pre-release" src="https://img.shields.io/badge/status-pre--release-orange" />
</p>

<p align="center">
  <img src="assets/visus-explorer.png" width="900" alt="The visus explorer showing a list of change stories and a connected diagram of the areas one story affects, using a synthetic sample project" />
</p>

<p align="center"><sub>Synthetic sample review rendered by the explorer's demo mode.</sub></p>

> **Early development (v0.1.0, unreleased).** The CLI, browser explorer, VS Code extension (development host only), and Claude Code skills are implemented. End-to-end and real-host acceptance testing has not been done, and there is no npm or Marketplace release yet.

## Why visus

Large changes, especially agent-written ones, arrive as hundreds of files. A file-by-file diff shows *what* moved but not *why*, so reviewers skim and miss things.

- **Stories, not file lists.** Changes are grouped into plain-language stories, each with its outcome first and the reasoning behind it one click away.
- **See what it touches.** A connected diagram shows the areas a story affects and how they relate, marking direct and inferred links.
- **Coverage is enforced.** `visus check` fails until every captured change is explained or explicitly excluded, and a review goes stale when the source moves. How good each explanation is still depends on the agent that wrote it.
- **Straight to the evidence.** Open any reference to the captured before/after code, in the browser or as a native diff in VS Code.
- **Local-first.** Reviews are plain files under `.visus/`. There is no hosted service, and the tool does not fetch, stage, or execute your project code.

## How it works

1. `visus prepare` inspects your Git worktree and writes a draft listing every change.
2. Your agent fills in the draft with stories, relationships, and exclusions, guided by the bundled Claude Code skills.
3. `visus validate` and `visus publish` check coverage and freshness, then save an immutable report revision.
4. You read the story in the browser explorer or VS Code, and open the evidence behind any claim.

The bundled workflows target Claude Code. Other agents can use the CLI and the JSON schema directly, but that is untested.

## Quickstart

Requires Node.js 22.12 or newer (`.nvmrc` pins 24), npm 10 or newer, and Git.

```sh
git clone <repo-url> visus && cd visus
npm install
npm run build
npm link   # exposes the `visus` command
```

Try the explorer with synthetic data, no review needed:

```sh
DEMO_MODE=1 npm run dev
```

Then review a real worktree. Run these from the project you want to review:

```sh
visus init
visus prepare --base main --draft .visus/draft-01.json
# Your agent edits the draft with stories, entities, and optional exclusions.
visus validate --file .visus/draft-01.json
visus publish --file .visus/draft-01.json
visus check
visus serve        # then open http://127.0.0.1:4317
```

Add `--root /path/to/worktree` to any command to run it from another directory. `prepare` prints the source ID, selected base, and a page of change-unit references; continue with `--offset N` and `--limit N` for large inventories. The base is remembered per worktree. `--base HEAD` captures uncommitted changes.

The review folder `.visus/` is ignored locally by `init`. It stores source snapshots, content-addressed evidence, immutable report revisions, and the latest pointer. Keep it local: reports and evidence may contain private source.

## Use it with Claude Code

```sh
visus setup-claude --root /path/to/worktree
```

This installs the `/visus-on-demand`, `/visus-pr`, and `/visus-hook` skills and merges local Claude hooks without replacing existing entries. MCP is opt-in with `--with-mcp`. To install only the skills, use `npm run install:claude-skill`. An optional `visus-status` mod shows review status in a Claude Code pane. See the [Claude Code integration guide](integrations/claude/README.md) for the workflows, hooks, status mod, and MCP adapter.

## VS Code

Open this project in VS Code, run `npm run build`, and press F5 from the extension workspace to launch an Extension Development Host. Use **visus: Open Change Explorer** or **visus: Prepare Review**. The extension renders the same explorer bundle and opens historical evidence through readonly virtual documents.

## Export

```sh
visus export --scope <scope> --revision <revision> --out ./review-export
visus serve --export ./review-export
```

The export contains a report snapshot, source manifest, referenced evidence, and the viewer assets. It can be served without the original worktree. Exports are not sanitized; inspect before sharing.

## FAQ

**Does it send my code anywhere?** No. Reviews stay in `.visus/` and the browser server binds to loopback. Your agent, of course, sees whatever your agent normally sees.

**Can I commit `.visus/`?** No. It can contain private source and is meant to stay local.

**Can it read a PR URL?** No. `/visus-pr` has the agent resolve the PR's commits and prepare a clean local worktree, then uses local capture.

**Does it work with agents other than Claude Code?** The CLI and schemas are agent-neutral, but only the Claude Code integration is provided.

## Documentation

- [Claude Code integration](integrations/claude/README.md)
- [Explorer notes](packages/explorer/README.md)
- [Update schema](packages/core/schema/update.schema.json) · [Report schema](packages/core/schema/report.schema.json)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

Public repository content must use synthetic examples and repository-relative paths. No private vulnerability-reporting channel or public release has been selected.

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
