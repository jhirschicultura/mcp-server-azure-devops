import { z } from 'zod';

/**
 * Convert a Zod schema to JSON Schema draft-07 for MCP tool definitions.
 * Replaces zod-to-json-schema after the Zod 4 upgrade.
 *
 * Uses the input side of the schema: tool arguments are what the client
 * sends, so fields with defaults are optional and `.transform()` schemas
 * (which have no JSON Schema output representation) still convert.
 */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, {
    target: 'draft-07',
    io: 'input',
  }) as Record<string, unknown>;
}
