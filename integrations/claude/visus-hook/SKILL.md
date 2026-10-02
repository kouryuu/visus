---
name: visus-hook
description: Set up requested Claude Code visus hooks or repair a missing, stale, or incomplete review when a visus hook requests it.
---

# Generate through hooks

Hooks signal review work; the agent authors the JSON. Read only the applicable section.

## Requested setup

With a built `visus` CLI on `PATH`, run `visus setup-claude --root <worktree>`. It installs the skill family and merges local `PostToolUse` and `Stop` hooks. Add `--with-mcp` only when MCP setup is requested. Existing skill files and settings entries are preserved; inspect older skills before replacing customized files. Do not run setup just because a hook requested repair.

The post-edit hook watches `Edit|Write|MultiEdit`, ignores edits inside `.visus/` and `.diff-vis/`, and writes a stale signal. It does not generate a report. The Stop hook checks the actual source and coverage, so edits through other tools can still be detected there.

## Hook-requested repair

1. If the hook says its retry limit was reached, report the unresolved condition and keep the prior revision. Do not reset counters or invoke the hook repeatedly to gain continuations. An explicit later user request can use the on-demand workflow.
2. Run `visus check` in the hook's target worktree. If `fresh`, no new draft is needed. For `missing`, generate the review; for `stale`, recapture and remap affected explanations; for `incomplete`, account for the pending refs. Preserve the current comparison base unless the user changes scope.
3. Follow [shared authoring](../visus-change-story/references/authoring.md), then report the actual final status. The Stop hook permits at most two repair continuations per source-state key and stops blocking sooner when `stop_hook_active` is set. Leave unresolved status explicit if repair cannot finish within that boundary.
