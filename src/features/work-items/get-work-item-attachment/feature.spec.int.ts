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
  let attachmentsDir: string;
  let downloadName: string;
  let prevAttachmentsDir: string | undefined;
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

    // Sandbox file operations to a dedicated temp directory
    attachmentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-att-get-'));
    prevAttachmentsDir = process.env.AZURE_DEVOPS_ATTACHMENTS_DIR;
    process.env.AZURE_DEVOPS_ATTACHMENTS_DIR = attachmentsDir;

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

    // Create a test file inside the sandbox and upload it
    const uploadName = `test-download-${Date.now()}.txt`;
    fs.writeFileSync(path.join(attachmentsDir, uploadName), testFileContent);

    // Upload an attachment to the work item
    const uploadOptions: CreateWorkItemAttachmentOptions = {
      filePath: uploadName,
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

    // Set up download path (relative to the sandbox)
    downloadName = `downloaded-${Date.now()}.txt`;
  });

  afterAll(() => {
    // Restore the env and clean up the temp directory
    if (prevAttachmentsDir === undefined) {
      delete process.env.AZURE_DEVOPS_ATTACHMENTS_DIR;
    } else {
      process.env.AZURE_DEVOPS_ATTACHMENTS_DIR = prevAttachmentsDir;
    }
    if (attachmentsDir && fs.existsSync(attachmentsDir)) {
      fs.rmSync(attachmentsDir, { recursive: true, force: true });
    }
  });

  test('should download an attachment from Azure DevOps', async () => {
    const options: GetWorkItemAttachmentOptions = {
      attachmentId: uploadedAttachmentId,
      outputPath: downloadName,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await getWorkItemAttachment(connection, options);

    const expectedPath = path.join(attachmentsDir, downloadName);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.kind).toBe('file');
    if (result.kind !== 'file') {
      throw new Error('Expected file result');
    }
    expect(result.filePath).toBe(expectedPath);
    expect(result.size).toBeGreaterThan(0);

    // Verify the file was downloaded
    expect(fs.existsSync(expectedPath)).toBe(true);

    // Verify the content matches
    const downloadedContent = fs.readFileSync(expectedPath, 'utf-8');
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
    const nonExistentDownloadName = `nonexistent-${Date.now()}.txt`;

    const options: GetWorkItemAttachmentOptions = {
      attachmentId: '00000000-0000-0000-0000-000000000000', // Non-existent GUID
      outputPath: nonExistentDownloadName,
    };

    // Act & Assert - should throw an error for non-existent attachment
    await expect(getWorkItemAttachment(connection, options)).rejects.toThrow(
      /Failed to get attachment|not found|404/i,
    );
  });

  test('should reject an absolute outputPath outside the attachments dir', async () => {
    const options: GetWorkItemAttachmentOptions = {
      attachmentId: uploadedAttachmentId,
      fileName: 'test-download-file.txt',
      outputPath: '/etc/cron.d/evil',
    };

    await expect(getWorkItemAttachment(connection, options)).rejects.toThrow(
      /absolute paths are not allowed/,
    );
  });
});
