---
name: Card
category: layout
status: stable
---

# Card

A contained surface for grouping related content. Used for dashboard widgets, feature lists, pricing tiers, and event log entries.

## Anatomy

- **Surface** — White (`--color-surface`) with `--color-border` border and `--radius-default` radius.
- **Header (optional)** — Title + optional supporting metadata (timestamp, status badge).
- **Body** — Primary content area. Padding: 16px (default) or 24px (large).
- **Footer (optional)** — Action row with secondary buttons or metadata.
- **Shadow** — `0 1px 3px rgba(0,0,0,0.08)` default. Hover: `0 4px 12px rgba(0,0,0,0.12)`.

## Variants

| Variant | Use case |
|---|---|
| `default` | General content grouping |
| `interactive` | Clickable card (full-surface hover state) |
| `featured` | Highlighted card with primary color left border or background tint |
| `compact` | Reduced padding for dense lists |

## Do

- Keep card content focused on a single topic or entity.
- Use consistent card sizes within a grid.
- Add a clear call-to-action when the card represents a task or choice.

## Don't

- Don't nest cards inside cards.
- Don't overload a card with more than 3–4 data points — consider a detail page instead.
- Don't use cards for flat, uniform list data — a table is better.
