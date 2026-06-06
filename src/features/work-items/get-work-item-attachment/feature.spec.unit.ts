import { Readable } from 'stream';
import {
  getWorkItemAttachment,
  MAX_INLINE_ATTACHMENT_SIZE_BYTES,
} from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

/**
 * Build a mock connection whose getAttachmentContent returns the given buffer
 */
function mockConnectionWithContent(buffer: Buffer): any {
  return {
    getWorkItemTrackingApi: jest.fn().mockResolvedValue({
      getAttachmentContent: jest.fn().mockResolvedValue(Readable.from(buffer)),
    }),
  };
}

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('getWorkItemAttachment unit', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  // Test for required attachmentId validation
  test('should throw error when attachmentId is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: '', // Empty attachment ID
        outputPath: '/path/to/output.txt',
      }),
    ).rejects.toThrow('Attachment ID is required');
  });

  test('should return images inline as base64 when outputPath is omitted', async () => {
    // Arrange - PNG content returned by the API
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const mockConnection = mockConnectionWithContent(pngBytes);

    // Act
    const result = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'abc-123',
      fileName: 'screenshot.png',
    });

    // Assert
    expect(result).toEqual({
      kind: 'image',
      base64: pngBytes.toString('base64'),
      mimeType: 'image/png',
      fileName: 'screenshot.png',
      size: pngBytes.length,
    });
  });

  test('should return text files inline as text when outputPath is omitted', async () => {
    const textContent = 'line one\nline two';
    const mockConnection = mockConnectionWithContent(Buffer.from(textContent));

    const result = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'abc-123',
      fileName: 'notes.txt',
    });

    expect(result).toEqual({
      kind: 'text',
      text: textContent,
      mimeType: 'text/plain',
      fileName: 'notes.txt',
      size: Buffer.byteLength(textContent),
    });
  });

  test('should return unknown types inline as base64 binary when outputPath is omitted', async () => {
    const binaryBytes = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    const mockConnection = mockConnectionWithContent(binaryBytes);

    const result = await getWorkItemAttachment(mockConnection, {
      attachmentId: 'abc-123',
      fileName: 'data.bin',
    });

    expect(result).toEqual({
      kind: 'binary',
      base64: binaryBytes.toString('base64'),
      mimeType: 'application/octet-stream',
      fileName: 'data.bin',
      size: binaryBytes.length,
    });
  });

  test('should throw error when inline content exceeds the size limit', async () => {
    const hugeBuffer = Buffer.alloc(MAX_INLINE_ATTACHMENT_SIZE_BYTES + 1);
    const mockConnection = mockConnectionWithContent(hugeBuffer);

    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'abc-123',
        fileName: 'huge.png',
      }),
    ).rejects.toThrow(/too large to return inline/);
  });

  // Test for error propagation
  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'abc-123',
        outputPath: '/path/to/output.txt',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'abc-123',
        outputPath: '/path/to/output.txt',
      }),
    ).rejects.toThrow('Custom error');
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    // Act & Assert
    await expect(
      getWorkItemAttachment(mockConnection, {
        attachmentId: 'abc-123',
        outputPath: '/path/to/output.txt',
      }),
    ).rejects.toThrow('Failed to get attachment: Unexpected error');
  });
});
