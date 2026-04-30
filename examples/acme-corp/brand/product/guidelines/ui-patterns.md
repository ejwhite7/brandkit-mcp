---
title: Product UI Patterns
section: ui-patterns
---

# Product UI Patterns

## Loading States

- Use skeleton screens for initial page loads
- Use spinners only for actions that take 1-3 seconds
- Show progress bars for actions over 3 seconds
- Always provide a way to cancel long-running operations

## Empty States

- Use illustrations from the approved set
- Include a clear description of what will appear
- Provide a primary action to get started
- Keep copy concise and action-oriented

## Error Handling

- Show errors inline near the relevant field when possible
- Use toast notifications for non-blocking errors
- Use modal dialogs only for critical/destructive errors
- Always suggest a resolution or next step

## Form Patterns

- Label all inputs (never placeholder-only)
- Show validation inline on blur
- Group related fields visually
- Use --color-error for error states, --color-success for valid states
- Submit buttons show loading state during submission

