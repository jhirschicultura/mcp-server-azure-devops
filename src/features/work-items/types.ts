import {
  WorkItem,
  WorkItemReference,
} from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';

/**
 * Options for listing work items
 */
export interface ListWorkItemsOptions {
  projectId: string;
  teamId?: string;
  queryId?: string;
  wiql?: string;
  top?: number;
  skip?: number;
}

/**
 * Options for creating a work item
 */
export interface CreateWorkItemOptions {
  title: string;
  description?: string;
  assignedTo?: string;
  areaPath?: string;
  iterationPath?: string;
  priority?: number;
  parentId?: number;
  additionalFields?: Record<string, string | number | boolean | null>;
}

/**
 * Options for updating a work item
 */
export interface UpdateWorkItemOptions {
  title?: string;
  description?: string;
  assignedTo?: string;
  areaPath?: string;
  iterationPath?: string;
  priority?: number;
  state?: string;
  additionalFields?: Record<string, string | number | boolean | null>;
}

/**
 * Options for creating an attachment on a work item
 *
 * Exactly one of `filePath` or `content` must be provided.
 * When `content` is used, `fileName` is required.
 */
export interface CreateWorkItemAttachmentOptions {
  filePath?: string;
  content?: string;
  fileName?: string;
  comment?: string;
}

/**
 * Options for getting an attachment from a work item
 */
export interface GetWorkItemAttachmentOptions {
  attachmentId: string;
  fileName?: string;
  outputPath?: string;
}

/**
 * Result of getting an attachment
 *
 * Discriminated by `kind`:
 * - `file`: the attachment was saved to `filePath` on disk
 * - `image`: raster image content returned inline as base64
 * - `text`: text content returned inline
 * - `binary`: binary content returned inline as base64
 */
export type GetWorkItemAttachmentResult =
  | {
      kind: 'file';
      filePath: string;
      fileName: string;
      size: number;
    }
  | {
      kind: 'image';
      base64: string;
      mimeType: string;
      fileName: string;
      size: number;
    }
  | {
      kind: 'text';
      text: string;
      mimeType: string;
      fileName: string;
      size: number;
    }
  | {
      kind: 'binary';
      base64: string;
      mimeType: string;
      fileName: string;
      size: number;
    };

/**
 * A single attachment on a work item
 */
export interface WorkItemAttachmentInfo {
  attachmentId: string;
  fileName: string;
  url: string;
  comment?: string;
  resourceSize?: number;
  authorizedDate?: string;
}

/**
 * Options for listing attachments on a work item
 */
export interface ListWorkItemAttachmentsOptions {
  workItemId: number;
}

/**
 * Options for deleting an attachment from a work item
 */
export interface DeleteWorkItemAttachmentOptions {
  workItemId: number;
  attachmentId: string;
}

// Re-export WorkItem and WorkItemReference types for convenience
export type { WorkItem, WorkItemReference };
