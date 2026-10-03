# Claude Code integration

Skills, hooks, an optional status mod, and an optional MCP adapter for producing visus reviews with Claude Code. The README has the short setup; this page holds the details.

## Skills

The [visus-change-story skill](visus-change-story/SKILL.md) routes to focused workflows with shared authoring instructions and an optional synthetic example. Choose a workflow directly to load only the instructions needed:

- `/visus-on-demand`: generate a review for local changes or a selected base. `--base HEAD` captures uncommitted changes; another base captures changes from its merge base with `HEAD`, including local edits and non-ignored untracked files.
- `/visus-pr`: resolve a PR's exact head/base commits, prepare a clean local worktree, and generate its review. This is an agent workflow using local capture; visus has no native PR URL ingestion or fetching command.
- `/visus-hook`: set up requested hooks or repair the review when a hook requests it. Hooks signal work and check status; the agent writes the explanations.

The shared contract covers preparation, incremental publication, coverage, and freshness. The JSON example and MCP instructions load only when needed.

### Installing only the skills

```sh
npm run install:claude-skill -- --root /path/to/worktree
```

Omit `--root` to install into the current project, or use `--global` to make the skills available across local Claude Code projects. Both installers copy the full skill family and its references, filling missing files while preserving existing files. The skills use the file/CLI workflow by default. When migrating, compare installed files with this directory and refresh older instructions deliberately; rerunning installation does not overwrite customized skills.

### Hooks

`visus setup-claude --root /path/to/worktree` installs the skill family and merges local Claude hooks without replacing existing entries. MCP settings are only added when `--with-mcp` is passed; existing MCP configuration is preserved. Review generated integration files before committing them.

The Stop hook directs repairs to `visus-hook`, allows at most two repair continuations per source-state key, and stops blocking sooner if `stop_hook_active` is set. It then reports the unresolved status.

## Authoring contract

The draft contains incremental updates. Complete story records replace stories with matching IDs; valid unrelated stories and entities remain. `removeStories` and `removeEntities` explicitly remove records. Omit `exclusions` to retain valid existing exclusions, or provide it to replace the list.

`prepare --draft` generates the update ID, source ID, and expected revision and refuses to overwrite an existing file. Use a new draft filename for each changed publication. Draft and input-file paths resolve relative to `--root`. `prepare` still supports pagination; omit `--draft` when reading further pages.

Repeating the same unchanged publication returns the saved acknowledgment with `already-published` status rather than rechecking current source or revision; use `check` for current freshness. Editing an already published update requires a new update ID.

`validate` runs the same schema, reference, freshness, and revision checks as publication without saving a report. Its output includes coverage and pending references. Valid partial updates return `incomplete` and can be published while explanations are being written. Invalid input or stale source/revision returns a nonzero exit code. `check` requires a published, fresh, fully covered review and returns a nonzero exit code otherwise. Publication keeps atomic revision writes and the previous valid report on rejected input. Viewers continue reading the published report; editing a draft does not replace it.

Published reports live under `.visus/reviews/<scope>/revisions/<revision>.json` (or the legacy `.diff-vis/` store); drafts remain separate files. The [update schema](../../packages/core/schema/update.schema.json) describes authoring input and the [report schema](../../packages/core/schema/report.schema.json) describes published output; `visus schema` prints the draft schema.

## Status mod

[`visus-status`](visus-status) is an optional Claude Code mod (Claude Code v2.1.287 or newer). Its `/visus` command runs `visus check` and opens a `visus` pane: the review status, then each story's title with an emoji for each kind of change (🔧 implementation, 🧪 tests, 🔩 config, 📝 docs, 🧹 refactor, 📦 dependencies, 🤖 generated, 📎 other), and a legend. The pane sits beside the transcript in a wide fullscreen terminal and above the prompt otherwise; Esc closes it. Once the pane has been shown, file edits mark it as edited and it checks again when Claude's turn ends; the mod runs no checks before `/visus` is used. `visus check` includes each story's ID, title, and change kinds for this purpose. The mod needs the `visus` CLI on `PATH` (`npm link`). To load it for one session:

```sh
claude --plugin-dir /path/to/visus/integrations/claude/visus-status
```

Run `claude plugin test` from the mod's directory to run its tests. The mod has not yet been checked in a live session.

## Optional MCP adapter

For agents that need a tool interface, opt in with `visus setup-claude --with-mcp --root /path/to/worktree`, or launch `visus mcp` through the agent's MCP configuration. The adapter exposes `prepare_review`, `publish_update`, `check_review`, and compact revision-pinned reads using the same core validation and storage as file publication.

The SDK is a development dependency and an optional runtime peer. Normal CLI commands do not load it. Development builds install it with the other development dependencies; a production-only installation can run the built CLI without it. To enable MCP in that installation, install `@modelcontextprotocol/server@2.2.0`. The current adapter uses stdio and runs alongside the agent. An agent with a server-side checkout and shell can use files and the CLI there; access across machines would require an HTTP transport, which is not implemented. Reports and captured source must still be transferred or fetched for a viewer on another machine.
