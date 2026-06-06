import { WebApi } from 'azure-devops-node-api';
import { deleteWorkItemAttachment } from './feature';
import { createWorkItemAttachment } from '../create-work-item-attachment/feature';
import { createWorkItem } from '../create-work-item/feature';
import { getWorkItem } from '../get-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
  DeleteWorkItemAttachmentOptions,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('deleteWorkItemAttachment integration', () => {
  let connection: WebApi;
  let createdWorkItemId: number;
  let uploadedAttachmentId: string;
  let testFilePath: string;

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
    const uniqueTitle = `Delete Attachment Test Work Item ${new Date().toISOString()}`;

    const createOptions: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'Work item for delete attachment integration tests',
    };

    const workItem = await createWorkItem(
      connection,
      projectName,
      'Task',
      createOptions,
    );
    if (!workItem?.id) {
      throw new Error('Failed to create work item for delete tests');
    }
    createdWorkItemId = workItem.id;

    // Create a temporary test file and upload it
    const tempDir = os.tmpdir();
    testFilePath = path.join(tempDir, `test-delete-${Date.now()}.txt`);
    fs.writeFileSync(
      testFilePath,
      'This is test content for delete integration tests.',
    );

    // Upload an attachment to the work item
    const uploadOptions: CreateWorkItemAttachmentOptions = {
      filePath: testFilePath,
      fileName: 'test-delete-file.txt',
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
      throw new Error('Failed to upload attachment for delete tests');
    }
    // Extract attachment ID from URL (last segment)
    const urlParts = attachmentRelation.url.split('/');
    uploadedAttachmentId = urlParts[urlParts.length - 1];
  });

  afterAll(() => {
    // Clean up the temporary test file
    if (testFilePath && fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  test('should delete an attachment from a work item', async () => {
    const options: DeleteWorkItemAttachmentOptions = {
      workItemId: createdWorkItemId,
      attachmentId: uploadedAttachmentId,
    };

    // Act - make an actual API call to Azure DevOps
    const result = await deleteWorkItemAttachment(connection, options);

    // Assert on the actual response
    expect(result).toBeDefined();
    expect(result.id).toBe(createdWorkItemId);

    // Verify the attachment was removed by fetching the work item
    const updatedWorkItem = await getWorkItem(
      connection,
      createdWorkItemId,
      'relations',
    );
    const attachmentRelation = updatedWorkItem.relations?.find(
      (r) => r.rel === 'AttachedFile' && r.url?.includes(uploadedAttachmentId),
    );
    expect(attachmentRelation).toBeUndefined();
  });

  test('should throw error when attachment does not exist on work item', async () => {
    const options: DeleteWorkItemAttachmentOptions = {
      workItemId: createdWorkItemId,
      attachmentId: '00000000-0000-0000-0000-000000000000', // Non-existent GUID
    };

    // Act & Assert - should throw an error for non-existent attachment
    await expect(deleteWorkItemAttachment(connection, options)).rejects.toThrow(
      /Failed to delete attachment|not found|does not exist/i,
    );
  });
});
