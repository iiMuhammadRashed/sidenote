# Contributing to Sidebar Notes

Thank you for your interest in contributing to **Sidebar Notes**! We welcome bug reports, feature suggestions, and pull requests.

## Development Setup

1. **Fork and clone** the repository:
   ```bash
   git clone https://github.com/iiMuhammadRashed/sidebar-notes.git
   cd sidebar-notes
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in development**:
   - Open the project in VS Code.
   - Press `F5` to open a new Extension Development Host window.

## Quality Standards

Before submitting a Pull Request, please ensure all checks pass:

```bash
# 1. Run ESLint
npm run lint

# 2. Run TypeScript strict typecheck
npm run typecheck

# 3. Run unit tests
npm run test-unit

# 4. Verify production build and packaging
npm run build
npm run package
```

## Pull Request Guidelines

1. Keep commits focused and descriptive using [Conventional Commits](https://www.conventionalcommits.org/) (e.g. `feat: add tag coloring`, `fix: handle empty title input`).
2. Add unit tests for any new logic or bug fixes.
3. Keep the architecture minimal and avoid introducing heavy external dependencies.
