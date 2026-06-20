# Markdown notes

Drop `.md` files into this directory and run the importer to import
them as `content_item` rows of `type='note'`.

## Usage

```sh
pnpm import:markdown            # imports ./markdown
pnpm import:markdown --dir ./notes --force   # custom dir, force re-write
```

The script is idempotent: re-running on an unchanged tree is a no-op;
files whose content or frontmatter changed are updated in place.

## File contract

- **Extension:** `.md` (case-insensitive). Non-markdown files are ignored.
- **Hidden files:** any path segment starting with `.` is skipped (e.g.
  `.draft.md`, `topics/.wip.md`). Use this for drafts you don't want
  imported.
- **Subdirectories:** walked recursively. Path separators are
  normalised to `/` so behaviour is the same on Windows and Linux.
- **Size cap:** 5 MiB per file. Larger files are skipped with a warning.
- **Title:** the filename without the `.md` extension. Frontmatter
  `title` is preserved in `metadata` but does not override the
  filename-derived title.
- **YAML frontmatter:** anything between leading `---` markers at the
  top of the file is parsed and stored as `metadata` (JSON-encoded).
  Malformed frontmatter is logged and the body is imported with
  `metadata = null`.

## Re-imports

The importer derives a stable id from the file's path _relative to
the import root_. Two files with the same relative path under
different import roots will collide — the second import overwrites
the first. Use a single import root per install.

## See also

- `src/lib/markdown-importer.ts` — the library
- `scripts/import-markdown.ts` — the CLI
- `src/lib/__tests__/markdown-importer.test.ts` — the test suite
