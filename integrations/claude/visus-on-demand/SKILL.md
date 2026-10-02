---
name: visus-on-demand
description: Generate or refresh a local visus review JSON on request for current worktree changes or a selected Git base.
---

# Generate on demand

1. Establish the target worktree and comparison. `prepare` compares the merge base of the selected base and `HEAD` against saved working-tree content, including non-ignored untracked files. It does not offer staged-only capture. Use `--base HEAD` for uncommitted changes only; use the requested branch/ref for branch changes plus local edits. Without an explicit base, the saved configuration is reused, then the locally detected default. Ask if the intended comparison is ambiguous; do not silently change it.
2. Follow [shared authoring](../visus-change-story/references/authoring.md) to prepare, write, validate, publish, and check. A generation request normally includes publication to the local review store. If the user requests only a draft, validate it and return its path without publishing; describe coverage and do not claim a published review is fresh.
3. Return the file path and actual status. Do not install hooks for a one-time generation request.

For a PR, use [visus-pr](../visus-pr/SKILL.md).
