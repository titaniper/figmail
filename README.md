# Figmail

A Figma plugin that exports a selected frame to **email-ready HTML**, in the
spirit of [Emailify](https://www.figma.com/community/plugin/948757112087129900).

Instead of hand-rolling `<table>` hacks for every email client, Figmail maps the
Figma design into [MJML](https://mjml.io) and lets MJML compile the
Outlook-proof, inline-styled HTML.

## Pipeline

```
Figma node tree
   │  traverse (src/main/traverse.ts)   — heuristic flatten into email structure
   ▼
IR  (src/ir/types.ts)                   — document > section > column > content
   │  renderMjml (src/render/mjml.ts)   — PURE function, unit-testable
   ▼
MJML string
   │  mjml-browser (src/ui/ui.ts)       — runs in the iframe
   ▼
Email HTML  → preview / copy / download
```

The plugin runs in two isolated contexts (standard for Figma plugins):

- **main** (`src/main/`) — the plugin sandbox. Reads the document, walks the
  selection, exports images, builds the IR. No DOM access.
- **UI** (`src/ui/`) — the iframe. Receives the IR, renders MJML → HTML,
  previews it, and handles copy / download. No Figma API access.

They talk over `postMessage` using the contract in `src/shared/messages.ts`.

## Traversal heuristic (MVP)

Each direct child of the selected root frame becomes one email **section**:

- A **horizontal** auto-layout child → a multi-column section (one column per
  grandchild).
- Anything else → a single-column section holding the flattened leaf content
  (text / image / button) of that child.

Leaf mapping: `TEXT` → `mj-text`, image-fill / vector nodes → exported PNG →
`mj-image`, nodes named `button`/`btn`/`cta` → `mj-button`.

## Output

- **Preview / Copy HTML** — images inlined as base64 data URLs, so the HTML is a
  single self-contained file.
- **Export** — a `figmail-export.zip` containing `email.html` +
  `images/<id>.png`, with the HTML referencing images by relative path, so the
  design reproduces exactly when the folder is opened or served.

## Known limitations (early)

- Arbitrary nesting is flattened — deep/complex layouts need a smarter section
  splitter.
- Data-URL images are fine for preview/local use; many email clients strip
  them, so production sends need hosted image URLs (see roadmap).
- No support yet for gradients, strokes/borders, shadows, or responsive
  breakpoints.

## Specs

Behavior is defined under [`specs/`](specs/README.md) first (Spec-Driven
Development). Start with [001 · HTML email export](specs/001-html-email-export/spec.md).

## Development

```bash
npm install
npm run build        # one-off build into dist/
npm run watch        # rebuild on change
npm run typecheck
```

Then in the Figma desktop app: **Plugins → Development → Import plugin from
manifest…** and pick `manifest.json`. Select a frame and run the plugin.

## Roadmap

1. Smarter section/column splitting for nested layouts
2. Hosted-image upload option (replace data URLs)
3. Text run styling (mixed styles within a single text node)
4. Buttons/links via Figma prototype interactions or layer metadata
5. Config panel (max width, font fallbacks, image scale)
6. Unit tests for `renderMjml` + traversal fixtures

## License

MIT
