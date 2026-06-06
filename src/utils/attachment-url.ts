/**
 * Canonical Azure DevOps attachment URL shape:
 *   {server}/{collection}/{project}/_apis/wit/attachments/{guid}[?fileName=...]
 * The id is a GUID (8-4-4-4-12 hex).
 */
const ATTACHMENT_GUID_RE =
  /\/attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/**
 * Derive the attachment identifier from an Azure DevOps attachment URL.
 *
 * Prefers the canonical `/_apis/wit/attachments/{guid}` GUID. For URL shapes
 * that don't contain a recognizable GUID (older/on-prem variants), falls back
 * to the last path segment (query/fragment stripped) rather than returning the
 * whole URL. Returns an empty string only for an empty input.
 *
 * Using this single helper for both listing and matching keeps the two flows
 * in agreement on how a relation URL maps to an id.
 *
 * @param url The attachment relation URL
 * @returns The attachment id (GUID when available, else the last path segment)
 */
export function parseAttachmentId(url: string | undefined | null): string {
  if (!url) {
    return '';
  }

  const guid = url.match(ATTACHMENT_GUID_RE);
  if (guid) {
    return guid[1];
  }

  // Fallback: last non-empty path segment, without query/fragment.
  const cleaned = url.split(/[?#]/)[0].replace(/\/+$/, '');
  const segment = cleaned.split('/').pop();
  return segment ?? '';
}
