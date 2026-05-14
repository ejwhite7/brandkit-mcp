---
name: Modal
category: overlay
status: stable
---

# Modal

A focused overlay for confirmations, multi-step flows, and critical decisions that require the user's full attention before continuing.

## Anatomy

- **Backdrop** — Semi-transparent dark overlay (`rgba(0, 0, 0, 0.5)`) covering the full viewport.
- **Container** — Centered panel, max-width 480px (sm), 640px (md), 800px (lg). Radius `--radius-lg`.
- **Header** — Title (required) + optional subtitle + close button (top-right).
- **Body** — Scrollable content area. Max-height 60vh before scrolling kicks in.
- **Footer** — Action buttons, right-aligned. Primary action on the right; Cancel on the left.

## Variants

| Variant | Use case |
|---|---|
| `confirm` | Destructive action confirmation ("Are you sure you want to delete this queue?") |
| `form` | Multi-field input flow (e.g., create a new endpoint) |
| `info` | Read-only detail view (e.g., event payload inspector) |

## Behavior

- Opens with a subtle scale-and-fade animation (120ms, `ease-out`).
- Press Escape or click the backdrop to dismiss (unless `dismissible: false`).
- Focus is trapped inside the modal while open (accessibility).
- Body scroll is locked while the modal is open.

## Do

- Use modals sparingly — they interrupt flow.
- Keep the title to a single line.
- Make the primary action explicit and irreversible actions red (`danger` variant button).

## Don't

- Don't open a modal from within a modal.
- Don't use a modal for success states — use an inline notification instead.
- Don't put more than 5–6 form fields in a modal — consider a dedicated page.
