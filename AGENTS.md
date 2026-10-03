# Repository instructions

## Public-content hard rule

Do not include any personal or environment-specific details in repository content. This applies to code, documentation, examples, tests, fixtures, screenshots, generated files, logs included as artifacts, and release packages.

- Never include real personal identities, account information, credentials, private repository URLs, private code, personal filesystem paths, hostnames, or local installation inventories.
- Use synthetic sample data, repository-relative paths, and explicitly labeled placeholders where needed. Do not copy a development machine's configuration into portable setup instructions.
- Derive runtime paths and configuration from explicit inputs or supported APIs; never hardcode a contributor's environment.
- Keep actual review data local and untracked. Do not publish real reports as examples. Explicit exports may still contain sensitive source data and require review before sharing.
- Inspect public artifacts for accidental disclosure before proposing publication. Do not claim that a content check guarantees absence of secrets.

The only permitted exception is the project author's name, "Rodrigo Reyes", used solely for copyright and attribution in `LICENSE`, `NOTICE`, and the `license`/`author` metadata of package manifests. It must not appear in examples, fixtures, tests, logs, or generated review content, and no other personal detail (email, handle, contact, path) is covered by this exception.

Generic platform support and tested tool requirements may be documented; facts about an individual's machine may not.

## Scope and accuracy

- Follow the accepted implementation plan and keep dependencies lean.
- Clearly distinguish planned features from implemented and verified behavior.
- Maintain the README and relevant docs when behavior or setup changes.
- Do not invent repository URLs, contact details, publisher identities, license choices, or successful verification results.
- Do not commit, push, publish packages, or open pull requests without explicit authorization.

## Commit messages

- Use Conventional Commits: `type(scope): concise imperative summary`. The scope is optional.
- Choose the type that matches the change: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `style`, or `chore`.
- Do not add `Co-Authored-By` or other tool-attribution trailers to commit messages or pull request descriptions.
- Mark breaking changes with `!` after the type or scope and explain the migration in a `BREAKING CHANGE:` footer.
