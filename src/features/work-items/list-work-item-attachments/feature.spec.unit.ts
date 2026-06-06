import { listWorkItemAttachments } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

/**
 * Build a mock connection whose getWorkItem returns the given work item
 */
function mockConnectionWithWorkItem(workItem: unknown): any {
  return {
    getWorkItemTrackingApi: jest.fn().mockResolvedValue({
      getWorkItem: jest.fn().mockResolvedValue(workItem),
    }),
  };
}

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('listWorkItemAttachments unit', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  test('should return only AttachedFile relations mapped to attachment info', async () => {
    // Arrange - work item with mixed relation types
    const mockConnection = mockConnectionWithWorkItem({
      id: 123,
      relations: [
        {
          rel: 'AttachedFile',
          url: 'https://dev.azure.com/org/proj/_apis/wit/attachments/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          attributes: {
            name: 'screenshot.png',
            comment: 'Repro screenshot',
            resourceSize: 2048,
            authorizedDate: '2026-01-15T10:00:00Z',
          },
        },
        {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: 'https://dev.azure.com/org/proj/_apis/wit/workItems/100',
        },
        {
          rel: 'AttachedFile',
          url: 'https://dev.azure.com/org/proj/_apis/wit/attachments/11111111-2222-3333-4444-555555555555',
          attributes: {
            name: 'log.txt',
          },
        },
      ],
    });

    // Act
    const result = await listWorkItemAttachments(mockConnection, {
      workItemId: 123,
    });

    // Assert
    expect(result).toEqual([
      {
        attachmentId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        fileName: 'screenshot.png',
        url: 'https://dev.azure.com/org/proj/_apis/wit/attachments/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        comment: 'Repro screenshot',
        resourceSize: 2048,
        authorizedDate: '2026-01-15T10:00:00Z',
      },
      {
        attachmentId: '11111111-2222-3333-4444-555555555555',
        fileName: 'log.txt',
        url: 'https://dev.azure.com/org/proj/_apis/wit/attachments/11111111-2222-3333-4444-555555555555',
      },
    ]);
  });

  test('should return an empty array when the work item has no relations', async () => {
    const mockConnection = mockConnectionWithWorkItem({ id: 123 });

    const result = await listWorkItemAttachments(mockConnection, {
      workItemId: 123,
    });

    expect(result).toEqual([]);
  });

  test('should throw error when the work item is not found', async () => {
    const mockConnection = mockConnectionWithWorkItem(undefined);

    await expect(
      listWorkItemAttachments(mockConnection, { workItemId: 999 }),
    ).rejects.toThrow('Work item 999 not found');
  });

  // Test for error propagation
  test('should propagate custom errors when thrown internally', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    await expect(
      listWorkItemAttachments(mockConnection, { workItemId: 123 }),
    ).rejects.toThrow(AzureDevOpsError);
  });

  test('should wrap unexpected errors in a friendly error message', async () => {
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }),
    };

    await expect(
      listWorkItemAttachments(mockConnection, { workItemId: 123 }),
    ).rejects.toThrow('Failed to list attachments: Unexpected error');
  });
});
