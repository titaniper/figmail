# CLAUDE.md

See @AGENTS.md for the full architecture, conventions, and development workflow.

## Quick reminders for AI agents

- This is **Spec-Driven Development**. Before implementing or changing behavior,
  update the matching spec under `specs/` (see `specs/README.md`). Spec first,
  code second.
- Keep `src/render/*` **pure** (no Figma, no DOM) — it is the testable core.
- The **IR** (`src/ir/types.ts`) is the contract between the Figma side and the
  render side; changing it means updating both sides and the spec.
- After code changes: run `npm run typecheck` and `npm run build`; both must pass.
- Guidelines/code in English; `specs/**/spec.md` in Korean.
