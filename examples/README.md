# Synthetic contract examples

- [synthetic-report.json](synthetic-report.json) is a well-shaped report that references synthetic unit IDs.
- [invalid-report.json](invalid-report.json) passes the structural report shape but must be rejected by core publication validation because its change-unit reference is not present in the prepared source.
- Generate the synthetic large-change fixture into a new, explicitly chosen directory with `npm run fixture:large -- /path/to/new-fixture`. It creates 200 files, expects 2,000 units, and publishes 100 illustrative stories.

These are illustrative examples, not reports from a real repository. The fixture generator is available, but its capture time, storage size, and interaction latency have not been measured.
