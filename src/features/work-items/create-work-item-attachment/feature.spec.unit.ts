import { createWorkItemAttachment, MAX_ATTACHMENT_SIZE_BYTES } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';
import * as fs from 'fs';

// Mock fs.promises (the only fs surface the feature uses)
jest.mock('fs', () => ({
  promises: {
    stat: jest.fn(),
    readFile: jest.fn(),
  },
}));
const mockedFs = jest.mocked(fs);

/** Make fs.promises.stat resolve to a file of the given size */
function mockStatSize(size: number): void {
  (mockedFs.promises.stat as jest.Mock).mockResolvedValue({ size } as fs.Stats);
}

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('createWorkItemAttachment unit', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  // Test for required source validation
  test('should throw error when neither filePath nor content is provided', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: '', // Empty file path
      }),
    ).rejects.toThrow('Either filePath or content is required');
  });

  test('should throw error when both filePath and content are provided', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: 'file.txt',
        content: Buffer.from('test').toString('base64'),
        fileName: 'file.txt',
      }),
    ).rejects.toThrow('Provide either filePath or content, not both');
  });

  test('should throw error when content is provided without fileName', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        content: Buffer.from('test').toString('base64'),
      }),
    ).rejects.toThrow('fileName is required when content is provided');
  });

  test('should reject an absolute filePath outside the attachments dir', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: '/etc/passwd',
      }),
    ).rejects.toThrow(/absolute paths are not allowed/);
  });

  test('should reject a traversal filePath that escapes the attachments dir', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: '../../secret.txt',
      }),
    ).rejects.toThrow(/stay within the attachments directory/);
  });

  test('should reject a filePath whose size exceeds the cap WITHOUT reading the file', async () => {
    // stat reports an oversized file; readFile must never be called
    mockStatSize(MAX_ATTACHMENT_SIZE_BYTES + 1);

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: 'huge-file.bin',
      }),
    ).rejects.toThrow(/Attachment is too large/);

    expect(mockedFs.promises.readFile).not.toHaveBeenCalled();
  });

  test('should reject oversized base64 content WITHOUT allocating the buffer', async () => {
    // A base64 string whose decoded size estimate exceeds the cap.
    // Build a length just over the threshold without allocating real bytes:
    // decoded ≈ len * 3/4, so len ≈ (cap+1) * 4/3.
    const overLength = Math.ceil(((MAX_ATTACHMENT_SIZE_BYTES + 1) * 4) / 3);
    const hugeBase64 = 'A'.repeat(overLength);

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        content: hugeBase64,
        fileName: 'huge.bin',
      }),
    ).rejects.toThrow(/Attachment is too large/);
  });

  test('should throw error when file does not exist (stat rejects)', async () => {
    (mockedFs.promises.stat as jest.Mock).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: 'nonexistent/file.txt',
      }),
    ).rejects.toThrow(/File does not exist/);
  });

  test('should upload a filePath attachment and attach it to the work item', async () => {
    mockStatSize(11);
    (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(
      Buffer.from('hello world'),
    );

    const mockAttachmentUrl =
      'https://dev.azure.com/org/_apis/wit/attachments/abc-123';
    const mockCreateAttachment = jest
      .fn()
      .mockResolvedValue({ id: 'abc-123', url: mockAttachmentUrl });
    const mockUpdateWorkItem = jest
      .fn()
      .mockResolvedValue({ id: 123, relations: [] });

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createAttachment: mockCreateAttachment,
        updateWorkItem: mockUpdateWorkItem,
      }),
    };

    const result = await createWorkItemAttachment(mockConnection, 123, {
      filePath: 'report.txt',
    });

    expect(result).toEqual({ id: 123, relations: [] });
    expect(mockedFs.promises.readFile).toHaveBeenCalledTimes(1);
    expect(mockCreateAttachment).toHaveBeenCalledWith(
      {},
      expect.anything(),
      'report.txt',
      undefined,
      undefined,
    );
  });

  test('should upload base64 content and attach it to the work item', async () => {
    const mockAttachmentUrl =
      'https://dev.azure.com/org/_apis/wit/attachments/abc-123';
    const mockCreateAttachment = jest
      .fn()
      .mockResolvedValue({ id: 'abc-123', url: mockAttachmentUrl });
    const mockUpdateWorkItem = jest
      .fn()
      .mockResolvedValue({ id: 123, relations: [] });

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createAttachment: mockCreateAttachment,
        updateWorkItem: mockUpdateWorkItem,
      }),
    };

    const result = await createWorkItemAttachment(mockConnection, 123, {
      content: Buffer.from('generated report').toString('base64'),
      fileName: 'report.txt',
      comment: 'Generated by automation',
    });

    expect(result).toEqual({ id: 123, relations: [] });
    expect(mockCreateAttachment).toHaveBeenCalledWith(
      {},
      expect.anything(),
      'report.txt',
      undefined,
      undefined,
    );
    expect(mockUpdateWorkItem).toHaveBeenCalledWith(
      {},
      [
        {
          op: 'add',
          path: '/relations/-',
          value: {
            rel: 'AttachedFile',
            url: mockAttachmentUrl,
            attributes: {
              name: 'report.txt',
              comment: 'Generated by automation',
            },
          },
        },
      ],
      123,
      undefined,
      false,
      false,
      false,
      expect.anything(),
    );
    // No filesystem access for base64 content
    expect(mockedFs.promises.readFile).not.toHaveBeenCalled();
  });

  // Test for error propagation
  test('should propagate custom errors when thrown internally', async () => {
    mockStatSize(11);
    (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(
      Buffer.from('test content'),
    );

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: 'file.txt',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: 'file.txt',
      }),
    ).rejects.toThrow('Custom error');
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    mockStatSize(11);
    (mockedFs.promises.readFile as jest.Mock).mockResolvedValue(
      Buffer.from('test content'),
    );

    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    await expect(
      createWorkItemAttachment(mockConnection, 123, {
        filePath: 'file.txt',
      }),
    ).rejects.toThrow('Failed to create attachment: Unexpected error');
  });
});
