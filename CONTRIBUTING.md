# Contributing

The project contains a TypeScript/npm-workspace implementation. The project is licensed under Apache-2.0; release infrastructure is pending. Do not assume a public package or CI release flow exists.

## Before changing the design

Read the [report schema](packages/core/schema/report.schema.json) and [repository instructions](AGENTS.md). Keep proposals scoped to the initial local-change explorer; explain any change to accepted behavior or dependencies.

## Public-safe contributions

The prohibition on personal or environment-specific details is a hard rule. Use synthetic repositories, reports, screenshots, and test fixtures. Do not attach real worktree reports, private source, machine inventories, usernames, personal paths, account information, credentials, or private service URLs. Generic platform requirements are fine; copied personal configuration is not.

Include only the information necessary to reproduce a problem. Review attachments and generated output before sharing. Report suspected sensitive disclosures through a private channel, not a public issue; see [SECURITY.md](SECURITY.md).

## Implementation workflow

When implementation begins, keep changes focused, preserve existing conventions, update relevant documentation, and avoid speculative abstractions. Use the shared core and reusable explorer across hosts rather than duplicating their behavior.

Document actual tested prerequisites and commands as tooling is added. Do not add commands to the README before they exist. Commit dependency lockfiles when dependencies are introduced; avoid machine-specific paths or configuration.

## Verification expectations

For documentation changes, check local links, fenced examples, JSON syntax, and public-content safety.

For implementation changes, run the available cheap checks and targeted behavior tests when requested or warranted. Cover common paths and meaningful edge cases, especially stale reports, incomplete accounting, changing source state, and evidence integrity. Report checks performed and limitations; do not claim unverified success.

## Release checklist

- Review dependency licenses and include their required notices in release artifacts.
- Configure a private vulnerability-reporting channel without publishing personal contact details.
- Document reproducible setup, usage, configuration, troubleshooting, and uninstall steps.
- Verify the browser and installed extension against documented supported versions.
- Inspect release/package contents for private data, credentials, environment-specific details, and unintended artifacts.
- Use only synthetic public examples; keep local reports and exports out of source and release packages.

These are release requirements, not completed setup.
