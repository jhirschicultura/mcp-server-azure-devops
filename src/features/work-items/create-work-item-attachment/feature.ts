import { WebApi } from 'azure-devops-node-api';
import { WorkItemExpand } from 'azure-devops-node-api/interfaces/WorkItemTrackingInterfaces';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { AzureDevOpsError } from '../../../shared/errors';
import { resolveAttachmentPath } from '../../../utils/attachment-paths';
import { CreateWorkItemAttachmentOptions, WorkItem } from '../types';

/**
 * Maximum attachment size for a simple (non-chunked) upload.
 * Azure DevOps rejects larger simple uploads; on-premises servers may
 * enforce a smaller, administrator-configured limit.
 */
export const MAX_ATTACHMENT_SIZE_BYTES = 130 * 1024 * 1024; // 130 MB

/**
 * Create an attachment on a work item
 *
 * The file content is provided either as a path on the local filesystem
 * (`filePath`) or as base64-encoded content (`content` + `fileName`).
 *
 * @param connection The Azure DevOps WebApi connection
 * @param workItemId The ID of the work item to attach the file to
 * @param options Options for creating the attachment
 * @returns The updated work item with the attachment
 */
export async function createWorkItemAttachment(
  connection: WebApi,
  workItemId: number,
  options: CreateWorkItemAttachmentOptions,
): Promise<WorkItem> {
  try {
    // Validate required parameters
    if (!options.filePath && !options.content) {
      throw new Error('Either filePath or content is required');
    }

    if (options.filePath && options.content) {
      throw new Error('Provide either filePath or content, not both');
    }

    let fileBuffer: Buffer;
    let fileName: string;

    if (options.filePath) {
      // Confine the path to the sandboxed attachments directory to
      // prevent reading arbitrary files off the host (exfiltration).
      const safePath = resolveAttachmentPath(options.filePath);

      // Stat first so the size cap is enforced before the file is read
      // into memory (a missing file surfaces as ENOENT here).
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(safePath);
      } catch {
        throw new Error(`File does not exist: ${options.filePath}`);
      }

      if (stat.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new Error(
          `Attachment is too large (${stat.size} bytes). Maximum supported size is ${MAX_ATTACHMENT_SIZE_BYTES} bytes. Note: your Azure DevOps server may enforce a smaller limit.`,
        );
      }

      fileBuffer = await fs.promises.readFile(safePath);
      fileName = options.fileName || path.basename(safePath);
    } else {
      if (!options.fileName) {
        throw new Error('fileName is required when content is provided');
      }

      // Estimate the decoded size from the base64 length and reject before
      // allocating the buffer (decoded bytes ≈ length * 3 / 4).
      const estimatedBytes = Math.floor(
        ((options.content as string).length * 3) / 4,
      );
      if (estimatedBytes > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new Error(
          `Attachment is too large (~${estimatedBytes} bytes). Maximum supported size is ${MAX_ATTACHMENT_SIZE_BYTES} bytes. Note: your Azure DevOps server may enforce a smaller limit.`,
        );
      }

      fileBuffer = Buffer.from(options.content as string, 'base64');
      fileName = options.fileName;
    }

    const witApi = await connection.getWorkItemTrackingApi();

    // Convert the file content to a readable stream
    const fileStream = Readable.from(fileBuffer);

    // Upload the attachment
    // Signature: createAttachment(customHeaders, contentStream, fileName, uploadType, project, areaPath)
    const attachmentResult = await witApi.createAttachment(
      {},
      fileStream as unknown as NodeJS.ReadableStream,
      fileName,
      undefined, // uploadType (defaults to Simple)
      undefined, // project
    );

    if (!attachmentResult || !attachmentResult.url) {
      throw new Error('Failed to upload attachment');
    }

    // Create the JSON patch document to add the attachment relation
    const document = [
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'AttachedFile',
          url: attachmentResult.url,
          attributes: {
            name: fileName,
            ...(options.comment ? { comment: options.comment } : {}),
          },
        },
      },
    ];

    // Update the work item to add the attachment relation
    const updatedWorkItem = await witApi.updateWorkItem(
      {}, // customHeaders
      document,
      workItemId,
      undefined, // project
      false, // validateOnly
      false, // bypassRules
      false, // suppressNotifications
      WorkItemExpand.All, // expand
    );

    if (!updatedWorkItem) {
      throw new Error('Failed to update work item with attachment');
    }

    return updatedWorkItem;
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to create attachment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
