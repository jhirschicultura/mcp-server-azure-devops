import {
  detectVssErrorEnvelope,
  MAX_VSS_ENVELOPE_BYTES,
} from './vss-error-envelope';

describe('detectVssErrorEnvelope', () => {
  it('detects a real VSS error envelope and returns its message', () => {
    const envelope = Buffer.from(
      JSON.stringify({
        $id: '1',
        innerException: null,
        message: 'You must provide a value for the id parameter.',
        typeName:
          'Microsoft.VisualStudio.Services.Common.VssPropertyValidationException, Microsoft.VisualStudio.Services.Common',
        typeKey: 'VssPropertyValidationException',
        errorCode: 0,
        eventId: 3000,
      }),
    );
    expect(detectVssErrorEnvelope(envelope)).toBe(
      'You must provide a value for the id parameter.',
    );
  });

  it('does NOT flag a legitimate small JSON document without an exception typeName', () => {
    const json = Buffer.from(
      JSON.stringify({ setting: 'value', enabled: true }),
    );
    expect(detectVssErrorEnvelope(json)).toBeNull();
  });

  it('does NOT flag JSON that has $id and message but a non-exception typeName', () => {
    // Hardened heuristic: typeName must name a .NET exception
    const json = Buffer.from(
      JSON.stringify({
        $id: '1',
        message: 'hello',
        typeName: 'My.Config.Settings',
      }),
    );
    expect(detectVssErrorEnvelope(json)).toBeNull();
  });

  it('does NOT flag JSON missing the $id marker', () => {
    const json = Buffer.from(
      JSON.stringify({
        message: 'boom',
        typeName: 'System.InvalidOperationException',
      }),
    );
    expect(detectVssErrorEnvelope(json)).toBeNull();
  });

  it('returns null for non-JSON content', () => {
    expect(detectVssErrorEnvelope(Buffer.from('plain text'))).toBeNull();
  });

  it('returns null for empty buffers', () => {
    expect(detectVssErrorEnvelope(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for content larger than the envelope cap (does not parse)', () => {
    // A would-be envelope padded beyond the cap is ignored
    const big = Buffer.alloc(MAX_VSS_ENVELOPE_BYTES + 1, 0x7b); // all '{'
    expect(detectVssErrorEnvelope(big)).toBeNull();
  });

  it('returns null for content that does not start with {', () => {
    const arr = Buffer.from(
      JSON.stringify([{ message: 'x', typeName: 'Exception', $id: '1' }]),
    );
    expect(detectVssErrorEnvelope(arr)).toBeNull();
  });
});
