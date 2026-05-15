---
name: Button
category: action
status: stable
---

# Button (Product Override)

Same semantics as the base Button, with adjustments for the dense product UI.

## Product-Specific Changes

- **Default radius:** `--radius-sm` (4px) instead of `--radius-default` (8px). Tighter feel for data-dense dashboards.
- **Size defaults:** `sm` (32px) is the default size for in-table and toolbar buttons. Use `md` only for primary page-level actions.
- **Label density:** Product buttons may use noun phrases for object actions ("Delete queue", "Rotate key") rather than always starting with a verb.

## Sizes in Product Context

| Size | Height | Use |
|---|---|---|
| `xs` | 24px | Icon-only toolbar actions |
| `sm` (default) | 32px | In-table actions, sidebars |
| `md` | 40px | Page-level CTAs, modal footers |
