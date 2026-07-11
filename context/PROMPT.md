# PROMPT.md

## Role

You are implementing **one feature unit** for Nexesis, a final-year project supervision platform.

## Before You Start

1. Read `AGENTS.md`.
2. Check `progress-tracker.md` for current state.
3. Read only the spec sections listed below for this unit.

## Your Task

Implement: **[FEATURE_NAME]**

## Specs to Read

| File | Sections |
|------|----------|
| `03-workflow-spec.md` | [RELEVANT_STAGES] |
| `04-data-model.md` | [RELEVANT_ENTITIES] |
| `05-api-spec.md` | [RELEVANT_ENDPOINTS] |
| `08-code-standards.md` | Backend-first rule, testing, error handling |

## Constraints

- **Backend only.** No pages, no components, no CSS, no frontend code of any kind.
- Use **Tailwind CSS v4** when frontend phase begins (`@import "tailwindcss"`, `@theme`, no `tailwind.config.js`).
- API logic lives in `server/routes/` and `server/services/`.
- Validation schemas live in `shared/schemas/`.
- Types live in `shared/types/`.
- Do not invent requirements not in the specs.
- Do not modify `components/ui/*`.
- Run `npm run build` before finishing.
- Update `progress-tracker.md` when done.

## Output

1. New/modified backend files.
2. Tests for the new logic.
3. Brief summary of changes.
4. Any spec updates needed (add to Open Questions if unsure).
