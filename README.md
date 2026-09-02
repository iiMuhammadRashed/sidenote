<p align="center">
  <img src="media/banner.png" alt="Sidenote" width="820">
</p>

# Sidenote

**Markdown notes that live in your VS Code sidebar.** No account, no sync service, no proprietary format — just plain `.md` files you already own.

[![CI](https://github.com/iiMuhammadRashed/sidenote/actions/workflows/ci.yml/badge.svg)](https://github.com/iiMuhammadRashed/sidenote/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Why Sidenote

Most note-taking extensions either hide your notes in a database or drop you into a webview that fights the editor. Sidenote does neither. Every note is a real Markdown file on disk, opened in a real VS Code editor, with full syntax highlighting, preview, Vim keybindings, Git history and every other editor feature you already have.

- **Write without leaving the sidebar.** The Quick Note panel is a Markdown scratchpad docked in the Activity Bar, with a preview toggle. It edits a real `.md` file, so anything you jot there is still a normal file you can grep, commit, or open in a tab.
- **Two vaults, one tree.** Project notes live with the repo in `.notes/`; personal notes live in `~/.sidenote` and follow you into every workspace.
- **Creates nothing until you do.** No folder appears in a project you were only browsing. The notes directory is written on your first saved note and never before.
- **Nothing to migrate.** Point Sidenote at an existing folder of Markdown and it just works. Uninstall it and your notes are still there.
- **Fast on large vaults.** The tree caches parsed titles and tags per file and re-reads only what actually changed on disk.

## Features

| | |
|---|---|
| **Quick Note panel** | A Markdown scratchpad in the sidebar with a Write/Preview toggle, auto-save, and one note per vault |
| **Sidebar tree** | Favorites, Recent, Workspace, Global, Tags and Archive sections, with real folders underneath |
| **Full-text search** | Ranked across titles, folders, tags and note bodies, with matching-line previews |
| **Tags** | Picked up from `#hashtags` and YAML `tags:` frontmatter; click a tag to filter the tree |
| **Wiki links** | `[[Note Title]]` becomes a clickable link, with autocomplete as you type `[[` |
| **Daily notes** | One keystroke opens today's note, created from your template if it does not exist yet |
| **Favorites & archive** | Pin what you use; archive what you don't, without deleting it |
| **Drag and drop** | Move notes between folders — or between the workspace and global vaults |
| **Templates** | `${title}`, `${date}`, `${time}` and `${datetime}` in new-note and daily-note templates |

## Getting started

1. Install Sidenote and click the notes icon in the Activity Bar.
2. Start typing in the **Quick Note** panel at the top. That's the fastest path — no dialog, no filename.

For a note you want to name and keep, press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> (<kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> on macOS) instead; it appears under **All Notes**.

Either way, the notes folder is created the first time you actually save something — Sidenote never litters an empty `.notes/` into a project you were only browsing.

### The Quick Note panel

`This project` / `Global` switches which vault you are writing into — each keeps its own `Quick Note.md`. `Write` and `Preview` toggle rendering, and the arrow opens the note as a normal editor tab. Edits save themselves a moment after you stop typing.

## Keyboard shortcuts

| Action | Windows / Linux | macOS |
|---|---|---|
| New note | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> | <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> |
| Search notes | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> | <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> |
| Today's daily note | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> | <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>D</kbd> |

## Commands

Every command is available from the Command Palette under the **Sidenote** category.

| Command | What it does |
|---|---|
| `Sidenote: New Note` | Create a note in the selected folder, or the default scope |
| `Sidenote: New Folder` | Create a folder inside a notes vault |
| `Sidenote: Open Note` / `Open Note to the Side` | Open a note in the editor |
| `Sidenote: Rename Note or Folder` | Rename, carrying favorites and history to the new name |
| `Sidenote: Delete Note or Folder` | Delete via the system trash where available |
| `Sidenote: Duplicate Note` | Copy a note alongside the original |
| `Sidenote: Move Note to Folder...` | Move between folders and between vaults |
| `Sidenote: Toggle Favorite` | Pin a note to the Favorites section |
| `Sidenote: Toggle Archive` | Hide a note from the main tree without deleting it |
| `Sidenote: Search Notes` | Ranked search over titles, folders, tags and content |
| `Sidenote: Filter Notes by Tag` / `Clear Tag Filter` | Narrow the tree to one tag |
| `Sidenote: Copy Wiki Link` | Copy `[[Note Title]]` to the clipboard |
| `Sidenote: Copy Relative Path` | Copy a note or folder's path inside the vault |
| `Sidenote: Reveal in File Explorer` | Show the file in your OS file manager |
| `Sidenote: Open Today's Daily Note` | Open or create today's note |
| `Sidenote: Open Markdown Preview to the Side` | Preview the current note |
| `Sidenote: Refresh Notes` | Re-scan both vaults |
| `Sidenote: Open Settings` | Jump to Sidenote's settings |

## Settings

| Setting | Default | Description |
|---|---|---|
| `sidenote.notesPath` | `.notes` | Workspace-relative folder for project notes |
| `sidenote.globalNotesPath` | `~/.sidenote` | Folder for notes shared across workspaces |
| `sidenote.defaultScope` | `workspace` | Where new notes go when no folder is selected |
| `sidenote.sortBy` | `modifiedDesc` | Sort order within folders and sections |
| `sidenote.showRecent` | `true` | Show the Recent section |
| `sidenote.recentLimit` | `7` | How many recent notes to remember |
| `sidenote.showFavorites` | `true` | Show the Favorites section |
| `sidenote.showTags` | `true` | Show the Tags section |
| `sidenote.showArchive` | `false` | Show the Archive section |
| `sidenote.showStatusBarItem` | `true` | Show the status bar New Note button |
| `sidenote.confirmDelete` | `true` | Confirm before deleting |
| `sidenote.defaultNoteTemplate` | `# ${title}\n\n` | Content for new notes |
| `sidenote.dailyNoteTemplate` | `# ${date}\n\n- [ ] \n` | Content for daily notes |
| `sidenote.dailyNoteFolder` | `Daily` | Folder for daily notes; empty means the vault root |
| `sidenote.dateFormat` | `YYYY-MM-DD` | Date pattern for templates and daily note filenames |

## Tags

Both styles are recognised, and both feed the Tags section:

```markdown
---
tags: [architecture, backend]
---

# Service Design

Deploy notes live in #ops. Hashtags inside `code spans` and fenced blocks are ignored.
```

## Wiki links

Type `[[` in any Markdown file to autocomplete a note title. Completed links are clickable:

```markdown
See [[Service Design]] before changing the schema.
Labels work too: [[Service Design|the design doc]]
```

Links resolve against note titles, filenames and relative paths, case-insensitively.

## Where your notes live

```
your-project/
└── .notes/              ← sidenote.notesPath
    ├── Daily/
    │   └── 2026-09-02.md
    ├── Quick Note.md    ← the sidebar panel writes here
    └── Architecture.md

~/.sidenote/             ← sidenote.globalNotesPath
    └── Reading List.md
```

Favorites, archive state and recent history are stored in VS Code's own state — workspace notes in workspace state, global notes in global state — so they never pollute your Markdown.

## Requirements

VS Code 1.75 or newer. No runtime dependencies.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). In short:

```bash
npm install
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit
npm run test:coverage # Mocha + c8 coverage gate
npm run build         # production bundle
npm run package       # build the .vsix
```

Press <kbd>F5</kbd> in VS Code to launch an Extension Development Host with Sidenote loaded.

## License

[MIT](LICENSE) © Muhammad Rashed
