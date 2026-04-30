/**
 * @file config.ts
 * @description Zod-validated configuration schema for brandkit.config.yaml.
 *
 * This module defines the shape and validation rules for the user-facing
 * configuration file. Zod provides runtime validation with helpful error
 * messages, while the inferred TypeScript type gives compile-time safety.
 *
 * The schema intentionally has generous defaults so a minimal config
 * (just `name`) is enough to get started.
 */

import { z } from 'zod';

/**
 * Zod schema for brandkit.config.yaml validation.
 *
 * Every field except `name` has a sensible default so users only need to
 * override what differs from convention.
 */
export const BrandKitConfigSchema = z.object({
  /** Display name for the brand or company */
  name: z.string().min(1, 'Brand name is required'),

  /** Brief description of the brand (used in MCP server metadata) */
  description: z.string().optional(),

  /** Semver version of the config format -- allows future migration paths */
  version: z.string().default('1.0.0'),

  /** Context toggles and labels */
  contexts: z.object({
    /** Marketing-site context settings */
    marketing: z.object({
      /** Whether the marketing context is active */
      enabled: z.boolean().default(true),
      /** Human-readable label shown in tools and the preview UI */
      label: z.string().default('Marketing Site'),
      /** Optional extended description of this context */
      description: z.string().optional(),
    }).default({}),

    /** Product/app context settings */
    product: z.object({
      /** Whether the product context is active */
      enabled: z.boolean().default(true),
      /** Human-readable label shown in tools and the preview UI */
      label: z.string().default('Product App'),
      /** Optional extended description of this context */
      description: z.string().optional(),
    }).default({}),
  }).default({}),

  /** Directory path overrides -- relative to the config file location */
  paths: z.object({
    /** Root brand directory containing all design-system assets */
    brand: z.string().default('./brand'),
    /** Shared assets directory (tokens common to both contexts) */
    shared: z.string().default('./brand/shared'),
    /** Marketing-specific assets directory */
    marketing: z.string().default('./brand/marketing'),
    /** Product-specific assets directory */
    product: z.string().default('./brand/product'),
  }).default({}),

  /** Preview server configuration */
  preview: z.object({
    /** Port for the preview server */
    port: z.number().int().min(1).max(65535).default(3000),
    /** Hostname to bind the preview server to */
    host: z.string().default('localhost'),
  }).default({}),

  /** MCP server configuration */
  server: z.object({
    /** Transport mode: "stdio" for Claude Desktop, "sse" for web/HTTP clients */
    transport: z.enum(['stdio', 'sse']).default('stdio'),
    /** Port for the SSE transport (ignored when transport is "stdio") */
    port: z.number().int().min(1).max(65535).default(3001),
    /** Hostname for the SSE transport */
    host: z.string().default('localhost'),
  }).default({}),
});

/**
 * Fully resolved BrandKit configuration type.
 *
 * Inferred from the Zod schema so runtime validation and compile-time
 * types always stay in sync.
 */
export type BrandKitConfig = z.infer<typeof BrandKitConfigSchema>;

