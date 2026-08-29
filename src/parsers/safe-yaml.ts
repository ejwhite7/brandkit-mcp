import { load } from 'js-yaml';

const MIN_GRAPH_NODES = 256;
const MAX_GRAPH_NODES = 100_000;
const NODES_PER_SOURCE_BYTE = 4;
const MIN_GRAPH_TEXT_BYTES = 4 * 1024;
const MAX_GRAPH_TEXT_BYTES = 16 * 1024 * 1024;
const TEXT_BYTES_PER_SOURCE_BYTE = 8;
const MAX_GRAPH_DEPTH = 64;

export interface YamlGraphBudget {
  maxNodes: number;
  maxTextBytes: number;
  maxDepth: number;
}

export class YamlGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'YamlGraphError';
  }
}

function bounded(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Derive a finite post-parse budget from an already byte-bounded source file.
 * The hard caps keep large allowed inputs from creating an unbounded object
 * graph, while the multipliers prevent tiny alias documents from producing a
 * disproportionately large serialized result.
 */
export function yamlGraphBudget(sourceBytes: number): YamlGraphBudget {
  const safeSourceBytes = Number.isSafeInteger(sourceBytes) && sourceBytes >= 0 ? sourceBytes : 0;
  return {
    maxNodes: bounded(
      safeSourceBytes * NODES_PER_SOURCE_BYTE,
      MIN_GRAPH_NODES,
      MAX_GRAPH_NODES,
    ),
    maxTextBytes: bounded(
      safeSourceBytes * TEXT_BYTES_PER_SOURCE_BYTE,
      MIN_GRAPH_TEXT_BYTES,
      MAX_GRAPH_TEXT_BYTES,
    ),
    maxDepth: MAX_GRAPH_DEPTH,
  };
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/**
 * Copy a js-yaml result into an acyclic JSON-safe tree. Alias occurrences are
 * copied independently, so later mutation cannot cross-contaminate siblings.
 * Each occurrence consumes the same finite budget it will consume when it is
 * serialized; an alias expansion therefore cannot bypass the output bound.
 */
export function sanitizeYamlGraph(
  value: unknown,
  budget: YamlGraphBudget,
): unknown {
  let nodes = 0;
  let textBytes = 0;
  const active = new WeakSet<object>();

  const consumeNode = () => {
    nodes += 1;
    if (nodes > budget.maxNodes) {
      throw new YamlGraphError(`YAML structure exceeds the ${budget.maxNodes}-node limit`);
    }
  };

  const consumeText = (text: string) => {
    textBytes += byteLength(text);
    if (textBytes > budget.maxTextBytes) {
      throw new YamlGraphError(
        `YAML text exceeds the ${budget.maxTextBytes}-byte expanded-text limit`,
      );
    }
  };

  const copy = (input: unknown, depth: number): unknown => {
    if (depth > budget.maxDepth) {
      throw new YamlGraphError(`YAML structure exceeds the ${budget.maxDepth}-level depth limit`);
    }
    consumeNode();

    if (input === null || typeof input === 'boolean') return input;
    if (typeof input === 'string') {
      consumeText(input);
      return input;
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) {
        throw new YamlGraphError('YAML contains a non-finite number that cannot be serialized safely');
      }
      return input;
    }

    if (input instanceof Date) {
      const normalized = input.toISOString();
      consumeText(normalized);
      return normalized;
    }

    if (typeof input !== 'object') {
      throw new YamlGraphError(`YAML contains an unsupported ${typeof input} value`);
    }
    if (active.has(input)) {
      throw new YamlGraphError('YAML aliases form a cycle');
    }

    active.add(input);
    try {
      if (Array.isArray(input)) {
        return input.map((entry) => copy(entry, depth + 1));
      }

      const prototype = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new YamlGraphError('YAML contains an unsupported object value');
      }

      const output: Record<string, unknown> = {};
      for (const key of Object.keys(input)) {
        consumeText(key);
        Object.defineProperty(output, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: copy((input as Record<string, unknown>)[key], depth + 1),
        });
      }
      return output;
    } finally {
      active.delete(input);
    }
  };

  return copy(value, 0);
}

/** Parse YAML and immediately cross the bounded JSON-safe graph boundary. */
export function loadSafeYaml(source: string): unknown {
  const parsed = load(source);
  return sanitizeYamlGraph(parsed ?? null, yamlGraphBudget(byteLength(source)));
}
