import { WebApi } from 'azure-devops-node-api';
import axios from 'axios';
import { DefaultAzureCredential, AzureCliCredential } from '@azure/identity';
import {
  AzureDevOpsError,
  AzureDevOpsAuthenticationError,
  AzureDevOpsValidationError,
} from '../../../shared/errors';
import {
  isAzureDevOpsServicesUrl,
  resolveAzureDevOpsBaseUrls,
} from '../../../shared/azure-devops-url';
import { UserProfile } from '../types';

/**
 * Get details of the currently authenticated user
 *
 * This function returns basic profile information about the authenticated user.
 *
 * @param connection The Azure DevOps WebApi connection
 * @returns User profile information including id, displayName, and email
 * @throws {AzureDevOpsError} If retrieval of user information fails
 */
export async function getMe(connection: WebApi): Promise<UserProfile> {
  try {
    // The profile endpoint lives on vssps.dev.azure.com and is cloud-only;
    // Azure DevOps Server exposes the authenticated identity via connectionData.
    if (!isAzureDevOpsServicesUrl(connection.serverUrl)) {
      return await getMeFromConnectionData(connection);
    }

    const baseUrls = resolveAzureDevOpsBaseUrls(connection.serverUrl);
    const organization = baseUrls.organization;

    if (!organization) {
      throw new AzureDevOpsValidationError(
        'Could not extract organization from Azure DevOps Services URL',
      );
    }

    // Get the authorization header
    const authHeader = await getAuthorizationHeader();

    // Make direct call to the Profile API endpoint
    // Note: This API is in the vssps.dev.azure.com domain, not dev.azure.com
    const response = await axios.get(
      `https://vssps.dev.azure.com/${organization}/_apis/profile/profiles/me?api-version=7.1`,
      {
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
      },
    );

    const profile = response.data;

    // Return the user profile with required fields
    return {
      id: profile.id,
      displayName: profile.displayName || '',
      email: profile.emailAddress || '',
    };
  } catch (error) {
    // Handle authentication errors
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      throw new AzureDevOpsAuthenticationError(
        `Authentication failed: ${error.message}`,
      );
    }

    // If it's already an AzureDevOpsError, rethrow it
    if (error instanceof AzureDevOpsError) {
      throw error;
    }

    // Otherwise, wrap it in a generic error
    throw new AzureDevOpsError(
      `Failed to get user information: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Get the authenticated user on Azure DevOps Server (on-premises)
 *
 * Uses the location service's connectionData, which goes through the
 * connection's own auth handler (PAT for on-prem servers).
 *
 * @param connection The Azure DevOps WebApi connection
 * @returns User profile information
 */
async function getMeFromConnectionData(
  connection: WebApi,
): Promise<UserProfile> {
  const locationsApi = await connection.getLocationsApi();
  const connectionData = await locationsApi.getConnectionData();
  const user = connectionData?.authenticatedUser;

  if (!user?.id) {
    throw new AzureDevOpsAuthenticationError(
      'Azure DevOps Server did not return an authenticated user',
    );
  }

  const properties = user.properties ?? {};
  return {
    id: user.id,
    displayName: user.providerDisplayName || user.customDisplayName || '',
    email: properties.Mail?.$value || properties.Account?.$value || '',
  };
}

/**
 * Get the authorization header for API requests
 *
 * @returns The authorization header
 */
async function getAuthorizationHeader(): Promise<string> {
  try {
    // For PAT authentication, we can construct the header directly
    if (
      process.env.AZURE_DEVOPS_AUTH_METHOD?.toLowerCase() === 'pat' &&
      process.env.AZURE_DEVOPS_PAT
    ) {
      // For PAT auth, we can construct the Basic auth header directly
      const token = process.env.AZURE_DEVOPS_PAT;
      const base64Token = Buffer.from(`:${token}`).toString('base64');
      return `Basic ${base64Token}`;
    }

    // For Azure Identity / Azure CLI auth, we need to get a token
    // using the Azure DevOps resource ID
    // Choose the appropriate credential based on auth method
    const credential =
      process.env.AZURE_DEVOPS_AUTH_METHOD?.toLowerCase() === 'azure-cli'
        ? new AzureCliCredential()
        : new DefaultAzureCredential();

    // Azure DevOps resource ID for token acquisition
    const AZURE_DEVOPS_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798';

    // Get token for Azure DevOps
    const token = await credential.getToken(
      `${AZURE_DEVOPS_RESOURCE_ID}/.default`,
    );

    if (!token || !token.token) {
      throw new Error('Failed to acquire token for Azure DevOps');
    }

    return `Bearer ${token.token}`;
  } catch (error) {
    throw new AzureDevOpsAuthenticationError(
      `Failed to get authorization header: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
