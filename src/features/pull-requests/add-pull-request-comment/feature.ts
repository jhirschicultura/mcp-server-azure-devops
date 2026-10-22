import { WebApi } from 'azure-devops-node-api';
import {
  Comment,
  CommentThreadStatus,
  CommentType,
  GitPullRequestCommentThread,
  GitVersionType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { AzureDevOpsError } from '../../../shared/errors';
import { AddPullRequestCommentOptions, AddCommentResponse } from '../types';
import {
  transformCommentThreadStatus,
  transformCommentType,
} from '../../../shared/enums';

/**
 * Resolve the end offset that covers the whole of `line` in the file as it
 * exists at the PR's source commit.
 *
 * A zero-width anchor (offset 1 to 1) makes "Apply suggestion" insert text
 * before the line instead of replacing it (issue #356); the web UI anchors
 * line threads to `line length + 1`. Falls back to offset 1 on any failure so
 * posting the comment never fails because of this lookup.
 */
async function resolveLineEndOffset(
  gitApi: IGitApi,
  project: string | undefined,
  repositoryId: string,
  pullRequestId: number,
  filePath: string,
  line: number,
): Promise<number> {
  try {
    const pr = await gitApi.getPullRequestById(pullRequestId, project);
    const commitId = pr?.lastMergeSourceCommit?.commitId;
    if (!commitId) {
      return 1;
    }

    const item = await gitApi.getItem(
      repositoryId,
      filePath,
      project,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { version: commitId, versionType: GitVersionType.Commit },
      true,
    );
    const lines = item?.content?.split(/\r?\n/);
    const text = lines?.[line - 1];
    return text === undefined ? 1 : text.length + 1;
  } catch {
    return 1;
  }
}

/**
 * Add a comment to a pull request
 *
 * @param connection The Azure DevOps WebApi connection
 * @param projectId The ID or name of the project
 * @param repositoryId The ID or name of the repository
 * @param pullRequestId The ID of the pull request
 * @param options Options for adding the comment
 * @returns The created comment or thread
 */
export async function addPullRequestComment(
  connection: WebApi,
  projectId: string | undefined,
  repositoryId: string | undefined,
  pullRequestId: number,
  options: AddPullRequestCommentOptions,
): Promise<AddCommentResponse> {
  try {
    const gitApi = await connection.getGitApi();
    const project = projectId || undefined;

    let resolvedRepositoryId = repositoryId;
    if (!resolvedRepositoryId) {
      const pr = await gitApi.getPullRequestById(pullRequestId, project);
      resolvedRepositoryId = pr?.repository?.id;
    }

    if (!resolvedRepositoryId) {
      throw new Error(
        'repositoryId is required (or must be derivable from pullRequestId)',
      );
    }

    // Create comment object
    const comment: Comment = {
      content: options.content,
      commentType: CommentType.Text, // Default to Text type
      parentCommentId: options.parentCommentId,
    };

    // Case 1: Add comment to an existing thread
    if (options.threadId) {
      const createdComment = await gitApi.createComment(
        comment,
        resolvedRepositoryId,
        pullRequestId,
        options.threadId,
        project,
      );

      if (!createdComment) {
        throw new Error('Failed to create pull request comment');
      }

      return {
        comment: {
          ...createdComment,
          commentType: transformCommentType(createdComment.commentType),
        },
      };
    }
    // Case 2: Create new thread with comment
    else {
      // Map status string to CommentThreadStatus enum; new threads default to active
      const threadStatusMap: Record<
        NonNullable<AddPullRequestCommentOptions['status']>,
        CommentThreadStatus
      > = {
        active: CommentThreadStatus.Active,
        fixed: CommentThreadStatus.Fixed,
        wontFix: CommentThreadStatus.WontFix,
        closed: CommentThreadStatus.Closed,
        pending: CommentThreadStatus.Pending,
        byDesign: CommentThreadStatus.ByDesign,
        unknown: CommentThreadStatus.Unknown,
      };
      const threadStatus = threadStatusMap[options.status ?? 'active'];

      // Create thread with comment
      const thread: GitPullRequestCommentThread = {
        comments: [comment],
        status: threadStatus,
      };

      // Add file context if specified (file comment)
      if (options.filePath) {
        const endLine = options.endLineNumber ?? options.lineNumber;
        const endOffset =
          options.lineNumber && endLine
            ? await resolveLineEndOffset(
                gitApi,
                project,
                resolvedRepositoryId,
                pullRequestId,
                options.filePath,
                endLine,
              )
            : 1;

        thread.threadContext = {
          filePath: options.filePath,
          // Only add line information if provided
          rightFileStart: options.lineNumber
            ? {
                line: options.lineNumber,
                offset: 1, // Start of the first line
              }
            : undefined,
          rightFileEnd:
            options.lineNumber && endLine
              ? {
                  line: endLine,
                  offset: endOffset,
                }
              : undefined,
        };
      }

      const createdThread = await gitApi.createThread(
        thread,
        resolvedRepositoryId,
        pullRequestId,
        project,
      );

      if (
        !createdThread ||
        !createdThread.comments ||
        createdThread.comments.length === 0
      ) {
        throw new Error('Failed to create pull request comment thread');
      }

      return {
        comment: {
          ...createdThread.comments[0],
          commentType: transformCommentType(
            createdThread.comments[0].commentType,
          ),
        },
        thread: {
          ...createdThread,
          status: transformCommentThreadStatus(createdThread.status),
          comments: createdThread.comments?.map((comment) => ({
            ...comment,
            commentType: transformCommentType(comment.commentType),
          })),
        },
      };
    }
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to add pull request comment: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
