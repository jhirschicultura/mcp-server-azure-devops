import { WebApi } from 'azure-devops-node-api';
import { listWorkItemAttachments } from './feature';
import { createWorkItemAttachment } from '../create-work-item-attachment/feature';
import { createWorkItem } from '../create-work-item/feature';
import {
  getTestConnection,
  shouldSkipIntegrationTest,
} from '@/shared/test/test-helpers';
import {
  CreateWorkItemOptions,
  CreateWorkItemAttachmentOptions,
} from '../types';

const shouldSkip = shouldSkipIntegrationTest();
const describeOrSkip = shouldSkip ? describe.skip : describe;

describeOrSkip('listWorkItemAttachments integration', () => {
  let connection: WebApi;
  let createdWorkItemId: number;
  const attachmentFileName = `list-test-${Date.now()}.txt`;

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
    const uniqueTitle = `List Attachments Test Work Item ${new Date().toISOString()}`;

    const createOptions: CreateWorkItemOptions = {
      title: uniqueTitle,
      description: 'Work item for list attachments integration tests',
    };

    const workItem = await createWorkItem(
      connection,
      projectName,
      'Task',
      createOptions,
    );
    if (!workItem?.id) {
      throw new Error('Failed to create work item for list tests');
    }
    createdWorkItemId = workItem.id;

    // Upload an attachment from base64 content
    const uploadOptions: CreateWorkItemAttachmentOptions = {
      content: Buffer.from('List attachments test content').toString('base64'),
      fileName: attachmentFileName,
      comment: 'List test attachment',
    };

    await createWorkItemAttachment(
      connection,
      createdWorkItemId,
      uploadOptions,
    );
  });

  test('should list the attachments on a work item', async () => {
    // Act - make an actual API call to Azure DevOps
    const result = await listWorkItemAttachments(connection, {
      workItemId: createdWorkItemId,
    });

    // Assert on the actual response
    expect(result.length).toBeGreaterThanOrEqual(1);
    const attachment = result.find((a) => a.fileName === attachmentFileName);
    expect(attachment).toBeDefined();
    expect(attachment?.attachmentId).toMatch(/^[0-9a-f-]+$/i);
    expect(attachment?.url).toContain(attachment?.attachmentId);
    expect(attachment?.comment).toBe('List test attachment');
  });

  test('should return an empty array for a work item with no attachments', async () => {
    // Create a fresh work item with no attachments
    const projectName =
      process.env.AZURE_DEVOPS_DEFAULT_PROJECT || 'DefaultProject';
    const workItem = await createWorkItem(connection, projectName, 'Task', {
      title: `No Attachments Test Work Item ${new Date().toISOString()}`,
    });
    if (!workItem?.id) {
      throw new Error('Failed to create work item');
    }

    const result = await listWorkItemAttachments(connection, {
      workItemId: workItem.id,
    });

    expect(result).toEqual([]);
  });
});
