import { z } from 'zod';

export class BrandkitV1ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrandkitV1ConfigError';
  }
}

export const BrandKitConfigSchema = z.object({
  version: z.literal(2, {
    errorMap: () => ({
      message:
        'BrandKit v2 requires `version: 2`. See docs/superpowers/specs/2026-05-14-brand-atomic-system-restructure-design.md for migration.',
    }),
  }),
  brand: z.object({
    name: z.string().min(1, 'brand.name is required'),
    description: z.string().optional(),
    root: z.string().default('./brand_atomic_system'),
  }),
  // Human-authored creative brief. Optional; consumed only to generate
  // DESIGN.md / PRODUCT.md. Never read back as MCP input.
  brief: z
    .object({
      audience: z.string().optional(),
      voice_words: z.string().optional(),
      visual_references: z.string().optional(),
      anti_references: z.string().optional(),
    })
    .optional(),
  // RESERVED: accepted for forward compatibility but not yet honored — the
  // resolver always materializes all three contexts. See CLAUDE.md.
  contexts: z
    .array(z.enum(['base', 'web', 'product']))
    .default(['base', 'web', 'product']),
  ignore: z.array(z.string()).default(['human/']),
  preview: z
    .object({
      port: z.number().int().min(1).max(65535).default(3000),
      host: z.string().min(1).default('127.0.0.1'),
    })
    .default({}),
  server: z
    .object({
      transport: z.enum(['stdio', 'sse', 'http']).default('stdio'),
      port: z.number().int().min(1).max(65535).default(3001),
      host: z.string().min(1).default('127.0.0.1'),
    })
    .default({}),
});

export type BrandKitConfig = z.infer<typeof BrandKitConfigSchema>;
