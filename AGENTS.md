# Figmail — Agent & Contributor Guidelines

A Figma plugin that exports a selected frame to **email-ready HTML** (Emailify-style).

## Core philosophy

- **Spec-Driven Development (SDD)**: behavior is decided in `specs/` **before**
  it is implemented. A spec is the source of truth; code follows the spec, not
  the other way around. Change the spec first, then the code.
- **Functional core, imperative shell**: keep the transforms pure
  (`src/render/`, most of `src/main/traverse.ts`) and push side effects
  (Figma API, DOM, downloads) to the edges (`src/main/code.ts`, `src/ui/ui.ts`).
- **The IR is the contract**: `src/ir/types.ts` is the single seam between the
  Figma side and the rendering side. Both sides depend on it, not on each other.

## Architecture

Pipeline: **Figma node tree → IR → MJML → email HTML**.

```
Figma selection
   │  src/main/traverse.ts   (heuristic flatten → email structure; exports images)
   ▼
IR  src/ir/types.ts          (document > section > column > content)
   │  src/render/mjml.ts      PURE: IR → MJML string
   ▼
MJML → mjml-browser (src/ui/ui.ts, in the iframe) → email HTML
   ▼
preview · copy (images inlined) · export (zip: email.html + images/)
```

Two isolated runtimes, standard for Figma plugins:

| Context            | Files        | Can access                          | Cannot access |
| ------------------ | ------------ | ----------------------------------- | ------------- |
| **main** (sandbox) | `src/main/*` | Figma document API, `exportAsync`   | DOM           |
| **UI** (iframe)    | `src/ui/*`   | DOM, clipboard, mjml-browser, JSZip | Figma API     |

They communicate only via `postMessage`, typed by `src/shared/messages.ts`.
Never widen that contract without updating both sides and the relevant spec.

## Directory layout

```
specs/                  SDD documents — see specs/README.md
src/
  ir/types.ts           IR type definitions (the contract)
  main/code.ts          plugin entry: selection, orchestration, messaging
  main/traverse.ts      Figma node tree → IR (+ image export)
  render/mjml.ts        pure IR → MJML mapping
  shared/messages.ts    postMessage contract (main ↔ UI)
  ui/ui.html            UI shell (JS is inlined at build time)
  ui/ui.ts              UI logic: render, preview, copy, zip export
  types/                ambient .d.ts (e.g. mjml-browser)
build.mjs               esbuild build (inlines UI JS into a single ui.html)
manifest.json           Figma plugin manifest → dist/code.js + dist/ui.html
```

## Conventions

- **TypeScript strict**; no `any`. Prefer inline types; export a type only when
  it is genuinely shared (the IR types are the main example).
- **`src/render/*` must stay pure** — deterministic string in / string out, no
  Figma, no DOM. This is what keeps it unit-testable.
- Name functions by **intent**, not mechanism.
- Avoid trivial comments; a comment should explain a non-obvious _why_. Business
  rules live in `specs/`, not in restated inline comments.
- Keep the UI a **single self-contained file** — no external network assets in
  `ui.html` (esbuild inlines everything).

## Development

```bash
npm install
npm run build       # one-off build into dist/
npm run watch       # rebuild on change
npm run typecheck   # tsc --noEmit — must pass before commit
```

Load in Figma desktop: **Plugins → Development → Import plugin from manifest…**
→ pick `manifest.json`. Select a frame, run the plugin.

## Definition of done (per change)

1. The change is reflected in the relevant `specs/**/spec.md` first.
2. `npm run typecheck` passes.
3. `npm run build` succeeds.
4. Verified in the Figma app against a real frame when behavior changed.

## Language policy

- Guidelines, code, and identifiers: **English**.
- `specs/**/spec.md`: **Korean** (the author's working language), preserving
  English for technical/DDD terms (IR, MJML, section, column, …).
