import { WebApi } from 'azure-devops-node-api';
import { getPersonalAccessTokenHandler } from 'azure-devops-node-api';
import { AzureDevOpsConfig } from '../types';
import { AuthenticationMethod } from '../auth';

/**
 * Creates a WebApi connection for tests with real credentials
 *
 * @returns WebApi connection
 */
export async function getTestConnection(): Promise<WebApi | null> {
  // If we have real credentials, use them
  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
  const token = process.env.AZURE_DEVOPS_PAT;

  if (orgUrl && token) {
    const authHandler = getPersonalAccessTokenHandler(token);
    return new WebApi(orgUrl, authHandler);
  }

  // If we don't have credentials, return null
  return null;
}

/**
 * Creates test configuration for Azure DevOps tests
 *
 * @returns Azure DevOps config
 */
export function getTestConfig(): AzureDevOpsConfig | null {
  // If we have real credentials, use them
  const orgUrl = process.env.AZURE_DEVOPS_ORG_URL;
  const pat = process.env.AZURE_DEVOPS_PAT;

  if (orgUrl && pat) {
    return {
      organizationUrl: orgUrl,
      authMethod: AuthenticationMethod.PersonalAccessToken,
      personalAccessToken: pat,
      defaultProject: process.env.AZURE_DEVOPS_DEFAULT_PROJECT,
    };
  }

  // If we don't have credentials, return null
  return null;
}

/**
 * A single item in a tool result's `content` array.
 *
 * The MCP SDK types `content` as a discriminated union (text | image |
 * resource | ...). Only the text variant carries a `text` field.
 */
type ToolContentItem = { type: string; text?: string };

/**
 * Extract text from a tool result's content array, narrowing the SDK's
 * discriminated content union to the text variant.
 *
 * Throws a descriptive error if the item at `index` is not text content,
 * which gives a far clearer failure than a runtime `undefined` would.
 *
 * @param result A tool result (or anything with a `content` array)
 * @param index The content item index to read (default 0)
 * @returns The text of the content item
 */
export function getTextContent(
  result: { content: ToolContentItem[] },
  index = 0,
): string {
  const item = result.content[index];
  if (!item || item.type !== 'text' || typeof item.text !== 'string') {
    throw new Error(
      `Expected text content at index ${index}, got '${item?.type ?? 'undefined'}'`,
    );
  }
  return item.text;
}

/**
 * Determines if integration tests should be skipped
 *
 * @returns true if integration tests should be skipped
 */
export function shouldSkipIntegrationTest(): boolean {
  if (!process.env.AZURE_DEVOPS_ORG_URL || !process.env.AZURE_DEVOPS_PAT) {
    console.log(
      'Skipping integration test: No real Azure DevOps connection available',
    );
    return true;
  }
  return false;
}
