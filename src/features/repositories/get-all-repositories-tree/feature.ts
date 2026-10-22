import { WebApi } from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import {
  GitVersionType,
  VersionControlRecursionType,
  GitItem,
  GitObjectType,
} from 'azure-devops-node-api/interfaces/GitInterfaces';
import { minimatch } from 'minimatch';
import { AzureDevOpsError } from '../../../shared/errors';
import {
  GetAllRepositoriesTreeOptions,
  AllRepositoriesTreeResponse,
  RepositoryTreeResponse,
  RepositoryTreeItem,
  GitRepository,
} from '../types';

/** Maximum number of repositories to process */
const MAX_REPOSITORIES = 10;
/** Maximum number of tree items returned per repository */
const MAX_TREE_ITEMS = 500;

/**
 * Get tree view of files/directories across multiple repositories
 *
 * @param connection The Azure DevOps WebApi connection
 * @param options Options for getting repository tree
 * @returns Tree structure for each repository
 */
export async function getAllRepositoriesTree(
  connection: WebApi,
  options: GetAllRepositoriesTreeOptions,
): Promise<AllRepositoriesTreeResponse> {
  try {
    const gitApi = await connection.getGitApi();
    let repositories: GitRepository[] = [];

    // Get all repositories in the project
    repositories = await gitApi.getRepositories(options.projectId);

    // Filter repositories by name pattern if specified
    if (options.repositoryPattern) {
      repositories = repositories.filter((repo) =>
        minimatch(repo.name || '', options.repositoryPattern || '*'),
      );
    }

    // Cap the number of repositories processed
    const totalRepositories = repositories.length;
    let repositoriesTruncated = false;
    if (repositories.length > MAX_REPOSITORIES) {
      repositories = repositories.slice(0, MAX_REPOSITORIES);
      repositoriesTruncated = true;
    }

    // Initialize results array
    const results: RepositoryTreeResponse[] = [];

    // Process each repository
    for (const repo of repositories) {
      try {
        // Get default branch ref
        const defaultBranch = repo.defaultBranch;
        if (!defaultBranch) {
          // Skip repositories with no default branch
          results.push({
            name: repo.name || 'Unknown',
            tree: [],
            stats: { directories: 0, files: 0 },
            error: 'No default branch found',
          });
          continue;
        }

        // Clean the branch name (remove refs/heads/ prefix)
        const branchRef = defaultBranch.replace('refs/heads/', '');

        // Initialize tree items array and counters
        const treeItems: RepositoryTreeItem[] = [];
        const stats = { directories: 0, files: 0 };

        // Determine the recursion level and processing approach
        const depth = options.depth !== undefined ? options.depth : 0; // Default to 0 (max depth)

        let itemsTruncationResult: {
          totalItems: number;
          truncated: boolean;
        };

        if (depth === 0) {
          // For max depth (0), use server-side recursion for better performance
          const allItems = await gitApi.getItems(
            repo.id || '',
            options.projectId,
            '/',
            VersionControlRecursionType.Full, // Use full recursion
            true,
            false,
            false,
            false,
            {
              version: branchRef,
              versionType: GitVersionType.Branch,
            },
          );

          // Filter out the root item itself and bad items
          const itemsToProcess = allItems.filter(
            (item) =>
              item.path !== '/' && item.gitObjectType !== GitObjectType.Bad,
          );

          // Process all items at once (they're already retrieved recursively)
          itemsTruncationResult = processItemsNonRecursive(
            itemsToProcess,
            treeItems,
            stats,
            options.pattern,
          );
        } else {
          // For limited depth, use the regular recursive approach
          // Get items at the root level
          const rootItems = await gitApi.getItems(
            repo.id || '',
            options.projectId,
            '/',
            VersionControlRecursionType.OneLevel,
            true,
            false,
            false,
            false,
            {
              version: branchRef,
              versionType: GitVersionType.Branch,
            },
          );

          // Filter out the root item itself and bad items
          const itemsToProcess = rootItems.filter(
            (item) =>
              item.path !== '/' && item.gitObjectType !== GitObjectType.Bad,
          );

          // Process the root items and their children (up to specified depth)
          itemsTruncationResult = await processItems(
            gitApi,
            repo.id || '',
            options.projectId,
            itemsToProcess,
            branchRef,
            treeItems,
            stats,
            1,
            depth,
            options.pattern,
          );
        }

        // Build per-repo truncation note when truncated
        let repoTruncationNote: string | undefined;
        if (itemsTruncationResult.truncated) {
          const topLevelDirs = treeItems
            .filter((i) => i.isFolder && i.level === 1)
            .map((i) => i.name);
          repoTruncationNote = `Tree truncated: showing ${treeItems.length} of ${itemsTruncationResult.totalItems} items (limit: ${MAX_TREE_ITEMS}). Use the "path" parameter with get_repository_tree to explore specific subdirectories, or set a lower "depth".`;
          if (topLevelDirs.length > 0) {
            repoTruncationNote += ` Top-level directories: ${topLevelDirs.join(', ')}`;
          }
        }

        // Add repository tree to results
        results.push({
          name: repo.name || 'Unknown',
          tree: treeItems,
          stats,
          totalItems: itemsTruncationResult.truncated
            ? itemsTruncationResult.totalItems
            : undefined,
          truncated: itemsTruncationResult.truncated || undefined,
          truncationNote: repoTruncationNote,
        });
      } catch (repoError) {
        // Handle errors for individual repositories
        results.push({
          name: repo.name || 'Unknown',
          tree: [],
          stats: { directories: 0, files: 0 },
          error: `Error processing repository: ${repoError instanceof Error ? repoError.message : String(repoError)}`,
        });
      }
    }

    // Build top-level truncation note when repos were capped
    let topLevelTruncationNote: string | undefined;
    if (repositoriesTruncated) {
      topLevelTruncationNote = `Repository list truncated: showing ${MAX_REPOSITORIES} of ${totalRepositories} repositories (limit: ${MAX_REPOSITORIES}). Use "repositoryPattern" to select specific repositories.`;
    }

    return {
      repositories: results,
      totalRepositories: repositoriesTruncated ? totalRepositories : undefined,
      repositoriesTruncated: repositoriesTruncated || undefined,
      truncationNote: topLevelTruncationNote,
    };
  } catch (error) {
    if (error instanceof AzureDevOpsError) {
      throw error;
    }
    throw new Error(
      `Failed to get repository tree: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Process items non-recursively when they're already retrieved with VersionControlRecursionType.Full
 */
function processItemsNonRecursive(
  items: GitItem[],
  result: RepositoryTreeItem[],
  stats: { directories: number; files: number },
  pattern?: string,
  maxItems: number = MAX_TREE_ITEMS,
): { totalItems: number; truncated: boolean } {
  // Sort items (folders first, then by path)
  const sortedItems = [...items].sort((a, b) => {
    if (a.isFolder === b.isFolder) {
      return (a.path || '').localeCompare(b.path || '');
    }
    return a.isFolder ? -1 : 1;
  });

  let totalItems = 0;
  let truncated = false;

  for (const item of sortedItems) {
    const name = item.path?.split('/').pop() || '';
    const path = item.path || '';
    const isFolder = !!item.isFolder;

    // Skip the root folder
    if (path === '/') {
      continue;
    }

    // Calculate level from path segments
    const pathSegments = path.replace(/^\//, '').split('/');
    const level = pathSegments.length;

    // Filter files based on pattern (if specified)
    if (!isFolder && pattern && !minimatch(name, pattern)) {
      continue;
    }

    totalItems++;

    if (result.length >= maxItems) {
      truncated = true;
      continue; // Keep counting totalItems but stop pushing
    }

    // Add item to results
    result.push({
      name,
      path,
      isFolder,
      level,
    });

    // Update counters
    if (isFolder) {
      stats.directories++;
    } else {
      stats.files++;
    }
  }

  return { totalItems, truncated };
}

/**
 * Process items recursively up to the specified depth
 */
async function processItems(
  gitApi: IGitApi,
  repoId: string,
  projectId: string,
  items: GitItem[],
  branchRef: string,
  result: RepositoryTreeItem[],
  stats: { directories: number; files: number },
  currentDepth: number,
  maxDepth: number,
  pattern?: string,
  maxItems: number = MAX_TREE_ITEMS,
): Promise<{ totalItems: number; truncated: boolean }> {
  // Sort items (directories first, then files)
  const sortedItems = [...items].sort((a, b) => {
    if (a.isFolder === b.isFolder) {
      return (a.path || '').localeCompare(b.path || '');
    }
    return a.isFolder ? -1 : 1;
  });

  let totalItems = 0;
  let truncated = false;

  for (const item of sortedItems) {
    const name = item.path?.split('/').pop() || '';
    const path = item.path || '';
    const isFolder = !!item.isFolder;

    // Filter files based on pattern (if specified)
    if (!isFolder && pattern && !minimatch(name, pattern)) {
      continue;
    }

    totalItems++;

    if (result.length >= maxItems) {
      truncated = true;
      // Don't recurse into folders when already truncated (avoid wasted API calls)
      continue;
    }

    // Add item to results
    result.push({
      name,
      path,
      isFolder,
      level: currentDepth,
    });

    // Update counters
    if (isFolder) {
      stats.directories++;
    } else {
      stats.files++;
    }

    // Recursively process folders if not yet at max depth and not truncated
    if (isFolder && currentDepth < maxDepth && result.length < maxItems) {
      try {
        const childItems = await gitApi.getItems(
          repoId,
          projectId,
          path,
          VersionControlRecursionType.OneLevel,
          true,
          false,
          false,
          false,
          {
            version: branchRef,
            versionType: GitVersionType.Branch,
          },
        );

        // Filter out the parent folder itself and bad items
        const itemsToProcess = childItems.filter(
          (child: GitItem) =>
            child.path !== path && child.gitObjectType !== GitObjectType.Bad,
        );

        // Process child items
        const childResult = await processItems(
          gitApi,
          repoId,
          projectId,
          itemsToProcess,
          branchRef,
          result,
          stats,
          currentDepth + 1,
          maxDepth,
          pattern,
          maxItems,
        );
        totalItems += childResult.totalItems;
        if (childResult.truncated) {
          truncated = true;
        }
      } catch (error) {
        // Ignore errors in child items and continue with siblings
        console.error(`Error processing folder ${path}: ${error}`);
      }
    }
  }

  return { totalItems, truncated };
}

/**
 * Convert the tree items to a formatted ASCII string representation
 *
 * @param repoName Repository name
 * @param items Tree items
 * @param stats Statistics about files and directories
 * @returns Formatted ASCII string
 */
export function formatRepositoryTree(
  repoName: string,
  items: RepositoryTreeItem[],
  stats: { directories: number; files: number },
  error?: string,
  truncationNote?: string,
): string {
  let output = `${repoName}/\n`;

  if (error) {
    output += `  (${error})\n`;
  } else if (items.length === 0) {
    output += '  (Repository is empty or default branch not found)\n';
  } else {
    // Sort items by path to ensure proper sequence
    const sortedItems = [...items].sort((a, b) => {
      // Sort by level first
      if (a.level !== b.level) {
        return a.level - b.level;
      }
      // Then folders before files
      if (a.isFolder !== b.isFolder) {
        return a.isFolder ? -1 : 1;
      }
      // Then alphabetically
      return a.path.localeCompare(b.path);
    });

    // Create a structured tree representation
    const tree = createTreeStructure(sortedItems);

    // Format the tree starting from the root
    output += formatTree(tree, '  ');
  }

  // Add summary line
  output += `${stats.directories} directories, ${stats.files} files\n`;

  // Add truncation note if present
  if (truncationNote) {
    output += `[${truncationNote}]\n`;
  }

  return output;
}

/**
 * Create a structured tree from the flat list of items
 */
function createTreeStructure(items: RepositoryTreeItem[]): TreeNode {
  const root: TreeNode = {
    name: '',
    path: '',
    isFolder: true,
    children: [],
  };

  // Map to track all nodes by path
  const nodeMap: Record<string, TreeNode> = { '': root };

  // First create all nodes
  for (const item of items) {
    nodeMap[item.path] = {
      name: item.name,
      path: item.path,
      isFolder: item.isFolder,
      children: [],
    };
  }

  // Then build the hierarchy
  for (const item of items) {
    if (item.path === '/') continue;

    const node = nodeMap[item.path];
    const lastSlashIndex = item.path.lastIndexOf('/');

    // For root level items, the parent path is empty
    const parentPath =
      lastSlashIndex <= 0 ? '' : item.path.substring(0, lastSlashIndex);

    // Get parent node (defaults to root if parent not found)
    const parent = nodeMap[parentPath] || root;

    // Add this node as a child of its parent
    parent.children.push(node);
  }

  return root;
}

/**
 * Format a tree structure into an ASCII tree representation
 */
function formatTree(node: TreeNode, indent: string): string {
  if (!node.children.length) return '';

  let output = '';

  // Sort the children: folders first, then alphabetically
  const children = [...node.children].sort((a, b) => {
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  // Format each child node
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const connector = isLast ? '`-- ' : '|-- ';
    const childIndent = isLast ? '    ' : '|   ';

    // Add the node itself
    const suffix = child.isFolder ? '/' : '';
    output += `${indent}${connector}${child.name}${suffix}\n`;

    // Recursively add its children
    if (child.children.length > 0) {
      output += formatTree(child, indent + childIndent);
    }
  }

  return output;
}

/**
 * Tree node interface for hierarchical representation
 */
interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
}
