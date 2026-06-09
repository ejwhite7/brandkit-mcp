import { describe, it, expect } from 'vitest';
import { toCSS, toSCSS, toTailwind, toW3C } from '../formatters/token-formatters.js';
import type { TokenSpecimen } from '../types/design-system.js';

const tokens: TokenSpecimen[] = [
  { name: 'color-primary', value: '#112233', type: 'color', body: '', source: '/t/a.md' },
  { name: 'spacing-0', value: '0', type: 'spacing', role: 'baseline', body: '', source: '/t/b.md' },
];

describe('token formatters', () => {
  it('toCSS emits a :root block with custom properties', () => {
    const css = toCSS(tokens);
    expect(css).toContain(':root {');
    expect(css).toContain('--color-primary: #112233;');
  });

  it('toSCSS emits $variables', () => {
    expect(toSCSS(tokens)).toContain('$spacing-0: 0;');
  });

  it('toTailwind emits valid JSON grouped by type', () => {
    const parsed = JSON.parse(toTailwind(tokens));
    expect(parsed.theme.extend.color['color-primary']).toBe('#112233');
  });

  it('toW3C emits valid JSON with $value/$type', () => {
    const parsed = JSON.parse(toW3C(tokens));
    expect(parsed['color-primary'].$value).toBe('#112233');
    expect(parsed['color-primary'].$type).toBe('color');
    expect(parsed['spacing-0'].$description).toBe('baseline');
  });
});
