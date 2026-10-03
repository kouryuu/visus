# Changelog

## Unreleased

### Changed

- The project was renamed from `diff-vis` to `visus`. The CLI command is now `visus`.

### Upgrading from `diff-vis`

- Existing initialized `.diff-vis/` reviews remain readable until a `.visus/` review store is initialized. Drafts can use `.visus/` with either store.
- Run `npm install`, rebuild, and run `npm link` to expose the renamed `visus` command.
- Refresh installed skills and hooks to use `visus`.
- The old `DIFF_VIS_PORT` setting remains supported alongside `VISUS_PORT`.
- An older installed `/change-story` skill is left untouched. Remove it manually once any custom guidance has been migrated to the `/visus-*` skills.
