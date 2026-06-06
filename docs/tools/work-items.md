# Work Item Tools

This document describes the tools available for working with Azure DevOps work items.

## Table of Contents

- [`get_work_item`](#get_work_item) - Retrieve a specific work item by ID
- [`create_work_item`](#create_work_item) - Create a new work item
- [`list_work_items`](#list_work_items) - List work items in a project
- [`create_work_item_attachment`](#create_work_item_attachment) - Upload and attach a file to a work item
- [`get_work_item_attachment`](#get_work_item_attachment) - Download an attachment, or view it inline
- [`delete_work_item_attachment`](#delete_work_item_attachment) - Delete an attachment from a work item
- [`list_work_item_attachments`](#list_work_item_attachments) - List the attachments on a work item

## get_work_item

Retrieves a work item by its ID.

### Parameters

| Parameter    | Type   | Required | Description                                                                       |
| ------------ | ------ | -------- | --------------------------------------------------------------------------------- |
| `workItemId` | number | Yes      | The ID of the work item to retrieve                                               |
| `expand`     | string | No       | Controls the level of detail in the response. Defaults to "All" if not specified. Other values: "Relations", "Fields", "None" |

### Response

Returns a work item object with the following structure:

```json
{
  "id": 123,
  "fields": {
    "System.Title": "Sample Work Item",
    "System.State": "Active",
    "System.AssignedTo": "user@example.com",
    "System.Description": "Description of the work item"
  },
  "url": "https://dev.azure.com/organization/project/_apis/wit/workItems/123"
}
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the work item does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Using default expand="All"
const result = await callTool('get_work_item', {
  workItemId: 123,
});

// Explicitly specifying expand
const minimalResult = await callTool('get_work_item', {
  workItemId: 123,
  expand: 'None'
});
```

## create_work_item

Creates a new work item in a specified project.

### Parameters

| Parameter          | Type   | Required | Description                                                         |
| ------------------ | ------ | -------- | ------------------------------------------------------------------- |
| `projectId`        | string | Yes      | The ID or name of the project where the work item will be created   |
| `workItemType`     | string | Yes      | The type of work item to create (e.g., "Task", "Bug", "User Story") |
| `title`            | string | Yes      | The title of the work item                                          |
| `description`      | string | No       | The description of the work item                                    |
| `assignedTo`       | string | No       | The email or name of the user to assign the work item to            |
| `areaPath`         | string | No       | The area path for the work item                                     |
| `iterationPath`    | string | No       | The iteration path for the work item                                |
| `priority`         | number | No       | The priority of the work item                                       |
| `additionalFields` | object | No       | Additional fields to set on the work item (key-value pairs)         |

### Response

Returns the newly created work item object:

```json
{
  "id": 124,
  "fields": {
    "System.Title": "New Work Item",
    "System.State": "New",
    "System.Description": "Description of the new work item",
    "System.AssignedTo": "user@example.com",
    "System.AreaPath": "Project\\Team",
    "System.IterationPath": "Project\\Sprint 1",
    "Microsoft.VSTS.Common.Priority": 2
  },
  "url": "https://dev.azure.com/organization/project/_apis/wit/workItems/124"
}
```

### Error Handling

- Returns validation error if required fields are missing
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns `AzureDevOpsResourceNotFoundError` if the project does not exist
- Returns generic error messages for other failures

### Example Usage

```javascript
const result = await callTool('create_work_item', {
  projectId: 'my-project',
  workItemType: 'User Story',
  title: 'Implement login functionality',
  description:
    'Create a secure login system with email and password authentication',
  assignedTo: 'developer@example.com',
  priority: 1,
  additionalFields: {
    'Custom.Field': 'Custom Value',
  },
});
```

### Implementation Details

The tool creates a JSON patch document to define the fields of the work item, then calls the Azure DevOps API to create the work item. Each field is added to the document with an 'add' operation, and the document is submitted to the API.

## list_work_items

Lists work items in a specified project.

### Parameters

| Parameter   | Type   | Required | Description                                           |
| ----------- | ------ | -------- | ----------------------------------------------------- |
| `projectId` | string | Yes      | The ID or name of the project to list work items from |
| `teamId`    | string | No       | The ID of the team to list work items for             |
| `queryId`   | string | No       | ID of a saved work item query                         |
| `wiql`      | string | No       | Work Item Query Language (WIQL) query                 |
| `top`       | number | No       | Maximum number of work items to return                |
| `skip`      | number | No       | Number of work items to skip                          |

### Response

Returns an array of work item objects:

```json
[
  {
    "id": 123,
    "fields": {
      "System.Title": "Sample Work Item",
      "System.State": "Active",
      "System.AssignedTo": "user@example.com"
    },
    "url": "https://dev.azure.com/organization/project/_apis/wit/workItems/123"
  },
  {
    "id": 124,
    "fields": {
      "System.Title": "Another Work Item",
      "System.State": "New",
      "System.AssignedTo": "user2@example.com"
    },
    "url": "https://dev.azure.com/organization/project/_apis/wit/workItems/124"
  }
]
```

### Error Handling

- Returns `AzureDevOpsResourceNotFoundError` if the project does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
const result = await callTool('list_work_items', {
  projectId: 'my-project',
  wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Task' ORDER BY [System.CreatedDate] DESC",
  top: 10,
});
```

## create_work_item_attachment

Uploads a file and attaches it to a work item. The file content can be
provided either as a path on the local filesystem (`filePath`) or as
base64-encoded content (`content` + `fileName`).

### Parameters

| Parameter    | Type   | Required | Description                                                                                      |
| ------------ | ------ | -------- | ------------------------------------------------------------------------------------------------ |
| `workItemId` | number | Yes      | The ID of the work item to attach the file to                                                    |
| `filePath`   | string | No*      | The absolute path to the file to upload as an attachment                                         |
| `content`    | string | No*      | Base64-encoded file content to upload. Use for generated content that is not on disk             |
| `fileName`   | string | No**     | The name to use for the attachment. If not provided, the name will be extracted from the file path |
| `comment`    | string | No       | Optional comment for the attachment                                                              |

\* Exactly one of `filePath` or `content` must be provided.
\*\* Required when `content` is provided.

Attachments are limited to 130 MB (the Azure DevOps simple-upload limit);
your server may enforce a smaller, administrator-configured limit.

### Response

Returns the updated work item object with the attachment included in the `relations` array:

```json
{
  "id": 123,
  "fields": {
    "System.Title": "Sample Work Item",
    "System.State": "Active"
  },
  "relations": [
    {
      "rel": "AttachedFile",
      "url": "https://dev.azure.com/organization/_apis/wit/attachments/abc123",
      "attributes": {
        "name": "document.pdf",
        "comment": "Attached specification document"
      }
    }
  ],
  "url": "https://dev.azure.com/organization/project/_apis/wit/workItems/123"
}
```

### Error Handling

- Returns error if the file path is empty
- Returns error if the file does not exist at the specified path
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Basic attachment upload
const result = await callTool('create_work_item_attachment', {
  workItemId: 123,
  filePath: '/path/to/document.pdf',
});

// With custom file name and comment
const result = await callTool('create_work_item_attachment', {
  workItemId: 123,
  filePath: '/path/to/spec.md',
  fileName: 'Technical-Specification.md',
  comment: 'Updated technical specification document',
});

// From base64-encoded content (no file on disk required)
const result = await callTool('create_work_item_attachment', {
  workItemId: 123,
  content: Buffer.from('report body').toString('base64'),
  fileName: 'report.txt',
  comment: 'Generated by automation',
});
```

### Implementation Details

The tool performs a two-step process:
1. Uploads the file content to Azure DevOps attachment storage using `createAttachment`
2. Updates the work item to add a relation of type `AttachedFile` pointing to the uploaded attachment URL

The attachment is stored in Azure DevOps and linked to the work item through the relations system.

## get_work_item_attachment

Downloads an attachment from Azure DevOps. When `outputPath` is provided,
the file is saved to the local filesystem. When omitted, the content is
returned inline: raster images (png, jpg, gif, webp) as viewable image
content — useful for looking at screenshots attached to bugs — recognized
text types as text, and any other type as base64 binary content.

### Parameters

| Parameter      | Type   | Required | Description                                                                                           |
| -------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------- |
| `attachmentId` | string | Yes      | The ID (GUID) of the attachment to download. Use `list_work_item_attachments` to find it.             |
| `fileName`     | string | No       | The attachment file name (e.g. `screenshot.png`). Used to detect the content type for inline display  |
| `outputPath`   | string | No       | The absolute path where the attachment will be saved. If omitted, content is returned inline          |

Inline returns are limited to 10 MB; larger attachments must be saved to
disk via `outputPath`.

### Response

When saved to disk, returns a result object with information about the
downloaded file:

```json
{
  "kind": "file",
  "filePath": "/path/to/downloaded/document.pdf",
  "fileName": "document.pdf",
  "size": 1048576
}
```

When returned inline, image attachments are returned as MCP image content
(viewable by clients such as Claude), text attachments as plain text, and
other types as a base64 embedded resource.

### Error Handling

- Returns error if the attachment ID is empty
- Returns error if the attachment does not exist
- Returns error if inline content exceeds the 10 MB limit (use `outputPath` instead)
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// Find the attachment ID
const attachments = await callTool('list_work_item_attachments', {
  workItemId: 123,
});
const attachmentId = attachments[0].attachmentId;

// View a screenshot inline (no outputPath)
const inline = await callTool('get_work_item_attachment', {
  attachmentId: attachmentId,
  fileName: 'screenshot.png',
});

// Or download to disk
const result = await callTool('get_work_item_attachment', {
  attachmentId: attachmentId,
  outputPath: '/path/to/save/document.pdf',
});
```

### Implementation Details

The tool performs the following steps:
1. Validates the attachment ID is provided
2. Calls the Azure DevOps API to download the attachment content stream
3. If `outputPath` is provided: creates the output directory if needed and writes the file
4. Otherwise: classifies the content by file extension and returns it inline (image, text, or base64 binary)

## delete_work_item_attachment

Deletes an attachment from a work item by removing the attachment relation.

### Parameters

| Parameter      | Type   | Required | Description                                                                                           |
| -------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------- |
| `workItemId`   | number | Yes      | The ID of the work item to delete the attachment from                                                 |
| `attachmentId` | string | Yes      | The ID (GUID) of the attachment to delete. Can be obtained from the work item relations.              |

### Response

Returns the updated work item object without the deleted attachment:

```json
{
  "id": 123,
  "fields": {
    "System.Title": "Sample Work Item",
    "System.State": "Active"
  },
  "relations": [],
  "url": "https://dev.azure.com/organization/project/_apis/wit/workItems/123"
}
```

### Error Handling

- Returns error if the work item ID is not provided or invalid
- Returns error if the attachment ID is empty
- Returns error if the attachment does not exist on the work item
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
// First, get the work item to find the attachment ID
const workItem = await callTool('get_work_item', {
  workItemId: 123,
  expand: 'relations',
});

// Find the attachment relation and extract the ID from the URL
const attachmentRelation = workItem.relations.find(
  (r) => r.rel === 'AttachedFile',
);
const attachmentUrl = attachmentRelation.url;
// URL format: https://dev.azure.com/org/_apis/wit/attachments/{attachmentId}
const attachmentId = attachmentUrl.split('/').pop();

// Delete the attachment
const result = await callTool('delete_work_item_attachment', {
  workItemId: 123,
  attachmentId: attachmentId,
});
```

### Implementation Details

The tool performs the following steps:
1. Validates the work item ID and attachment ID are provided
2. Fetches the work item with its relations to find the attachment
3. Locates the attachment relation by matching the attachment ID in the URL
4. Creates a JSON patch document to remove the specific relation by index
5. Updates the work item to remove the attachment relation
6. Returns the updated work item without the attachment

## list_work_item_attachments

Lists the attachments on a work item, including each attachment ID, file
name, size, and upload date.

### Parameters

| Parameter    | Type   | Required | Description                                    |
| ------------ | ------ | -------- | ---------------------------------------------- |
| `workItemId` | number | Yes      | The ID of the work item to list attachments for |

### Response

Returns an array of attachment info objects:

```json
[
  {
    "attachmentId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "fileName": "screenshot.png",
    "url": "https://dev.azure.com/organization/project/_apis/wit/attachments/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "comment": "Repro screenshot",
    "resourceSize": 2048,
    "authorizedDate": "2026-01-15T10:00:00Z"
  }
]
```

### Error Handling

- Returns error if the work item does not exist
- Returns `AzureDevOpsAuthenticationError` if authentication fails
- Returns generic error messages for other failures

### Example Usage

```javascript
const attachments = await callTool('list_work_item_attachments', {
  workItemId: 123,
});

// Then download or view one of them
const result = await callTool('get_work_item_attachment', {
  attachmentId: attachments[0].attachmentId,
  fileName: attachments[0].fileName,
});
```

### Implementation Details

The tool fetches the work item with its relations expanded, filters the
relations to those of type `AttachedFile`, and maps each to a summary object
with the attachment ID extracted from the attachment URL.
