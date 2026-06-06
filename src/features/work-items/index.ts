// Re-export schemas and types
export * from './schemas';
export * from './types';

// Re-export features
export * from './list-work-items';
export * from './get-work-item';
export * from './create-work-item';
export * from './update-work-item';
export * from './manage-work-item-link';
export * from './create-work-item-attachment';
export * from './get-work-item-attachment';
export * from './delete-work-item-attachment';
export * from './list-work-item-attachments';

// Export tool definitions
export * from './tool-definitions';

// New exports for request handling
import {
  CallToolRequest,
  CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { WebApi } from 'azure-devops-node-api';
import {
  RequestIdentifier,
  RequestHandler,
} from '../../shared/types/request-handler';
import { defaultProject } from '../../utils/environment';
import {
  ListWorkItemsSchema,
  GetWorkItemSchema,
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ManageWorkItemLinkSchema,
  CreateWorkItemAttachmentSchema,
  GetWorkItemAttachmentSchema,
  DeleteWorkItemAttachmentSchema,
  ListWorkItemAttachmentsSchema,
  listWorkItems,
  getWorkItem,
  createWorkItem,
  updateWorkItem,
  manageWorkItemLink,
  createWorkItemAttachment,
  getWorkItemAttachment,
  deleteWorkItemAttachment,
  listWorkItemAttachments,
} from './';

// Define the response type based on observed usage
interface CallToolResponse {
  content: Array<{ type: string; text: string }>;
}

/**
 * Checks if the request is for the work items feature
 */
export const isWorkItemsRequest: RequestIdentifier = (
  request: CallToolRequest,
): boolean => {
  const toolName = request.params.name;
  return [
    'get_work_item',
    'list_work_items',
    'create_work_item',
    'update_work_item',
    'manage_work_item_link',
    'create_work_item_attachment',
    'get_work_item_attachment',
    'delete_work_item_attachment',
    'list_work_item_attachments',
  ].includes(toolName);
};

/**
 * Handles work items feature requests
 */
export const handleWorkItemsRequest: RequestHandler = async (
  connection: WebApi,
  request: CallToolRequest,
): Promise<CallToolResponse | CallToolResult> => {
  switch (request.params.name) {
    case 'get_work_item': {
      const args = GetWorkItemSchema.parse(request.params.arguments);
      const result = await getWorkItem(
        connection,
        args.workItemId,
        args.expand,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'list_work_items': {
      const args = ListWorkItemsSchema.parse(request.params.arguments);
      const result = await listWorkItems(connection, {
        projectId: args.projectId ?? defaultProject,
        teamId: args.teamId,
        queryId: args.queryId,
        wiql: args.wiql,
        top: args.top,
        skip: args.skip,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'create_work_item': {
      const args = CreateWorkItemSchema.parse(request.params.arguments);
      const result = await createWorkItem(
        connection,
        args.projectId ?? defaultProject,
        args.workItemType,
        {
          title: args.title,
          description: args.description,
          assignedTo: args.assignedTo,
          areaPath: args.areaPath,
          iterationPath: args.iterationPath,
          priority: args.priority,
          parentId: args.parentId,
          additionalFields: args.additionalFields,
        },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'update_work_item': {
      const args = UpdateWorkItemSchema.parse(request.params.arguments);
      const result = await updateWorkItem(connection, args.workItemId, {
        title: args.title,
        description: args.description,
        assignedTo: args.assignedTo,
        areaPath: args.areaPath,
        iterationPath: args.iterationPath,
        priority: args.priority,
        state: args.state,
        additionalFields: args.additionalFields,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'manage_work_item_link': {
      const args = ManageWorkItemLinkSchema.parse(request.params.arguments);
      const result = await manageWorkItemLink(
        connection,
        args.projectId ?? defaultProject,
        {
          sourceWorkItemId: args.sourceWorkItemId,
          targetWorkItemId: args.targetWorkItemId,
          operation: args.operation,
          relationType: args.relationType,
          newRelationType: args.newRelationType,
          comment: args.comment,
        },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'create_work_item_attachment': {
      const args = CreateWorkItemAttachmentSchema.parse(
        request.params.arguments,
      );
      const result = await createWorkItemAttachment(
        connection,
        args.workItemId,
        {
          filePath: args.filePath,
          content: args.content,
          fileName: args.fileName,
          comment: args.comment,
        },
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'get_work_item_attachment': {
      const args = GetWorkItemAttachmentSchema.parse(request.params.arguments);
      const result = await getWorkItemAttachment(connection, {
        attachmentId: args.attachmentId,
        fileName: args.fileName,
        outputPath: args.outputPath,
      });

      switch (result.kind) {
        case 'image':
          // Return the image as viewable MCP image content
          return {
            content: [
              {
                type: 'image',
                data: result.base64,
                mimeType: result.mimeType,
              },
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    fileName: result.fileName,
                    mimeType: result.mimeType,
                    size: result.size,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        case 'text':
          // Return the text content, plus a metadata block preserving the
          // detected mimeType (e.g. image/svg+xml, application/json) which a
          // plain text block cannot carry on its own.
          return {
            content: [
              { type: 'text', text: result.text },
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    fileName: result.fileName,
                    mimeType: result.mimeType,
                    size: result.size,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        case 'binary':
          // Return binary content as an embedded base64 resource
          return {
            content: [
              {
                type: 'resource',
                resource: {
                  uri: `azure-devops://attachments/${args.attachmentId}`,
                  blob: result.base64,
                  mimeType: result.mimeType,
                },
              },
            ],
          };
        default:
          // Saved to disk
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
      }
    }
    case 'list_work_item_attachments': {
      const args = ListWorkItemAttachmentsSchema.parse(
        request.params.arguments,
      );
      const result = await listWorkItemAttachments(connection, {
        workItemId: args.workItemId,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    case 'delete_work_item_attachment': {
      const args = DeleteWorkItemAttachmentSchema.parse(
        request.params.arguments,
      );
      const result = await deleteWorkItemAttachment(connection, {
        workItemId: args.workItemId,
        attachmentId: args.attachmentId,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    default:
      throw new Error(`Unknown work items tool: ${request.params.name}`);
  }
};
