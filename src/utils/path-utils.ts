import * as path from 'path';
import * as os from 'os';

/** Names Windows refuses to use for a file, regardless of extension. */
const WINDOWS_RESERVED_NAMES =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Characters that are illegal in a filename on at least one supported platform. */
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;

/** Longest filename we will produce, leaving room for a `-<n>.md` conflict suffix. */
const MAX_FILENAME_LENGTH = 120;

/**
 * Sanitizes a string for use as a single safe filename segment across OSes.
 * Illegal characters become hyphens, runs of hyphens and whitespace are collapsed,
 * and Windows reserved device names are escaped.
 */
export function sanitizeFilename(name: string, fallback = 'Untitled'): string {
  if (!name || !name.trim()) {
    return fallback;
  }

  let sanitized = name
    .trim()
    .replace(ILLEGAL_FILENAME_CHARS, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    // Leading/trailing dots and spaces are invisible or illegal depending on the OS.
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_FILENAME_LENGTH)
    .trim();

  if (!sanitized) {
    return fallback;
  }

  if (WINDOWS_RESERVED_NAMES.test(stripMarkdownExtension(sanitized))) {
    sanitized = `_${sanitized}`;
  }

  return sanitized;
}

/**
 * Sanitizes a user-supplied folder path into a safe root-relative path.
 * Every segment is sanitized individually and `.`/`..` segments are dropped,
 * so the result can never escape the notes root.
 */
export function sanitizeRelativeFolderPath(folderPath: string): string {
  if (!folderPath) {
    return '';
  }

  return folderPath
    .split(/[/\\]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && segment !== '.' && segment !== '..')
    .map((segment) => sanitizeFilename(segment, ''))
    .filter(Boolean)
    .join('/');
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
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
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
