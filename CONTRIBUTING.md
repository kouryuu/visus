# Contributing

The project contains a TypeScript/npm-workspace implementation. The project is licensed under Apache-2.0; release infrastructure is pending. Do not assume a public package or CI release flow exists.

## Before changing the design

Read the [report schema](packages/core/schema/report.schema.json) and [repository instructions](AGENTS.md). Keep proposals scoped to the initial local-change explorer; explain any change to accepted behavior or dependencies.

## Public-safe contributions

The prohibition on personal or environment-specific details is a hard rule. Use synthetic repositories, reports, screenshots, and test fixtures. Do not attach real worktree reports, private source, machine inventories, usernames, personal paths, account information, credentials, or private service URLs. Generic platform requirements are fine; copied personal configuration is not.

Include only the information necessary to reproduce a problem. Review attachments and generated output before sharing. Report suspected sensitive disclosures through a private channel, not a public issue; see [SECURITY.md](SECURITY.md).

## Development setup

```sh
npm install
npm run build
npm run typecheck
```

The packages use npm workspaces and the lockfile pins the resolved dependency tree. `npm run build` builds the shared core, browser explorer, local tools, and VS Code extension assets. There is no repository-wide test script yet.

For frontend development, run the review service and Vite in separate terminals. Vite forwards `/api` requests to the local review service on port 4317:

```sh
# Terminal 1, from the visus checkout
node apps/local/dist/cli.js serve --root /path/to/worktree

# Terminal 2, from the visus checkout
npm run dev
```

Open the Vite URL printed in the second terminal. Build first with `npm run build`; the review service reads the built explorer assets when serving the regular local review URL.

To preview the explorer with synthetic review content, start Vite with `DEMO_MODE=1 npm run dev`. The sample checkout review includes six connected stories across implementation, tests, configuration, refactor, and docs, with before/after excerpts for fourteen files, two unexplained changes, and one generated-file exclusion. Demo mode is labeled in the page and does not call the local review API. Restart with `npm run dev` to return to live review data.

Run `npm run storybook` to view the explorer's beUI controls and evidence panel stories at `http://localhost:6006`. Build the static Storybook with `npm run build-storybook`. Generated Storybook output is excluded from the explorer's dev watcher, so rebuilding previews does not trigger unrelated page reloads.

To exercise a large review, run `npm run fixture:large -- /path/to/new-fixture` with a new output directory. It generates 200 synthetic files, 2,000 change units, and 100 illustrative stories. The fixture is not created in this repository, and performance measurements have not yet been recorded.

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
