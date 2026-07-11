# UI Context

## Theme

Support both light and dark mode using a clean, enterprise-grade design language inspired by modern SaaS platforms. The interface emphasizes clarity, spacious layouts, layered surfaces, subtle elevation, consistent spacing, and restrained use of vibrant accent colors for primary actions and system states. The experience should feel professional, trustworthy, and productivity-focused for academic institutions.

## Colors

Define your color tokens as CSS custom properties.
All components must use these tokens — no hardcoded
hex values.

### Light Mode Tokens

| Role | CSS Variable | Value |
| --------------- | ------------------ | -------- |
| Page background | `--bg-base` | `#FAFAFA` |
| Surface | `--bg-surface` | `#FFFFFF` |
| Primary text | `--text-primary` | `#0F172A` |
| Muted text | `--text-muted` | `#64748B` |
| Primary accent | `--accent-primary` | `#2563EB` |
| Border | `--border-default` | `#E2E8F0` |
| Error | `--state-error` | `#DC2626` |
| Success | `--state-success` | `#16A34A` |

### Dark Mode Tokens

| Role | CSS Variable | Value |
| --------------- | ------------------ | -------- |
| Page background | `--bg-base` | `#0F172A` |
| Surface | `--bg-surface` | `#1E293B` |
| Primary text | `--text-primary` | `#F8FAFC` |
| Muted text | `--text-muted` | `#94A3B8` |
| Primary accent | `--accent-primary` | `#3B82F6` |
| Border | `--border-default` | `#334155` |
| Error | `--state-error` | `#EF4444` |
| Success | `--state-success` | `#22C55E` |

### Extended Semantic Tokens

| Role | CSS Variable | Light | Dark |
|------|-------------|-------|------|
| Secondary surface | `--bg-surface-secondary` | `#F1F5F9` | `#1E293B` |
| Hover surface | `--bg-surface-hover` | `#F8FAFC` | `#334155` |
| Active surface | `--bg-surface-active` | `#EFF6FF` | `#1E3A5F` |
| Primary text inverse | `--text-inverse` | `#FFFFFF` | `#0F172A` |
| Accent hover | `--accent-hover` | `#1D4ED8` | `#60A5FA` |
| Accent muted | `--accent-muted` | `#DBEAFE` | `#1E3A5F` |
| Warning | `--state-warning` | `#F59E0B` | `#FBBF24` |
| Info | `--state-info` | `#3B82F6` | `#60A5FA` |
| Disabled | `--state-disabled` | `#CBD5E1` | `#475569` |
| Overlay backdrop | `--backdrop` | `rgba(15, 23, 42, 0.5)` | `rgba(0, 0, 0, 0.6)` |

## Typography

| Role | Font | Variable |
| --------- | ----------------- | ------------- |
| UI text | Geist Sans | `--font-sans` |
| Code/mono | Geist Mono | `--font-mono` |

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `text-xs` | 12px | 400 | 1.5 | Captions, badges, timestamps |
| `text-sm` | 14px | 400 | 1.5 | Body secondary, form labels |
| `text-base` | 16px | 400 | 1.5 | Body primary, inputs |
| `text-lg` | 18px | 500 | 1.4 | Section headings |
| `text-xl` | 20px | 600 | 1.3 | Card titles |
| `text-2xl` | 24px | 600 | 1.2 | Page headings |
| `text-3xl` | 30px | 700 | 1.2 | Dashboard stats |

## Border Radius

| Context | Class |
| ----------------- | ---------------- |
| Inline / small UI | `rounded-md` |
| Cards / panels | `rounded-xl` |
| Modals / overlays | `rounded-2xl` |
| Buttons | `rounded-lg` |
| Inputs | `rounded-md` |
| Avatars | `rounded-full` |
| Tables | `rounded-xl` (container) |

## Spacing Scale

Use Tailwind's default spacing scale with these conventions:

| Context | Value |
|---------|-------|
| Inline element gap | `gap-1` (4px) |
| Button padding | `px-4 py-2` |
| Card padding | `p-6` |
| Section gap | `gap-6` |
| Page padding | `px-6 py-8` |
| Sidebar width | `w-64` (256px) |
| Top nav height | `h-16` (64px) |
| Content max width | `max-w-7xl` |

## Component Library

shadcn/ui on top of Tailwind CSS. Components live in `components/ui/`. Add components using the shadcn CLI and extend them through composition rather than modifying generated components directly.

### Required shadcn/ui Components

- Button, Input, Textarea, Select, Dialog, Dropdown Menu, Tabs, Table, Card, Badge, Avatar, Toast, Sheet, Skeleton, Calendar, Popover, Command, Separator, Scroll Area, Collapsible, Tooltip.

### Custom Components (to build)

- `WorkflowTimeline` — Visual stage progression with status indicators.
- `DocumentViewer` — PDF/DOCX preview with annotation overlay.
- `FeedbackThread` — Threaded comments linked to document versions.
- `MeetingScheduler` — Calendar-based meeting creation with conflict detection.
- `RubricGrader` — Configurable rubric input with automatic calculation.
- `NotificationBell` — Real-time notification dropdown with read/unread states.
- `AuditLogViewer` — Filterable, paginated audit trail table.
- `ReportExporter` — Export format selector with generation progress.

## Layout Patterns

- Application shell with persistent left sidebar, top navigation bar, and responsive content area.
- Dashboards composed of responsive cards, tables, charts, and activity panels with consistent spacing.
- Centered modal overlays with backdrop blur for focused workflows and confirmations.
- Sticky top navigation with subtle bottom border containing global search, notifications, and user account controls.

### Responsive Breakpoints

| Breakpoint | Width | Layout Behavior |
|------------|-------|-----------------|
| Mobile | < 640px | Single column, sidebar becomes sheet/drawer, tables scroll horizontally |
| Tablet | 640px – 1024px | Two-column dashboards, sidebar collapsible |
| Desktop | 1024px – 1440px | Full sidebar, three-column dashboards |
| Wide | > 1440px | Centered content with max-width, spacious layouts |

### Z-Index Hierarchy

| Layer | Z-Index | Elements |
|-------|---------|----------|
| Base content | 0 | Page content, cards |
| Sticky elements | 10 | Sticky headers, table headers |
| Dropdowns | 20 | Select menus, dropdown menus |
| Modals | 30 | Dialog overlays, sheets |
| Toasts | 40 | Notification toasts |
| Tooltips | 50 | Hover tooltips |

## Icons

Lucide React. Use stroke-based icons only. Standard sizes are `h-4 w-4` for inline elements, `h-5 w-5` for buttons and navigation, and `h-6 w-6` for feature cards and dashboard highlights.

### Icon Conventions

| Context | Icon Size | Stroke Width |
|---------|-----------|--------------|
| Inline text | 16px | 2px |
| Buttons, nav | 20px | 2px |
| Feature cards | 24px | 1.5px |
| Empty states | 48px | 1.5px |

## Accessibility Requirements (WCAG 2.2 AA)

### Color & Contrast
- All text must meet minimum 4.5:1 contrast ratio against background.
- Large text (18px+ bold or 24px+) must meet 3:1 contrast ratio.
- Interactive elements must have visible focus indicators with 3:1 contrast against adjacent colors.
- Do not rely on color alone to convey state; always pair with icon or text label.

### Keyboard Navigation
- All interactive elements must be reachable via Tab key.
- Modal dialogs must trap focus and close on Escape.
- Dropdown menus must support arrow key navigation.
- Skip-to-content link must be present on all pages.

### Screen Readers
- All images must have descriptive alt text.
- Form inputs must have associated labels.
- Dynamic content updates must be announced via ARIA live regions.
- Tables must have proper scope attributes on headers.
- Icon-only buttons must have aria-label descriptions.

### Motion & Animation
- Respect `prefers-reduced-motion` media query.
- Avoid auto-playing animations; provide pause controls where necessary.
- Page transitions should be subtle (fade or slide, max 200ms).

### Touch Targets
- Minimum touch target size: 44x44px on mobile.
- Adequate spacing between adjacent interactive elements.

## Dark Mode Implementation

- Use `next-themes` for theme management.
- Apply `dark` class to `<html>` element.
- All custom CSS must use CSS variables that respond to `.dark` class.
- Test all components in both modes before marking complete.
- Avoid pure black (`#000000`) in dark mode; use slate scale instead.
