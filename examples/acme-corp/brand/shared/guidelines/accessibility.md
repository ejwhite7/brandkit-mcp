---
title: Accessibility Standards
section: accessibility
---

# Acme Corp Accessibility Standards

## Compliance Target

All Acme Corp digital properties must meet WCAG 2.1 Level AA compliance.

## Color Contrast

- Normal text (< 18px): minimum 4.5:1 contrast ratio
- Large text (>= 18px bold or >= 24px): minimum 3:1 contrast ratio
- UI components and graphical objects: minimum 3:1 contrast ratio

### Approved Text/Background Combinations

- Primary (#1a1a2e) on Neutral-50 (#fafafa): 16.8:1 (AAA)
- Neutral-900 (#171717) on White (#ffffff): 18.4:1 (AAA)
- Accent (#e94560) on White (#ffffff): 4.6:1 (AA for large text)
- White (#ffffff) on Primary (#1a1a2e): 16.8:1 (AAA)

## Typography

- Minimum body text: 16px / 1rem
- Line height: minimum 1.5x for body text
- Maximum line length: 75 characters (approximately 36rem)
- Avoid using color alone to convey meaning

## Interactive Elements

- Minimum touch target: 44x44px (mobile), 24x24px (desktop with spacing)
- All interactive elements must have visible focus indicators
- Focus indicators must have minimum 3:1 contrast against adjacent colors
- Keyboard navigation must work for all interactive components

## Images and Media

- All meaningful images require descriptive alt text
- Decorative images use `alt=""`
- Video content requires captions
- Audio content requires transcripts

