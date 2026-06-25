import { z } from 'zod';
import { defaultProject, defaultOrg } from '../../utils/environment';

/**
 * Schema for getting a work item
 */
export const GetWorkItemSchema = z.object({
  workItemId: z.number().describe('The ID of the work item'),
  expand: z
    .enum(['none', 'relations', 'fields', 'links', 'all'])
    .optional()
    .describe(
      'The level of detail to include in the response. Defaults to "all" if not specified.',
    ),
});

/**
 * Schema for listing work items
 */
export const ListWorkItemsSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  teamId: z.string().optional().describe('The ID of the team'),
  queryId: z.string().optional().describe('ID of a saved work item query'),
  wiql: z.string().optional().describe('Work Item Query Language (WIQL) query'),
  top: z.number().optional().describe('Maximum number of work items to return'),
  skip: z.number().optional().describe('Number of work items to skip'),
});

/**
 * Schema for creating a work item
 */
export const CreateWorkItemSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  workItemType: z
    .string()
    .describe(
      'The type of work item to create (e.g., "Task", "Bug", "User Story")',
    ),
  title: z.string().describe('The title of the work item'),
  description: z
    .string()
    .optional()
    .describe(
      'Work item description. Defaults to HTML format (use HTML markup, not CDATA). To send Markdown instead, set descriptionFormat to "markdown" (requires Azure DevOps Services or Server 2022.1+).',
    ),
  descriptionFormat: z
    .enum(['html', 'markdown'])
    .optional()
    .describe(
      'Format for the description / multi-line text fields. Omit for the server default (HTML). "markdown" requires Azure DevOps Services or Azure DevOps Server 2022.1+; older on-prem servers reject it.',
    ),
  assignedTo: z
    .string()
    .optional()
    .describe('The email or name of the user to assign the work item to'),
  areaPath: z.string().optional().describe('The area path for the work item'),
  iterationPath: z
    .string()
    .optional()
    .describe('The iteration path for the work item'),
  priority: z.number().optional().describe('The priority of the work item'),
  severity: z
    .string()
    .optional()
    .describe(
      'The severity of the work item as the full picklist value, e.g. "1 - Critical", "2 - High", "3 - Medium", "4 - Low".',
    ),
  parentId: z
    .number()
    .optional()
    .describe('The ID of the parent work item to create a relationship with'),
  additionalFields: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Additional fields to set on the work item. Multi-line text fields (i.e., System.History, AcceptanceCriteria, etc.) must use HTML format. Do not use CDATA tags.',
    ),
});

/**
 * Schema for updating a work item
 */
export const UpdateWorkItemSchema = z.object({
  workItemId: z.number().describe('The ID of the work item to update'),
  title: z.string().optional().describe('The updated title of the work item'),
  description: z
    .string()
    .optional()
    .describe(
      'Work item description. Defaults to HTML format (use HTML markup, not CDATA). To send Markdown instead, set descriptionFormat to "markdown" (requires Azure DevOps Services or Server 2022.1+).',
    ),
  descriptionFormat: z
    .enum(['html', 'markdown'])
    .optional()
    .describe(
      'Format for the description / multi-line text fields. Omit to leave the existing format unchanged. "markdown" requires Azure DevOps Services or Azure DevOps Server 2022.1+; older on-prem servers reject it.',
    ),
  assignedTo: z
    .string()
    .optional()
    .describe('The email or name of the user to assign the work item to'),
  areaPath: z
    .string()
    .optional()
    .describe('The updated area path for the work item'),
  iterationPath: z
    .string()
    .optional()
    .describe('The updated iteration path for the work item'),
  priority: z
    .number()
    .optional()
    .describe('The updated priority of the work item'),
  severity: z
    .string()
    .optional()
    .describe(
      'The updated severity of the work item as the full picklist value, e.g. "1 - Critical", "2 - High", "3 - Medium", "4 - Low".',
    ),
  state: z.string().optional().describe('The updated state of the work item'),
  additionalFields: z
    .record(z.string(), z.any())
    .optional()
    .describe(
      'Additional fields to update on the work item. Multi-line text fields (i.e., System.History, AcceptanceCriteria, etc.) must use HTML format. Do not use CDATA tags.',
    ),
});

/**
 * Schema for managing work item links
 */
export const ManageWorkItemLinkSchema = z.object({
  sourceWorkItemId: z.number().describe('The ID of the source work item'),
  targetWorkItemId: z.number().describe('The ID of the target work item'),
  projectId: z
    .string()
    .optional()
    .describe(`The ID or name of the project (Default: ${defaultProject})`),
  organizationId: z
    .string()
    .optional()
    .describe(`The ID or name of the organization (Default: ${defaultOrg})`),
  operation: z
    .enum(['add', 'remove', 'update'])
    .describe('The operation to perform on the link'),
  relationType: z
    .string()
    .describe(
      'The reference name of the relation type (e.g., "System.LinkTypes.Hierarchy-Forward")',
    ),
  newRelationType: z
    .string()
    .optional()
    .describe('The new relation type to use when updating a link'),
  comment: z
    .string()
    .optional()
    .describe('Optional comment explaining the link'),
});

/**
 * Schema for creating an attachment on a work item
 */
export const CreateWorkItemAttachmentSchema = z
  .object({
    workItemId: z
      .number()
      .describe('The ID of the work item to attach the file to'),
    filePath: z
      .string()
      .optional()
      .describe(
        'Path to the file to upload, relative to the attachments directory (AZURE_DEVOPS_ATTACHMENTS_DIR, defaults to the working directory). Absolute paths and paths escaping that directory are rejected. Provide either filePath or content, not both.',
      ),
    content: z
      .string()
      .optional()
      .describe(
        'Base64-encoded file content to upload as an attachment. Use for generated content that is not on disk. Provide either filePath or content, not both. Requires fileName.',
      ),
    fileName: z
      .string()
      .optional()
      .describe(
        'The name to use for the attachment. Required when content is provided; otherwise extracted from the file path.',
      ),
    comment: z
      .string()
      .optional()
      .describe('Optional comment for the attachment'),
  })
  .refine((data) => Boolean(data.filePath) !== Boolean(data.content), {
    message: 'Exactly one of filePath or content must be provided',
  })
  .refine((data) => !data.content || Boolean(data.fileName), {
    message: 'fileName is required when content is provided',
  });

/**
 * Schema for getting an attachment from a work item
 */
export const GetWorkItemAttachmentSchema = z.object({
  attachmentId: z
    .string()
    .describe(
      'The ID (GUID) of the attachment to download. Can be obtained from the work item relations.',
    ),
  fileName: z
    .string()
    .optional()
    .describe(
      'The file name of the attachment (e.g. screenshot.png). Used to detect the content type for inline display and to name saved files.',
    ),
  outputPath: z
    .string()
    .optional()
    .describe(
      'Path where the attachment will be saved, relative to the attachments directory (AZURE_DEVOPS_ATTACHMENTS_DIR, defaults to the working directory). Absolute paths and paths escaping that directory are rejected. If omitted, images and text are returned inline (images as viewable content) and other binaries as base64.',
    ),
});

/**
 * Schema for listing attachments on a work item
 */
export const ListWorkItemAttachmentsSchema = z.object({
  workItemId: z
    .number()
    .describe('The ID of the work item to list attachments for'),
});

/**
 * Schema for deleting an attachment from a work item
 */
export const DeleteWorkItemAttachmentSchema = z.object({
  workItemId: z
    .number()
    .describe('The ID of the work item to delete the attachment from'),
  attachmentId: z
    .string()
    .describe(
      'The ID (GUID) of the attachment to delete. Can be obtained from the work item relations.',
    ),
});
