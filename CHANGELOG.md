# Changelog

All notable changes to the **Sidebar Notes** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-02

### Added
- **Native Sidebar TreeView**: Dedicated Activity Bar container with collapsible sections (Favorites, Recent Notes, Workspace Notes, Global Notes, Tags, Archive).
- **Filesystem-driven Architecture**: Notes are stored as standard `.md` Markdown files in workspace (`.notes/`) or global directory (`~/.sidebar-notes/`).
- **Drag & Drop Reorganization**: Move notes into folders or across workspace/global scopes seamlessly.
- **Fast Full-Text & Tag Search**: Interactive QuickPick palette matching title, folder path, tags (`#tag`), and full note content with live snippets.
- **Wiki-Style Linking (`[[Note Title]]`)**: Auto-completion on `[[` and clickable document links navigating directly to target notes.
- **Quick Capture & Daily Scratchpad**: One-key capture shortcut (`Ctrl+Alt+N` / `Cmd+Alt+N`) and daily scratchpad jump (`Ctrl+Alt+D` / `Cmd+Alt+D`).
- **Tagging Engine**: Automatic parsing of inline hashtags (excluding markdown headings and code blocks) and YAML frontmatter tags.
- **Debounced FileSystemWatcher**: Automatic real-time synchronization with external filesystem changes.
- **Status Bar Integration**: Configurable quick note button in the status bar.
- **Comprehensive Unit Test Suite**: 40+ unit tests with 100% test pass rate across all services, path utilities, and metadata persistence.
- **esbuild Pipeline**: High-performance production bundling producing ultra-compact, single-file bundles (~35KB).
