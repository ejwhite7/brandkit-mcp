---
name: Button
category: action
status: stable
---

# Button

The primary interactive element for triggering actions. Buttons are the most common call-to-action across both the marketing site and the product UI.

## Anatomy

- **Label** — Concise verb phrase (1–3 words). "Get started", "Save changes", "Delete queue".
- **Container** — Rounded rectangle. Default radius: `--radius-default` (8px).
- **Icon (optional)** — Leading or trailing 16px icon. Use leading icons for navigation, trailing for external links.
- **Loading state** — Spinner replaces label text while async action is in progress.

## Variants

| Variant | Use case |
|---|---|
| `primary` | The one action you most want the user to take on the page. Limit to one per section. |
| `secondary` | Secondary actions adjacent to a primary. Outline style. |
| `ghost` | Tertiary actions in toolbars or dense UI. No background. |
| `danger` | Destructive actions (delete, revoke). Red fill. |

## Sizes

| Size | Height | Font size | Padding |
|---|---|---|---|
| `sm` | 32px | 14px | 8px 12px |
| `md` (default) | 40px | 16px | 10px 16px |
| `lg` | 48px | 18px | 12px 24px |

## Do

- Use sentence case for labels ("Get started", not "GET STARTED").
- Pair with a clear, specific action word.
- Ensure 4.5:1 contrast ratio for text in all states.

## Don't

- Don't use more than one primary button per visual region.
- Don't use vague labels like "Click here" or "Submit".
- Don't disable buttons without explaining why via tooltip or helper text.
