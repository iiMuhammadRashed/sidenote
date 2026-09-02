# Changelog

All notable changes to **Sidenote** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Project notes are private by default.** They now live in the vault
  (`~/.sidenote/projects/<project>/`) instead of a `.notes/` folder inside the project.
  Notes are personal, and a folder in the repo gets staged, reviewed, or pushed to a
  team remote by accident. Teams who want checked-in project docs can set
  `sidenote.projectNotesLocation` to `repo`.
- `sidenote.notesPath` and `sidenote.globalNotesPath` are replaced by
  `sidenote.vaultPath`, `sidenote.projectNotesLocation` and `sidenote.repoNotesPath`.
- **Search is fuzzy.** `nsvc` finds `note-service`; word-boundary and consecutive
  matches rank above scattered ones. Content hits now open the note on the matched
  line rather than at the top of the file.

### Fixed

- **Typing in the Quick Note panel no longer eats characters.** Each save came back
  through the file watcher and repainted the panel with disk content that was a
  save-cycle old, discarding anything typed in the meantime.
- **High CPU and lag while typing**, worst right after a `#`. Every save re-scanned the
  whole vault, rebuilt the tag index and re-rendered the tree. The panel's own saves are
  now recognised by content and skipped, so only genuinely external edits reload anything.
- The vault is watched once instead of twice. Project and global notes both live inside
  it, so the previous per-root watchers overlapped on a home-directory subtree.
- Wiki-link detection no longer reads every note on each keystroke in an unrelated
  Markdown file; a document with no `[[` returns immediately.

### Added

- **Quick Note panel**: a Markdown scratchpad rendered directly in the sidebar, with a
  Write/Preview toggle, debounced auto-save and a per-vault note. It edits a real `.md`
  file, so the note stays greppable, git-versionable and openable in an editor tab.

### Fixed

- The extension no longer creates `~/.sidenote` at activation. Nothing is written until
  you save a note.
- Removed the `[node.js fs] readdir ... ENOENT` message logged once per window for every
  project without a notes folder. The root's parent is now listed instead of reading a
  directory that is not there.

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
