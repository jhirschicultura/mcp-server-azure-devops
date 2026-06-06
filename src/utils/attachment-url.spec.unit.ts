import { parseAttachmentId } from './attachment-url';

describe('parseAttachmentId', () => {
  const guid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('extracts the GUID from a canonical attachment URL', () => {
    const url = `https://dev.azure.com/org/proj/_apis/wit/attachments/${guid}`;
    expect(parseAttachmentId(url)).toBe(guid);
  });

  it('extracts the GUID even when a query string follows', () => {
    const url = `https://dev.azure.com/org/proj/_apis/wit/attachments/${guid}?fileName=screenshot.png`;
    expect(parseAttachmentId(url)).toBe(guid);
  });

  it('extracts the GUID from an on-prem collection URL', () => {
    const url = `https://tfs.example.com/tfs/DefaultCollection/proj/_apis/wit/attachments/${guid}`;
    expect(parseAttachmentId(url)).toBe(guid);
  });

  it('is case-insensitive on the GUID hex', () => {
    const upper = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
    const url = `https://dev.azure.com/org/_apis/wit/attachments/${upper}`;
    expect(parseAttachmentId(url)).toBe(upper);
  });

  it('falls back to the last path segment when there is no GUID', () => {
    const url = 'https://server/legacy/attachments/file-token-123';
    expect(parseAttachmentId(url)).toBe('file-token-123');
  });

  it('strips a query string in the fallback path', () => {
    const url = 'https://server/legacy/thing?x=1';
    expect(parseAttachmentId(url)).toBe('thing');
  });

  it('strips trailing slashes in the fallback path', () => {
    const url = 'https://server/legacy/thing/';
    expect(parseAttachmentId(url)).toBe('thing');
  });

  it('returns empty string for empty/null/undefined input', () => {
    expect(parseAttachmentId('')).toBe('');
    expect(parseAttachmentId(undefined)).toBe('');
    expect(parseAttachmentId(null)).toBe('');
  });

  it('does not return the whole URL when no GUID and no path segment beyond host', () => {
    // Degenerate: only a host. Fallback yields the host token, never the
    // full URL with scheme.
    expect(parseAttachmentId('https://host')).toBe('host');
  });
});
