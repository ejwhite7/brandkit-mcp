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
    const output = toTailwind(tokens);
    const parsed = JSON.parse(output);
    expect(parsed.theme.extend.color['color-primary']).toBe('#112233');
    expect(output).toBe(`{
  "theme": {
    "extend": {
      "color": {
        "color-primary": "#112233"
      },
      "spacing": {
        "spacing-0": "0"
      }
    }
  }
}`);
  });

  it('toW3C emits valid JSON with $value/$type', () => {
    const output = toW3C(tokens);
    const parsed = JSON.parse(output);
    expect(parsed['color-primary'].$value).toBe('#112233');
    expect(parsed['color-primary'].$type).toBe('color');
    expect(parsed['spacing-0'].$description).toBe('baseline');
    expect(output).toBe(`{
  "color-primary": {
    "$value": "#112233",
    "$type": "color"
  },
  "spacing-0": {
    "$value": "0",
    "$type": "spacing",
    "$description": "baseline"
  }
}`);
  });

  it('toTailwind preserves reserved-looking keys without mutating prototypes', () => {
    const prototypeMarker = 'brandkit-formatter-prototype-marker';
    const constructorMarker = 'brandkit-formatter-constructor-marker';
    const hostileTokens: TokenSpecimen[] = [
      { name: prototypeMarker, value: 'prototype-safe', type: '__proto__', body: '', source: '/t/a.md' },
      { name: constructorMarker, value: 'constructor-safe', type: 'constructor', body: '', source: '/t/b.md' },
      { name: 'prototype', value: 'constructor-prototype-safe', type: 'constructor', body: '', source: '/t/b2.md' },
      { name: '__proto__', value: 'name-safe', type: 'color', body: '', source: '/t/c.md' },
      { name: 'constructor', value: 'constructor-name-safe', type: 'color', body: '', source: '/t/d.md' },
      { name: 'prototype', value: 'prototype-name-safe', type: 'prototype', body: '', source: '/t/e.md' },
    ];
    const objectConstructor = Object as unknown as Record<string, unknown>;
    const objectPrototype = Object.prototype as Record<string, unknown>;
    const prototypeKeysBefore = Reflect.ownKeys(Object.prototype);

    expect(Object.hasOwn(objectPrototype, prototypeMarker)).toBe(false);
    expect(Object.hasOwn(objectConstructor, constructorMarker)).toBe(false);

    try {
      const first = toTailwind(hostileTokens);
      const second = toTailwind(hostileTokens);
      const extend = JSON.parse(first).theme.extend as Record<string, Record<string, string>>;
      const constructorGroup = extend['constructor'] as unknown as Record<string, string>;

      expect(second).toBe(first);
      expect(Object.hasOwn(extend, '__proto__')).toBe(true);
      expect(extend.__proto__[prototypeMarker]).toBe('prototype-safe');
      expect(Object.hasOwn(extend, 'constructor')).toBe(true);
      expect(constructorGroup[constructorMarker]).toBe('constructor-safe');
      expect(constructorGroup.prototype).toBe('constructor-prototype-safe');
      expect(Object.hasOwn(extend.color, '__proto__')).toBe(true);
      expect(extend.color.__proto__).toBe('name-safe');
      expect(extend.color.constructor).toBe('constructor-name-safe');
      expect(extend.prototype.prototype).toBe('prototype-name-safe');
      expect(Object.hasOwn(objectPrototype, prototypeMarker)).toBe(false);
      expect(Object.hasOwn(objectConstructor, constructorMarker)).toBe(false);
      expect(Reflect.ownKeys(Object.prototype)).toEqual(prototypeKeysBefore);
    } finally {
      delete objectPrototype[prototypeMarker];
      delete objectConstructor[constructorMarker];
    }
  });

  it('toW3C preserves reserved-looking token names deterministically', () => {
    const hostileTokens: TokenSpecimen[] = [
      { name: '__proto__', value: 'proto-safe', type: 'color', body: '', source: '/t/a.md' },
      { name: 'constructor', value: 'constructor-safe', type: 'spacing', body: '', source: '/t/b.md' },
      { name: 'prototype', value: 'prototype-safe', type: 'radius', body: '', source: '/t/c.md' },
    ];

    const first = toW3C(hostileTokens);
    const parsed = JSON.parse(first) as Record<string, { $value: string }>;

    expect(toW3C(hostileTokens)).toBe(first);
    expect(Object.keys(parsed)).toEqual(['__proto__', 'constructor', 'prototype']);
    expect(Object.hasOwn(parsed, '__proto__')).toBe(true);
    expect(parsed.__proto__.$value).toBe('proto-safe');
    expect((parsed['constructor'] as unknown as { $value: string }).$value).toBe('constructor-safe');
    expect(parsed.prototype.$value).toBe('prototype-safe');
  });
});
