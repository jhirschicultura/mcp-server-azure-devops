import { WebApi } from 'azure-devops-node-api';
import { getWorkItemAttachment } from './feature';
import { createWorkItemAttachment } from '../create-work-item-attachment/feature';
import { createWorkItem } from '../create-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
  GetWorkItemAttachmentOptions,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('getWorkItemAttachment integration', () => {
  let connection: WebApi;
  let createdWorkItemId: number;
  let uploadedAttachmentId: string;
  let testFilePath: string;
  let downloadPath: string;
  const testFileContent =
    'This is test content for download integration tests.';

  beforeAll(async () => {
    // Get a real connection using environment variables
    const testConnection = await getTestConnection();
    if (!testConnection) {
      throw new Error(
        'Connection should be available when integration tests are enabled',
      );
    }
    connection = testConnection;

    // Create a work item to be used by the attachment tests
    const projectName =
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const uniqueTitle = `Download Attachment Test Work Item ${new Date().toISOString()}`;

    const createOptions: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'Work item for download attachment integration tests',
    };

    const workItem = await createWorkItem(
      connection,
      projectName,
      'Task',
      createOptions,
    );
    if (!workItem?.id) {
      throw new Error('Failed to create work item for download tests');
    }
    createdWorkItemId = workItem.id;

    // Create a temporary test file and upload it
    const tempDir = os.tmpdir();
    testFilePath = path.join(tempDir, `test-download-${Date.now()}.txt`);
    fs.writeFileSync(testFilePath, testFileContent);

    // Upload an attachment to the work item
    const uploadOptions: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
      fileName: 'test-download-file.txt',
    };

    const updatedWorkItem = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      uploadOptions,
    );

    // Find the attachment ID from the relations
    const attachmentRelation = updatedWorkItem.relations?.find(
      (r) => r.rel === 'AttachedFile',
    );
    if (!attachmentRelation?.url) {
      throw new Error('Failed to upload attachment for download tests');
    }
    // Extract attachment ID from URL (last segment)
    const urlParts = attachmentRelation.url.split('/');
    uploadedAttachmentId = urlParts[urlParts.length - 1];

    // Set up download path
    downloadPath = path.join(tempDir, `downloaded-${Date.now()}.txt`);
  });

  afterAll(() => {
    // Clean up the temporary test files
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    if (downloadPath && fs.existsSync(downloadPath)) {
      fs.unlinkSync(downloadPath);
    }
  });

  test('should download an attachment from Azure DevOps', async () => {
    const options: GetWorkItemAttachmentOptions = {
      attachmentId: uploadedAttachmentId,
      outputPath: downloadPath,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await getWorkItemAttachment(connection, options);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.kind).toBe('file');
    if (result.kind !== 'file') {
      throw new Error('Expected file result');
    }
    expect(result.filePath).toBe(downloadPath);
    expect(result.size).toBeGreaterThan(0);

    // Verify the file was downloaded
    expect(fs.existsSync(downloadPath)).toBe(true);

    // Verify the content matches
    const downloadedContent = fs.readFileSync(downloadPath, 'utf-8');
    expect(downloadedContent).toBe(testFileContent);
  });

  test('should return text content inline when outputPath is omitted', async () => {
    const options: GetWorkItemAttachmentOptions = {
      attachmentId: uploadedAttachmentId,
      fileName: 'test-download-file.txt',
    };

    // Act - make an actual API call to Azure DevOps
    const result = await getWorkItemAttachment(connection, options);

    // Assert - text attachments come back inline
    expect(result.kind).toBe('text');
    if (result.kind !== 'text') {
      throw new Error('Expected text result');
    }
    expect(result.text).toBe(testFileContent);
    expect(result.mimeType).toBe('text/plain');
  });

  test('should throw error when attachment does not exist', async () => {
    const tempDir = os.tmpdir();
    const nonExistentDownloadPath = path.join(
      tempDir,
      `nonexistent-${Date.now()}.txt`,
    );

    const options: GetWorkItemAttachmentOptions = {
      attachmentId: '00000000-0000-0000-0000-000000000000', // Non-existent GUID
      outputPath: nonExistentDownloadPath,
    };

    // Act & Assert - should throw an error for non-existent attachment
    await expect(getWorkItemAttachment(connection, options)).rejects.toThrow(
      /Failed to get attachment|not found|404/i,
    );

    // Clean up if file was somehow created
    if (fs.existsSync(nonExistentDownloadPath)) {
      fs.unlinkSync(nonExistentDownloadPath);
    }
  });
});
