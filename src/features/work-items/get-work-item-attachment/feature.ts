import { WebApi } from 'azure-devops-node-api';
import * as fs from 'fs';
import * as path from 'path';
import { AzureDevOpsError } from '../../../shared/errors';
import {
  GetWorkItemAttachmentOptions,
  GetWorkItemAttachmentResult,
} from '../types';

/**
 * Maximum size for returning attachment content inline.
 * Larger attachments must be saved to disk via outputPath.
 */
export const MAX_INLINE_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Raster image MIME types that MCP clients can display inline
 */
const INLINE_IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Text MIME types that are safe to return inline as text
 */
const TEXT_MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.svg': 'image/svg+xml',
};

/**
 * Determine the MIME type for a file name based on its extension
 */
function getMimeType(fileName: string): {
  mimeType: string;
  isImage: boolean;
  isText: boolean;
} {
  const ext = path.extname(fileName).toLowerCase();

  if (INLINE_IMAGE_MIME_TYPES[ext]) {
    return {
      mimeType: INLINE_IMAGE_MIME_TYPES[ext],
      isImage: true,
      isText: false,
    };
  }

  if (TEXT_MIME_TYPES[ext]) {
    return { mimeType: TEXT_MIME_TYPES[ext], isImage: false, isText: true };
  }

  return {
    mimeType: 'application/octet-stream',
    isImage: false,
    isText: false,
  };
}

/**
 * Read a stream fully into a buffer
 */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Get an attachment from a work item
 *
 * When `outputPath` is provided, the attachment is saved to the local
 * filesystem. When omitted, the content is returned inline: raster images
 * as base64 image content (viewable by MCP clients), recognized text types
 * as text, and any other type as base64 binary content.
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting the attachment
 * @returns The result of the operation, discriminated by `kind`
 */
export async function getWorkItemAttachment(
  connection: WebApi,
  options: GetWorkItemAttachmentOptions,
): Promise<GetWorkItemAttachmentResult> {
  try {
    // Validate required parameters
    if (!options.attachmentId) {
      throw new Error('Attachment ID is required');
    }

    const witApi = await connection.getWorkItemTrackingApi();

    // Download the attachment content
    const attachmentStream = await witApi.getAttachmentContent(
      options.attachmentId,
      options.fileName,
    );

    if (!attachmentStream) {
      throw new Error('Failed to download attachment: No content received');
    }

    if (options.outputPath) {
      // Ensure the output directory exists
      const outputDir = path.dirname(options.outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write the attachment to the output file
      const writeStream = fs.createWriteStream(options.outputPath);

      await new Promise<void>((resolve, reject) => {
        attachmentStream.pipe(writeStream);
        attachmentStream.on('error', reject);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);
      });

      // Get the file size
      const stats = fs.statSync(options.outputPath);

      return {
        kind: 'file',
        filePath: options.outputPath,
        fileName: options.fileName || path.basename(options.outputPath),
        size: stats.size,
      };
    }

    // Inline return: buffer the content and classify by file name
    const buffer = await streamToBuffer(attachmentStream);

    if (buffer.length > MAX_INLINE_ATTACHMENT_SIZE_BYTES) {
      throw new Error(
        `Attachment is too large to return inline (${buffer.length} bytes, limit ${MAX_INLINE_ATTACHMENT_SIZE_BYTES}). Provide outputPath to save it to disk instead.`,
      );
    }

    const fileName = options.fileName || options.attachmentId;
    const { mimeType, isImage, isText } = getMimeType(fileName);

    if (isImage) {
      return {
        kind: 'image',
        base64: buffer.toString('base64'),
        mimeType,
        fileName,
        size: buffer.length,
      };
    }

    if (isText) {
      return {
        kind: 'text',
        text: buffer.toString('utf8'),
        mimeType,
        fileName,
        size: buffer.length,
      };
    }

    return {
      kind: 'binary',
      base64: buffer.toString('base64'),
      mimeType,
      fileName,
      size: buffer.length,
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get attachment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
