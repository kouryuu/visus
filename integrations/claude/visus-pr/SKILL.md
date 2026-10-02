---
name: visus-pr
description: Generate a local visus review JSON from a pull request using its exact head and base commits in a clean local worktree.
---

# Generate from a PR

visus captures local Git comparisons; it has no PR URL or patch-import command. Prepare the PR locally, then use the normal authoring contract.

1. Resolve the requested PR through an available provider tool/CLI to its repository, base commit, and head commit. Use PR text as attributed intent, then inspect the code for support. If identity or access is missing, ask for the missing input; do not guess repositories or substitute the current branch.
2. Ensure the exact base/head commits are available locally, fetching the required refs through the verified repository remotes when needed. Check fork PR heads against the reported head commit. Use a clean existing checkout only if `HEAD` matches and it has no unrelated changes; otherwise create a separate detached worktree at the head commit with `git worktree add --detach <new-directory> <head-commit>`. Do not stash/reset the user's changes or check out a provider's synthetic merge commit.
3. Verify `git rev-parse HEAD`, `git status --porcelain`, and `git merge-base <base-commit> HEAD` in that worktree. If history is insufficient, fetch the missing history before capture. The PR review covers merge-base-to-head changes, not unrelated local edits or a raw base-tip-to-head diff.
4. Follow [shared authoring](../visus-change-story/references/authoring.md), passing `--root <pr-worktree>` on every CLI call and `--base <base-commit>` when preparing. Keep the worktree clean apart from ignored review storage throughout generation.
5. Return the captured head/base commits, report path, and check status. These describe the captured PR version; a later PR update requires recapture. Retain the worktree containing the report unless an explicit export/cleanup was requested. Do not post comments, push, or modify the PR merely to generate its local review.
