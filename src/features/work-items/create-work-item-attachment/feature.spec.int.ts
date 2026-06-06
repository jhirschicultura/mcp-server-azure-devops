import { WebApi } from 'azure-devops-node-api';
import { createWorkItemAttachment } from './feature';
import { createWorkItem } from '../create-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('createWorkItemAttachment integration', () => {
  let connection: WebApi;
  let createdWorkItemId: number;
  let attachmentsDir: string;
  let testFileName: string;
  let prevAttachmentsDir: string | undefined;

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
    attachmentsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ado-att-create-'));
    prevAttachmentsDir = process.env.AZURE_DEVOPS_ATTACHMENTS_DIR;
    process.env.AZURE_DEVOPS_ATTACHMENTS_DIR = attachmentsDir;

    // Create a work item to be used by the attachment tests
    const projectName =
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const uniqueTitle = `Attachment Test Work Item ${new Date().toISOString()}`;

    const options: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'Work item for attachment integration tests',
    };

    const workItem = await createWorkItem(
      connection,
      projectName,
      'Task',
      options,
    );
    if (!workItem?.id) {
      throw new Error('Failed to create work item for attachment tests');
    }
    createdWorkItemId = workItem.id;

    // Create a test file inside the sandbox; pass it by relative name
    testFileName = `test-attachment-${Date.now()}.txt`;
    fs.writeFileSync(
      path.join(attachmentsDir, testFileName),
      'This is a test file for attachment integration tests.',
    );
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

  test('should add an attachment to a work item', async () => {
    const options: CreateWorkItemAttachmentOptions = {
      filePath: testFileName,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      options,
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify the attachment was added
    expect(result.relations).toBeDefined();
    const attachmentRelation = result.relations?.find(
      (relation) => relation.rel === 'AttachedFile',
    );
    expect(attachmentRelation).toBeDefined();
  });

  test('should add an attachment with a custom file name', async () => {
    const customFileName = `custom-name-${Date.now()}.txt`;
    const options: CreateWorkItemAttachmentOptions = {
      filePath: testFileName,
      fileName: customFileName,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      options,
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify the attachment was added with the custom name
    expect(result.relations).toBeDefined();
    const attachmentRelation = result.relations?.find(
      (relation) =>
        relation.rel === 'AttachedFile' &&
        relation.attributes?.name === customFileName,
    );
    expect(attachmentRelation).toBeDefined();
  });

  test('should add an attachment with a comment', async () => {
    const comment = 'Test attachment comment';
    const options: CreateWorkItemAttachmentOptions = {
      filePath: testFileName,
      comment: comment,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      options,
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify the attachment was added with the comment
    expect(result.relations).toBeDefined();
    const attachmentRelation = result.relations?.find(
      (relation) =>
        relation.rel === 'AttachedFile' &&
        relation.attributes?.comment === comment,
    );
    expect(attachmentRelation).toBeDefined();
  });

  test('should add an attachment from base64 content', async () => {
    const fileName = `base64-content-${Date.now()}.txt`;
    const options: CreateWorkItemAttachmentOptions = {
      content: Buffer.from('Base64 attachment content').toString('base64'),
      fileName,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      options,
    );

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify the attachment was added with the given name
    expect(result.relations).toBeDefined();
    const attachmentRelation = result.relations?.find(
      (relation) =>
        relation.rel === 'AttachedFile' &&
        relation.attributes?.name === fileName,
    );
    expect(attachmentRelation).toBeDefined();
  });

  test('should throw error when file does not exist', async () => {
    const options: CreateWorkItemAttachmentOptions = {
      filePath: 'nonexistent/file.txt',
    };

    // Act & Assert - should throw an error for non-existent file
    await expect(
      createWorkItemAttachment(connection, createdWorkItemId, options),
    ).rejects.toThrow(/Failed to create attachment|ENOENT|does not exist/);
  });

  test('should reject an absolute filePath outside the attachments dir', async () => {
    const options: CreateWorkItemAttachmentOptions = {
      filePath: '/etc/passwd',
    };

    await expect(
      createWorkItemAttachment(connection, createdWorkItemId, options),
    ).rejects.toThrow(/absolute paths are not allowed/);
  });
});
