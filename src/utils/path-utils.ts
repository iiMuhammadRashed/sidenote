import * as path from 'path';
import * as os from 'os';

/**
 * Sanitizes a string for use as a safe filename across OSes.
 */
export function sanitizeFilename(name: string, fallback = 'Untitled'): string {
  if (!name || !name.trim()) {
    return fallback;
  }

  // Remove invalid filename characters: / \ : * ? " < > | and control chars
  let sanitized = name
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    // Replace multiple hyphens/spaces with a single one
    .replace(/-+/g, '-')
    // Remove leading/trailing dots and spaces
    .replace(/^[.\s]+|[.\s]+$/g, '');

  if (!sanitized) {
    sanitized = fallback;
  }

  return sanitized;
}

/**
 * Ensures a filename ends with the .md extension.
 */
export function ensureMarkdownExtension(filename: string): string {
  if (!filename.toLowerCase().endsWith('.md')) {
    return `${filename}.md`;
  }
  return filename;
}

/**
 * Strips the .md extension from a filename.
 */
export function stripMarkdownExtension(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

/**
 * Resolves ~ to the user's home directory.
 */
export function resolveHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Checks if a path is inside a parent directory (defends against path traversal attacks).
 */
export function isPathInside(parentDir: string, targetPath: string): boolean {
  const rel = path.relative(path.resolve(parentDir), path.resolve(targetPath));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Extracts the first Markdown heading 1 `# Title` from content, or returns fallback.
 */
export function extractTitleFromMarkdown(content: string, fallback: string): string {
  if (!content) {
    return fallback;
  }

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match && match[1]?.trim()) {
      return match[1].trim();
    }
  }

  return fallback;
}

/**
 * Converts an absolute path to a relative path normalized with forward slashes.
 */
export function toRelativePath(rootDir: string, fullPath: string): string {
  const rel = path.relative(rootDir, fullPath);
  return rel.split(path.sep).join('/');
}
