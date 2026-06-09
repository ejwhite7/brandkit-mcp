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
  // RESERVED: accepted for forward compatibility but not yet honored — the
  // resolver always materializes all three contexts. See CLAUDE.md.
  contexts: z
    .array(z.enum(['base', 'web', 'product']))
    .default(['base', 'web', 'product']),
  ignore: z.array(z.string()).default(['human/']),
  preview: z
    .object({
      port: z.number().int().min(1).max(65535).default(3000),
      host: z.string().default('localhost'),
    })
    .default({}),
  server: z
    .object({
      transport: z.enum(['stdio', 'sse']).default('stdio'),
      port: z.number().int().min(1).max(65535).default(3001),
      host: z.string().default('localhost'),
    })
    .default({}),
});

export type BrandKitConfig = z.infer<typeof BrandKitConfigSchema>;
