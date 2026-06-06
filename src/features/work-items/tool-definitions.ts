import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from '../../shared/types/tool-definition';
import {
  ListWorkItemsSchema,
  CreateWorkItemSchema,
  UpdateWorkItemSchema,
  ManageWorkItemLinkSchema,
  GetWorkItemSchema,
  ListWorkItemAttachmentsSchema,
  CreateWorkItemAttachmentSchema,
  GetWorkItemAttachmentSchema,
  DeleteWorkItemAttachmentSchema,
} from './schemas';

/**
 * List of work items tools
 */
export const workItemsTools: ToolDefinition[] = [
  {
    name: 'list_work_items',
    description: 'List work items in a project',
    inputSchema: zodToJsonSchema(ListWorkItemsSchema),
  },
  {
    name: 'get_work_item',
    description: 'Get details of a specific work item',
    inputSchema: zodToJsonSchema(GetWorkItemSchema),
  },
  {
    name: 'create_work_item',
    description: 'Create a new work item',
    inputSchema: zodToJsonSchema(CreateWorkItemSchema),
  },
  {
    name: 'update_work_item',
    description: 'Update an existing work item',
    inputSchema: zodToJsonSchema(UpdateWorkItemSchema),
  },
  {
    name: 'manage_work_item_link',
    description: 'Add or remove links between work items',
    inputSchema: zodToJsonSchema(ManageWorkItemLinkSchema),
  },
  {
    name: 'create_work_item_attachment',
    description:
      'Upload a file and attach it to a work item. Provide the file as a local filesystem path (filePath) or as base64-encoded content (content + fileName). The file is uploaded to Azure DevOps and linked to the specified work item.',
    inputSchema: zodToJsonSchema(CreateWorkItemAttachmentSchema),
  },
  {
    name: 'get_work_item_attachment',
    description:
      'Download an attachment from Azure DevOps. If outputPath is provided, the file is saved to the local filesystem. Otherwise the content is returned inline: images are returned as viewable image content (useful for screenshots on bugs), text files as text, and other types as base64. Use list_work_item_attachments to find attachment IDs.',
    inputSchema: zodToJsonSchema(GetWorkItemAttachmentSchema),
  },
  {
    name: 'delete_work_item_attachment',
    description:
      'Delete an attachment from a work item. Use list_work_item_attachments to find attachment IDs.',
    inputSchema: zodToJsonSchema(DeleteWorkItemAttachmentSchema),
  },
  {
    name: 'list_work_item_attachments',
    description:
      'List the attachments on a work item, including each attachment ID, file name, size, and upload date.',
    inputSchema: zodToJsonSchema(ListWorkItemAttachmentsSchema),
  },
];
