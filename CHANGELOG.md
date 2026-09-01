# Changelog

All notable changes to **Sidenote** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-02

First public release.

### Added

- **Sidebar tree** with Favorites, Recent, Workspace, Global, Tags and Archive sections,
  backed by real folders on disk.
- **Two vaults**: workspace notes in `.notes/` and global notes in `~/.sidenote`, both configurable.
- **Ranked search** across titles, folders, tags and note bodies, with matching-line previews.
- **Tags** from `#hashtags` and YAML `tags:` frontmatter, with click-to-filter.
- **Wiki links**: `[[Note Title]]` resolves to a clickable link, with `[[` autocomplete.
- **Daily notes** created from a template in a configurable folder.
- **Favorites and archive** state, stored in VS Code state rather than in your Markdown.
- **Drag and drop** between folders and between the two vaults.
- **Templates** supporting `${title}`, `${date}`, `${time}` and `${datetime}`.
- Status bar quick-capture button, keyboard shortcuts, and 20 palette commands.

### Notes on behaviour

- Notes folders are created lazily, on the first note you save — opening a project does not
  create an empty `.notes/` directory in it.
- Deleting prefers the system trash. Where no trash is available the file is removed
  permanently and Sidenote says so explicitly.
- Folder paths supplied to any command are sanitized, so a note can never be written or
  deleted outside its vault.

[1.0.0]: https://github.com/iiMuhammadRashed/sidenote/releases/tag/v1.0.0
