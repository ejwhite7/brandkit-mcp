/**
 * @file commands/init.ts
 * @description Implementation of the `brandkit-mcp init` command.
 * Creates the complete brand/ directory structure with starter files.
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { isAbsolute, join } from 'path';

/**
 * Handles the `brandkit-mcp init [directory]` command.
 * @param directory - Target directory (default: current directory)
 * @param options - Command options
 */
export async function initCommand(directory: string, options: { name?: string; force?: boolean }): Promise<void> {
  const targetDir = isAbsolute(directory) ? directory : join(process.cwd(), directory);
  const brandDir = join(targetDir, 'brand');

  if (existsSync(brandDir) && !options.force) {
    console.error('Brand directory already exists. Use --force to overwrite.');
    process.exit(1);
  }

  const brandName = options.name ?? 'Your Brand Name';

  console.log(`Initializing BrandKit MCP in ${targetDir}...`);

  // Create directory structure
  const dirs = [
    'brand/shared/colors',
    'brand/shared/typography',
    'brand/shared/logos',
    'brand/shared/voice',
    'brand/shared/guidelines',
    'brand/marketing/colors',
    'brand/marketing/typography',
    'brand/marketing/components',
    'brand/marketing/guidelines',
    'brand/marketing/textures',
    'brand/product/colors',
    'brand/product/typography',
    'brand/product/components',
    'brand/product/guidelines',
    'brand/product/textures',
  ];

  for (const dir of dirs) {
    mkdirSync(join(targetDir, dir), { recursive: true });
  }

  // Write config
  writeFileSync(
    join(targetDir, 'brandkit.config.yaml'),
    `# BrandKit MCP Configuration
# See https://github.com/nicholasgriffintn/brandkit-mcp for documentation

name: "${brandName}"
description: "Design system for ${brandName}"
version: "1.0.0"

contexts:
  marketing:
    enabled: true
    label: "Marketing Site"
    description: "Design system for the marketing website"
  product:
    enabled: true
    label: "Product App"
    description: "Design system for the product application"

# Optional: Override default directory paths
# paths:
#   brand: ./brand
#   shared: ./brand/shared
#   marketing: ./brand/marketing
#   product: ./brand/product

# Preview server settings
preview:
  port: 3000
  host: localhost

# MCP server settings
server:
  transport: stdio  # stdio or sse
  port: 3001
  host: localhost
`,
  );

  // Write starter colors.css
  writeFileSync(
    join(targetDir, 'brand/shared/colors/colors.css'),
    `/* ============================================
   Brand Color Tokens

   Add your brand colors here as CSS custom properties.
   BrandKit MCP will automatically parse these and serve them
   to AI tools via the Model Context Protocol.

   Naming convention: --color-{role}-{variant}
   ============================================ */

:root {
  /* Primary brand colors */
  /* --color-primary: #your-hex-here; */
  /* --color-primary-light: #your-hex-here; */
  /* --color-primary-dark: #your-hex-here; */

  /* Secondary / accent colors */
  /* --color-secondary: #your-hex-here; */
  /* --color-accent: #your-hex-here; */

  /* Neutral palette */
  /* --color-neutral-100: #f8f9fa; */
  /* --color-neutral-200: #e9ecef; */
  /* --color-neutral-900: #212529; */

  /* Semantic colors */
  /* --color-error: #dc3545; */
  /* --color-success: #198754; */
  /* --color-warning: #ffc107; */
  /* --color-info: #0dcaf0; */
}
`,
  );

  // Write starter typography.css
  writeFileSync(
    join(targetDir, 'brand/shared/typography/typography.css'),
    `/* ============================================
   Typography Tokens

   Define your font families, sizes, weights, and
   line heights as CSS custom properties.
   ============================================ */

:root {
  /* Font families */
  /* --font-family-primary: 'Inter', system-ui, sans-serif; */
  /* --font-family-heading: 'Inter', system-ui, sans-serif; */
  /* --font-family-mono: 'JetBrains Mono', monospace; */

  /* Font sizes */
  /* --font-size-xs: 0.75rem; */
  /* --font-size-sm: 0.875rem; */
  /* --font-size-base: 1rem; */
  /* --font-size-lg: 1.125rem; */
  /* --font-size-xl: 1.25rem; */
  /* --font-size-2xl: 1.5rem; */
  /* --font-size-3xl: 1.875rem; */
  /* --font-size-4xl: 2.25rem; */

  /* Font weights */
  /* --font-weight-normal: 400; */
  /* --font-weight-medium: 500; */
  /* --font-weight-semibold: 600; */
  /* --font-weight-bold: 700; */

  /* Line heights */
  /* --line-height-tight: 1.25; */
  /* --line-height-normal: 1.5; */
  /* --line-height-relaxed: 1.75; */
}
`,
  );

  // Write starter logo usage guidelines
  writeFileSync(
    join(targetDir, 'brand/shared/logos/usage-guidelines.md'),
    `---
section: logo-usage
---

# Logo Usage Guidelines

## Variants

Describe your logo variants here:
- **Primary** -- Full color logo on light backgrounds
- **Reversed** -- White logo for dark backgrounds
- **Mark** -- Icon/symbol only
- **Wordmark** -- Text only

## Clear Space

Define minimum clear space requirements around the logo.

## Minimum Size

Define minimum display sizes for each variant.

## Dos and Don'ts

### Do
- Use approved color variants only
- Maintain proportions when scaling

### Don't
- Stretch or distort the logo
- Add effects, shadows, or outlines
- Place on busy backgrounds
- Use unapproved color combinations
`,
  );

  // Write starter brand voice
  writeFileSync(
    join(targetDir, 'brand/shared/voice/brand-voice.md'),
    `---
section: brand-voice
---

# Brand Voice & Tone

## Brand Personality

Describe your brand personality traits here.

## Voice Attributes

| We Sound Like | We Don't Sound Like |
|---|---|
| Confident | Arrogant |
| Clear | Jargon-heavy |
| Friendly | Overly casual |

## Tone Variations

How does tone change across different contexts?

- **Marketing pages**: Inspiring, forward-looking
- **Product UI**: Clear, concise, helpful
- **Support docs**: Patient, thorough
- **Error messages**: Empathetic, solution-oriented

## Writing Principles

1. Use active voice
2. Write in plain language
3. Be specific, not vague
4. Lead with the benefit
`,
  );

  // Write starter accessibility guidelines
  writeFileSync(
    join(targetDir, 'brand/shared/guidelines/accessibility.md'),
    `---
section: accessibility
---

# Accessibility Guidelines

## Color Contrast

- **WCAG AA**: Minimum 4.5:1 for normal text, 3:1 for large text
- **WCAG AAA**: Minimum 7:1 for normal text, 4.5:1 for large text

## Typography

- Minimum body text size: 16px
- Ensure sufficient line height (1.5x minimum for body text)
- Avoid long line lengths (max 80 characters)

## Interactive Elements

- Minimum touch target: 44x44px
- All interactive elements must have visible focus states
- Keyboard navigation must work for all interactive elements

## Images and Media

- All images must have descriptive alt text
- Decorative images use empty alt attributes
- Video content should have captions
`,
  );

  console.log('');
  console.log('BrandKit MCP initialized successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Add your brand colors to brand/shared/colors/colors.css');
  console.log('  2. Add your typography to brand/shared/typography/typography.css');
  console.log('  3. Add logo files to brand/shared/logos/');
  console.log('  4. Run `brandkit-mcp validate` to check your setup');
  console.log('  5. Run `brandkit-mcp serve` to start the MCP server');
  console.log('  6. Connect to Claude Desktop (see README.md)');
}

