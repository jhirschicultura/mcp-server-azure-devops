import * as path from 'path';
import { AzureDevOpsValidationError } from '../shared/errors';

/**
 * Returns the base directory that attachment file paths are confined to.
 *
 * Defaults to the current working directory. Override with the
 * AZURE_DEVOPS_ATTACHMENTS_DIR environment variable to point at a
 * dedicated, sandboxed location.
 */
export function getAttachmentsBaseDir(): string {
  const configured = process.env.AZURE_DEVOPS_ATTACHMENTS_DIR;
  return path.resolve(
    configured && configured.trim() ? configured : process.cwd(),
  );
}

/**
 * Resolve a user-supplied attachment path and confine it to the
 * attachments base directory.
 *
 * The path is treated as relative to the base directory. Absolute paths,
 * `..` traversal, and (on Windows) drive-letter or UNC paths that escape
 * the base are all rejected. This prevents a prompt-injection scenario
 * where a tool argument is used to read arbitrary local files (for
 * exfiltration via upload) or overwrite arbitrary local files.
 *
 * @param inputPath The path provided in the tool arguments
 * @param baseDir The confinement root (defaults to getAttachmentsBaseDir())
 * @returns The absolute, validated path within baseDir
 * @throws {AzureDevOpsValidationError} If the path escapes baseDir
 */
export function resolveAttachmentPath(
  inputPath: string,
  baseDir: string = getAttachmentsBaseDir(),
): string {
  if (!inputPath || !inputPath.trim()) {
    throw new AzureDevOpsValidationError('A file path is required');
  }

  // Reject NUL bytes outright (can truncate paths in some syscalls)
  if (inputPath.includes('\0')) {
    throw new AzureDevOpsValidationError(
      'File path contains an invalid character',
    );
  }

  const normalizedBase = path.resolve(baseDir);

  // Reject anything that is already absolute (POSIX /…, Windows C:\…,
  // or UNC \\server\share) — callers must pass paths relative to the base.
  if (path.isAbsolute(inputPath) || path.win32.isAbsolute(inputPath)) {
    throw new AzureDevOpsValidationError(
      `File path must be relative to the attachments directory (${normalizedBase}); absolute paths are not allowed`,
    );
  }

  const resolved = path.resolve(normalizedBase, inputPath);

  // Confinement check: resolved must be the base itself or a descendant.
  const relative = path.relative(normalizedBase, resolved);
  const escapes =
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative);

  if (escapes) {
    throw new AzureDevOpsValidationError(
      `File path must stay within the attachments directory (${normalizedBase})`,
    );
  }

  return resolved;
}
