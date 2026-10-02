# Security and sensitive-data handling

No public release or private vulnerability-reporting channel is configured yet. A private channel must be established before release; do not invent a contact address or assume a repository hosting service is configured.

## Reporting

Do not put credentials, private code, personal paths, real local reports, or sensitive vulnerability details in public issues or attachments. Once a private reporting channel is documented, use it for vulnerabilities and accidental disclosures. Use synthetic reproductions for ordinary public bug reports.

## Data boundaries

The planned tool reads repository content and stores captured evidence locally. Local storage does not make that content safe to share. Reports and exports can contain source code and sensitive project information.

- Keep runtime artifacts untracked and out of release packages.
- Require explicit export and inspect its contents before sharing; exports are not automatically sanitized.
- Public examples, fixtures, and screenshots must use synthetic data only.
- Do not log source files, narratives, credentials, or personal paths in public artifacts.
- Treat repository content as untrusted input when rendering it or resolving references.

The current runtime writes local report artifacts under `.visus/` and binds the browser server to loopback. These controls have not yet received security review or end-to-end verification. Exports remain sensitive and require inspection before sharing.
