# AGENTS.md

## Before You Start

Read these files in order. Do not skip any.

| Order | File | Why |
|-------|------|-----|
| 1 | `project-overview.md` | What this product is and who it's for |
| 2 | `02-user-requirements.md` | Who uses it, what they need, what the system must do |
| 3 | `03-workflow-spec.md` | How projects move through stages — the state machine |
| 4 | `04-data-model.md` | What data exists, how it relates, what constraints apply |
| 5 | `05-api-spec.md` | What endpoints exist, what they accept and return |
| 6 | `06-ui-spec.md` | How it looks — tokens, layout, components, accessibility |
| 7 | `07-tech-stack.md` | What technologies are used and how they connect |
| 8 | `08-code-standards.md` | How to write code, test it, and organize it |
| 9 | `09-ai-workflow-rules.md` | How to scope work, when to stop, what not to touch |
| 10 | `progress-tracker.md` | What's done, what's next, what's blocked |

## Rules

- **One feature unit at a time.** Scope is defined in `09-ai-workflow-rules.md`.
- **Check `progress-tracker.md` first.** Know the current state before changing anything.
- **Update `progress-tracker.md` after.** Mark completed, in-progress, or blocked before finishing.
- **Build must pass.** Run `npm run build` before declaring a unit done.
- **Do not invent requirements.** If it's not in the specs, ask or add it to Open Questions.
- **Do not modify generated code.** `components/ui/*`, migrations, lockfiles are off-limits.
- **Keep docs in sync.** If your code changes architecture, data model, or standards, update the relevant spec file.
