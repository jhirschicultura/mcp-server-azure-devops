/**
 * Largest response body that could plausibly be a VSS error envelope.
 * Real envelopes are well under this; the cap also bounds the JSON.parse cost.
 */
export const MAX_VSS_ENVELOPE_BYTES = 8192;

/**
 * Detect a VSS (Visual Studio Services) error envelope returned with an
 * HTTP 200 status.
 *
 * On-premises Azure DevOps Server sometimes answers requests for missing or
 * inaccessible resources with a JSON error body and a 200 status instead of a
 * proper HTTP error, e.g.:
 *   {"$id":"1","message":"...","typeName":"...VssServiceException, ...","eventId":3000}
 *
 * The heuristic requires `$id`, a string `message`, and a string `typeName`
 * that names a .NET exception (contains "Exception"). Requiring the exception
 * type name — not just the presence of `message`/`$id` — makes false positives
 * on legitimate small JSON documents vanishingly unlikely.
 *
 * @param buffer The raw response body
 * @returns The envelope's error message, or null if it is not an envelope
 */
export function detectVssErrorEnvelope(buffer: Buffer): string | null {
  // Fast reject: empty, too large, or not a JSON object ('{' === 0x7b)
  if (
    buffer.length === 0 ||
    buffer.length > MAX_VSS_ENVELOPE_BYTES ||
    buffer[0] !== 0x7b
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(buffer.toString('utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.message === 'string' &&
      typeof parsed.typeName === 'string' &&
      parsed.typeName.includes('Exception') &&
      '$id' in parsed
    ) {
      return parsed.message;
    }
  } catch {
    // Not JSON — treat as ordinary content
  }

  return null;
}
