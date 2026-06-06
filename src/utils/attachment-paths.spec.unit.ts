import * as path from 'path';
import {
  getAttachmentsBaseDir,
  resolveAttachmentPath,
} from './attachment-paths';
import { AzureDevOpsValidationError } from '../shared/errors';

describe('attachment-paths', () => {
  const BASE = path.resolve('/tmp/attachments-base');

  describe('resolveAttachmentPath', () => {
    it('resolves a simple relative path within the base', () => {
      const result = resolveAttachmentPath('report.txt', BASE);
      expect(result).toBe(path.join(BASE, 'report.txt'));
    });

    it('resolves a nested relative path within the base', () => {
      const result = resolveAttachmentPath('sub/dir/report.txt', BASE);
      expect(result).toBe(path.join(BASE, 'sub', 'dir', 'report.txt'));
    });

    it('allows internal traversal that stays within the base', () => {
      const result = resolveAttachmentPath('sub/../report.txt', BASE);
      expect(result).toBe(path.join(BASE, 'report.txt'));
    });

    it('rejects an empty path', () => {
      expect(() => resolveAttachmentPath('', BASE)).toThrow(
        AzureDevOpsValidationError,
      );
    });

    it('rejects parent-directory traversal', () => {
      expect(() => resolveAttachmentPath('../secret.txt', BASE)).toThrow(
        /stay within the attachments directory/,
      );
    });

    it('rejects deep parent-directory traversal', () => {
      expect(() =>
        resolveAttachmentPath('../../../../etc/passwd', BASE),
      ).toThrow(/stay within the attachments directory/);
    });

    it('rejects a POSIX absolute path', () => {
      expect(() => resolveAttachmentPath('/etc/passwd', BASE)).toThrow(
        /absolute paths are not allowed/,
      );
    });

    it('rejects a Windows drive-letter absolute path', () => {
      expect(() =>
        resolveAttachmentPath('C:\\Windows\\System32\\config', BASE),
      ).toThrow(/absolute paths are not allowed/);
    });

    it('rejects a Windows UNC path', () => {
      expect(() =>
        resolveAttachmentPath('\\\\server\\share\\file', BASE),
      ).toThrow(/absolute paths are not allowed/);
    });

    it('rejects a path containing a NUL byte', () => {
      expect(() => resolveAttachmentPath('report\0.txt', BASE)).toThrow(
        /invalid character/,
      );
    });

    it('rejects Windows-style backslash traversal', () => {
      // path.win32.isAbsolute is false for "..\\x", so this exercises the
      // confinement check rather than the absolute-path guard
      const tricky = '..\\..\\secret.txt';
      // On POSIX, backslashes are literal filename chars and stay in-base;
      // on Windows they are separators and escape. Accept either: the
      // result must never be outside BASE.
      let result: string | null = null;
      try {
        result = resolveAttachmentPath(tricky, BASE);
      } catch (e) {
        expect(e).toBeInstanceOf(AzureDevOpsValidationError);
      }
      if (result !== null) {
        expect(result.startsWith(BASE)).toBe(true);
      }
    });
  });

  describe('getAttachmentsBaseDir', () => {
    const original = process.env.AZURE_DEVOPS_ATTACHMENTS_DIR;

    afterEach(() => {
      if (original === undefined) {
        delete process.env.AZURE_DEVOPS_ATTACHMENTS_DIR;
      } else {
        process.env.AZURE_DEVOPS_ATTACHMENTS_DIR = original;
      }
    });

    it('defaults to the current working directory', () => {
      delete process.env.AZURE_DEVOPS_ATTACHMENTS_DIR;
      expect(getAttachmentsBaseDir()).toBe(path.resolve(process.cwd()));
    });

    it('honors AZURE_DEVOPS_ATTACHMENTS_DIR when set', () => {
      process.env.AZURE_DEVOPS_ATTACHMENTS_DIR = '/var/ado-attachments';
      expect(getAttachmentsBaseDir()).toBe(
        path.resolve('/var/ado-attachments'),
      );
    });
  });
});
