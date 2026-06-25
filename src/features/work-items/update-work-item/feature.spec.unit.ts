import { updateWorkItem } from './feature';
import { AzureDevOpsError } from '../../../shared/errors';

// Unit tests should only focus on isolated logic
// No real connections, HTTP requests, or dependencies
describe('updateWorkItem unit', () => {
  test('should throw error when no fields are provided for update', async () => {
    // Arrange - mock connection, never used due to validation error
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn(),
    };

    // Act & Assert - empty options object should throw
    await expect(
      updateWorkItem(
        mockConnection,
        123,
        {}, // No fields to update
      ),
    ).rejects.toThrow('At least one field must be provided for update');
  });

  test('should propagate custom errors when thrown internally', async () => {
    // Arrange
    const mockConnection: any = {
      getWorkItemTrackingApi: jest.fn().mockImplementation(() => {
        throw new AzureDevOpsError('Custom error');
      }),
    };

    // Act & Assert
    await expect(
      updateWorkItem(mockConnection, 123, { title: 'Updated Title' }),
    ).rejects.toThrow(AzureDevOpsError);

    await expect(
      updateWorkItem(mockConnection, 123, { title: 'Updated Title' }),
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
      updateWorkItem(mockConnection, 123, { title: 'Updated Title' }),
    ).rejects.toThrow('Failed to update work item: Unexpected error');
  });

  // Capture the JSON Patch document handed to the Azure DevOps API so we can
  // assert which op is emitted per field.
  function mockConnectionCapturingDocument(): {
    connection: any;
    getDocument: () => any[];
  } {
    let captured: any[] = [];
    const connection: any = {
      getWorkItemTrackingApi: jest.fn().mockResolvedValue({
        updateWorkItem: jest
          .fn()
          .mockImplementation((_headers: unknown, document: any[]) => {
            captured = document;
            return Promise.resolve({ id: 123, fields: {} });
          }),
      }),
    };
    return { connection, getDocument: () => captured };
  }

  test('uses a replace op for System.Tags so the tag set is set, not merged', async () => {
    // A JSON Patch `add` on System.Tags merges into the existing tags (cannot
    // remove); `replace` makes the supplied list the exact tag set.
    const { connection, getDocument } = mockConnectionCapturingDocument();

    await updateWorkItem(connection, 123, {
      additionalFields: {
        'System.Tags': 'multi-tenant; operational-intelligence; ready-for-spec',
      },
    });

    const tagsOp = getDocument().find((d) => d.path === '/fields/System.Tags');
    expect(tagsOp).toEqual({
      op: 'replace',
      path: '/fields/System.Tags',
      value: 'multi-tenant; operational-intelligence; ready-for-spec',
    });
  });

  test('still uses an add op for non-tag additional fields', async () => {
    const { connection, getDocument } = mockConnectionCapturingDocument();

    await updateWorkItem(connection, 123, {
      additionalFields: {
        'System.History': '<p>note</p>',
        'System.Tags': 'alpha; beta',
      },
    });

    const historyOp = getDocument().find(
      (d) => d.path === '/fields/System.History',
    );
    expect(historyOp?.op).toBe('add');
    const tagsOp = getDocument().find((d) => d.path === '/fields/System.Tags');
    expect(tagsOp?.op).toBe('replace');
  });
});
