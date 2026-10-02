# Tools-only authoring

Use the shared authoring/coverage rules with these transport substitutions:

- `prepare_review({ base?, offset?, limit? })` returns refs, `sourceId`, `scope`, and `expectedRevision`. Page until `hasMore` is false, checking snapshot/revision consistency. Generate a new unique `updateId` for each changed publication; no draft file is created.
- Use `read_latest`, `read_story`, and `read_evidence` for bounded inspection of the existing report and captured code. Do not infer rationale from unit metadata alone.
- `publish_update({ update })` accepts the same update contract. There is no MCP dry-run validation tool; publication performs validation. Preserve source metadata and handle conflicts as described in the shared contract.
- `check_review({ scope? })` checks current status. A duplicate publication acknowledgment does not establish freshness.

This adapter uses stdio alongside the agent, with a configured local worktree. It cannot fetch a PR, switch its root per tool call, or expose remote HTTP access. If PR checkout preparation or a physical draft file is required and no shell/file capability is available, report the missing capability.
