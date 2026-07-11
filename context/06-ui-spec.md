# UI Specification

## Theme

Support both light and dark mode using a clean, enterprise-grade design language inspired by modern SaaS platforms. The interface emphasizes clarity, spacious layouts, layered surfaces, subtle elevation, consistent spacing, and restrained use of vibrant accent colors for primary actions and system states. The experience should feel professional, trustworthy, and productivity-focused for academic institutions.

## Design Tokens

### Colors (Light Mode)

| Role | CSS Variable | Value |
|------|-------------|-------|
| Page background | `--bg-base` | `#FAFAFA` |
| Surface | `--bg-surface` | `#FFFFFF` |
| Primary text | `--text-primary` | `#0F172A` |
| Muted text | `--text-muted` | `#64748B` |
| Primary accent | `--accent-primary` | `#2563EB` |
| Border | `--border-default` | `#E2E8F0` |
| Error | `--state-error` | `#DC2626` |
| Success | `--state-success` | `#16A34A` |

### Colors (Dark Mode)

| Role | CSS Variable | Value |
|------|-------------|-------|
| Page background | `--bg-base` | `#0F172A` |
| Surface | `--bg-surface` | `#1E293B` |
| Primary text | `--text-primary` | `#F8FAFC` |
| Muted text | `--text-muted` | `#94A3B8` |
| Primary accent | `--accent-primary` | `#3B82F6` |
| Border | `--border-default` | `#334155` |
| Error | `--state-error` | `#EF4444` |
| Success | `--state-success` | `#22C55E` |

### Extended Palette

| Role | Light | Dark |
|------|-------|------|
| Warning | `#F59E0B` | `#FBBF24` |
| Info | `#0EA5E9` | `#38BDF8` |
| Surface elevated | `#FFFFFF` | `#1E293B` |
| Surface hover | `#F1F5F9` | `#334155` |
| Overlay backdrop | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.7)` |

### Typography

| Role | Font | Variable |
|------|------|----------|
| UI text | Geist Sans | `--font-sans` |
| Code/mono | Geist Mono | `--font-mono` |

**Scale:**

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `text-xs` | 12px | 400 | 1.5 | Captions, badges |
| `text-sm` | 14px | 400 | 1.5 | Body secondary, inputs |
| `text-base` | 16px | 400 | 1.5 | Body primary |
| `text-lg` | 18px | 500 | 1.4 | Section headings |
| `text-xl` | 20px | 600 | 1.3 | Card titles |
| `text-2xl` | 24px | 600 | 1.2 | Page headings |
| `text-3xl` | 30px | 700 | 1.1 | Dashboard stats |

### Spacing Scale

Use Tailwind spacing: `4px` base unit (`space-1`).

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight gaps |
| `space-2` | 8px | Inline elements |
| `space-3` | 12px | Component padding |
| `space-4` | 16px | Card padding |
| `space-6` | 24px | Section gaps |
| `space-8` | 32px | Page sections |
| `space-12` | 48px | Major sections |

### Border Radius

| Context | Class | Value |
|---------|-------|-------|
| Inline / small UI | `rounded-md` | 6px |
| Cards / panels | `rounded-xl` | 12px |
| Modals / overlays | `rounded-2xl` | 16px |
| Buttons | `rounded-lg` | 8px |
| Badges / pills | `rounded-full` | 9999px |

### Shadows

| Context | Value |
|---------|-------|
| Card | `0 1px 3px rgba(0,0,0,0.1)` |
| Card hover | `0 4px 12px rgba(0,0,0,0.1)` |
| Dropdown / popover | `0 10px 15px rgba(0,0,0,0.1)` |
| Modal | `0 25px 50px rgba(0,0,0,0.25)` |
| Sticky nav | `0 1px 3px rgba(0,0,0,0.05)` |

### Z-Index Scale

| Layer | Value |
|-------|-------|
| Base content | 0 |
| Sticky elements | 10 |
| Dropdowns | 20 |
| Modals | 30 |
| Toasts / notifications | 40 |
| Loading overlays | 50 |

## Component Library

shadcn/ui on top of Tailwind CSS. Components live in `components/ui/`. Add components using the shadcn CLI and extend them through composition rather than modifying generated components directly.

**Installed components:**
- Button, Card, Dialog, DropdownMenu, Input, Label, Select, Tabs, Table, Badge, Avatar, Tooltip, Toast, Sheet, Skeleton, Separator, ScrollArea, Command, Popover, Calendar, Checkbox, RadioGroup, Textarea, Switch

## Layout Patterns

### Application Shell

```
┌─────────────────────────────────────────────────────────────┐
│  Top Navigation Bar (sticky, h-16)                          │
│  [Logo] [Search]                    [Notifications] [User]  │
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│ Sidebar  │           Main Content Area                      │
│ (w-64,   │           (flex-1, scrollable)                   │
│  fixed)  │                                                  │
│          │                                                  │
│ [Nav]    │                                                  │
│ [Nav]    │                                                  │
│ [Nav]    │                                                  │
│          │                                                  │
└──────────┴──────────────────────────────────────────────────┘
```

**Top navigation:**
- Height: `h-16` (64px)
- Background: `--bg-surface`
- Bottom border: `1px solid --border-default`
- Left: Logo + app name
- Center: Global search (Command palette)
- Right: Notification bell, user avatar dropdown

**Sidebar:**
- Width: `w-64` (256px)
- Background: `--bg-surface`
- Right border: `1px solid --border-default`
- Collapsible on mobile (Sheet component)
- Navigation groups: Main, Projects, Administration

**Content area:**
- Padding: `p-6` (24px)
- Max width: `max-w-7xl` (1280px), centered
- Background: `--bg-base`

### Responsive Breakpoints

| Breakpoint | Width | Layout Change |
|------------|-------|---------------|
| `sm` | 640px | Minor adjustments |
| `md` | 768px | Sidebar collapses to hamburger |
| `lg` | 1024px | Full sidebar visible |
| `xl` | 1280px | Max content width reached |
| `2xl` | 1536px | Extra padding |

### Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Page Header                                                │
│  [Title]                    [Action Buttons]                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  │  Stat   │ │  Stat   │ │  Stat   │ │  Stat   │          │
│  │  Card   │ │  Card   │ │  Card   │ │  Card   │          │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐ ┌─────────────────────────┐   │
│  │                         │ │                         │   │
│  │    Main Content         │ │    Side Panel           │   │
│  │    (2/3 width)          │ │    (1/3 width)          │   │
│  │                         │ │                         │   │
│  └─────────────────────────┘ └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Modal / Overlay Pattern

- Backdrop: `bg-black/50` with `backdrop-blur-sm`
- Modal: centered, `max-w-lg` or `max-w-2xl`, `rounded-2xl`
- Animation: fade in + scale from 95% to 100%
- Close: X button top-right, click backdrop, or Escape key

### Form Patterns

- Label above input, `text-sm`, `font-medium`, `--text-primary`
- Input: `rounded-lg`, `border --border-default`, focus ring `--accent-primary`
- Helper text below: `text-xs`, `--text-muted`
- Error state: border `--state-error`, error message `--state-error`
- Required fields marked with `*` in `--state-error`
- Submit button: right-aligned, primary style
- Cancel button: left of submit, ghost style

### Table Patterns

- Header: `text-xs`, `font-medium`, uppercase, `--text-muted`, `bg-surface`
- Rows: `border-b --border-default`, hover `bg-surface-hover`
- Actions: dropdown menu on rightmost column
- Empty state: centered illustration + message + CTA
- Pagination: bottom of table, `text-sm`

## Icons

Lucide React. Use stroke-based icons only.

| Size | Usage |
|------|-------|
| `h-4 w-4` (16px) | Inline elements, table actions |
| `h-5 w-5` (20px) | Buttons, navigation items |
| `h-6 w-6` (24px) | Feature cards, dashboard highlights |
| `h-8 w-8` (32px) | Empty states, feature illustrations |

## Animation & Motion

| Context | Duration | Easing |
|---------|----------|--------|
| Button hover | 150ms | `ease-out` |
| Card hover | 200ms | `ease-out` |
| Modal open/close | 200ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Toast enter/exit | 300ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Page transition | 150ms | `ease-in-out` |
| Skeleton pulse | 2s | `ease-in-out` (infinite) |

**Principles:**
- Motion should guide attention, not distract.
- Prefer subtle transitions over dramatic animations.
- Respect `prefers-reduced-motion`.

## Accessibility

- WCAG 2.2 AA compliance required.
- Minimum contrast ratio: 4.5:1 for normal text, 3:1 for large text.
- All interactive elements must be keyboard accessible.
- Focus indicators must be visible (`ring-2 ring-accent-primary ring-offset-2`).
- Form inputs must have associated labels.
- Images must have alt text.
- Color must not be the sole indicator of state (icons + text).
- Screen reader announcements for dynamic content (live regions).

## Page Templates

### Auth Pages

- Centered card, `max-w-md`, `rounded-2xl`
- Logo at top, form below, links at bottom
- Minimal chrome, no sidebar

### Dashboard

- Stats row (4 cards on desktop, 2x2 on tablet, stacked on mobile)
- Main content: table or list of pending items
- Side panel: activity feed or quick actions

### Project Detail

- Header: project title, stage badge, progress bar
- Tabs: Overview, Documents, Feedback, Meetings, Grades, Timeline
- Each tab contains role-appropriate content

### Document Viewer

- Full-width viewer with sidebar for feedback/annotations
- Toolbar: zoom, download, version selector
- Annotation layer overlaid on document

### Settings

- Sidebar navigation for settings categories
- Form-heavy pages with save/cancel pattern
- Confirmation dialogs for destructive actions
