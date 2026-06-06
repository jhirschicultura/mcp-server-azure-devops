import { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import { AzureDevOpsError } from '../../../shared/errors';
import {
  ListWorkItemAttachmentsOptions,
  WorkItemAttachmentInfo,
} from '../types';

/**
 * Extract the attachment ID (GUID) from an attachment URL
 *
 * Attachment URLs have the form:
 * {server}/{collection}/{project}/_apis/wit/attachments/{guid}
 */
function extractAttachmentId(url: string): string {
  const match = url.match(/attachments\/([0-9a-f-]+)/i);
  return match ? match[1] : url;
}

/**
 * List the attachments on a work item
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options identifying the work item
 * @returns The attachments on the work item
 */
export async function listWorkItemAttachments(
  connection: WebApi,
  options: ListWorkItemAttachmentsOptions,
): Promise<WorkItemAttachmentInfo[]> {
  try {
    const witApi = await connection.getWorkItemTrackingApi();

    // Get the work item with its relations
    const workItem = await witApi.getWorkItem(
      options.workItemId,
      undefined,
      undefined,
      WorkItemExpand.Relations,
    );

    if (!workItem) {
      throw new Error(`Work item ${options.workItemId} not found`);
    }

    const relations = workItem.relations || [];

    return relations
      .filter((relation) => relation.rel === 'AttachedFile' && relation.url)
      .map((relation) => {
        const attributes = relation.attributes || {};
        const url = relation.url as string;

        return {
          attachmentId: extractAttachmentId(url),
          fileName: attributes.name || extractAttachmentId(url),
          url,
          ...(attributes.comment ? { comment: attributes.comment } : {}),
          ...(attributes.resourceSize !== undefined
            ? { resourceSize: attributes.resourceSize }
            : {}),
          ...(attributes.authorizedDate
            ? { authorizedDate: attributes.authorizedDate }
            : {}),
        };
      });
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to list attachments: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
