import { createWorkItem } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('createWorkItem unit', () => {
  // Test for required title validation
  test('should throw error when title is not provided', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert
    await expect(
      createWorkItem(
        mockConnection,
        'TestProject',
        'Task',
        { title: '' }, // Empty title
      ),
    ).rejects.toThrow('Title is required');
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
      createWorkItem(mockConnection, 'TestProject', 'Task', {
        title: 'Test Task',
      }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      createWorkItem(mockConnection, 'TestProject', 'Task', {
        title: 'Test Task',
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
      createWorkItem(mockConnection, 'TestProject', 'Task', {
        title: 'Test Task',
      }),
    ).rejects.toThrow('Failed to create work item: Unexpected error');
  });

  // Capture the JSON Patch document handed to the Azure DevOps API.
  function mockConnectionCapturingDocument(): {
    connection: any;
    getDocument: () => any[];
  } {
    let captured: any[] = [];
    const connection: any = {
      serverUrl: 'https://example.test',
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createWorkItem: jest
          .fn()
          .mockImplementation((_customHeaders: unknown, document: any[]) => {
            captured = document;
            return Promise.resolve({ id: 1, fields: {} });
          }),
      }),
    };
    return { connection, getDocument: () => captured };
  }

  test('maps severity to the Microsoft.VSTS.Common.Severity field', async () => {
    const { connection, getDocument } = mockConnectionCapturingDocument();

    await createWorkItem(connection, 'TestProject', 'Bug', {
      title: 'Test Bug',
      severity: '1 - Critical',
    });

    const severityOp = getDocument().find(
      (d) => d.path === '/fields/Microsoft.VSTS.Common.Severity',
    );
    expect(severityOp).toEqual({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.Severity',
      value: '1 - Critical',
    });
  });

  test('emits a Markdown multilineFieldsFormat op when descriptionFormat is markdown', async () => {
    const { connection, getDocument } = mockConnectionCapturingDocument();

    await createWorkItem(connection, 'TestProject', 'Task', {
      title: 'Test Task',
      description: '## Heading',
      descriptionFormat: 'markdown',
    });

    const formatOp = getDocument().find(
      (d) => d.path === '/multilineFieldsFormat/System.Description',
    );
    expect(formatOp).toEqual({
      op: 'add',
      path: '/multilineFieldsFormat/System.Description',
      value: 'Markdown',
    });
  });

  test('emits no multilineFieldsFormat op when descriptionFormat is omitted', async () => {
    const { connection, getDocument } = mockConnectionCapturingDocument();

    await createWorkItem(connection, 'TestProject', 'Task', {
      title: 'Test Task',
      description: '<p>html</p>',
    });

    const formatOp = getDocument().find((d) =>
      d.path.startsWith('/multilineFieldsFormat/'),
    );
    expect(formatOp).toBeUndefined();
  });

  test('should include System.Tags patch entry when tags option is provided', async () => {
    const mockCreateWorkItem = jest.fn().mockResolvedValue({ id: 1 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createWorkItem: mockCreateWorkItem,
      }),
    };

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Test Task',
      tags: ['bug', 'frontend'],
    });

    expect(mockCreateWorkItem).toHaveBeenCalledWith(
      null,
      expect.arrayContaining([
        {
          op: 'add',
          path: '/fields/System.Tags',
          value: 'bug; frontend',
        },
      ]),
      'TestProject',
      'Task',
    );
  });

  test('should not include System.Tags patch entry when tags option is empty', async () => {
    const mockCreateWorkItem = jest.fn().mockResolvedValue({ id: 1 });
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        createWorkItem: mockCreateWorkItem,
      }),
    };

    await createWorkItem(mockConnection, 'TestProject', 'Task', {
      title: 'Test Task',
      tags: [],
    });

    const document = mockCreateWorkItem.mock.calls[0][1];
    const tagsPatch = document.find(
      (entry: any) => entry.path === '/fields/System.Tags',
    );
    expect(tagsPatch).toBeUndefined();
  });
});
