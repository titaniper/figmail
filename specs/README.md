# Specs

Figmail follows **Spec-Driven Development (SDD)**: every feature or system is
defined here _before_ it is implemented, and this directory is the source of
truth for behavior. When code and spec disagree, that is a bug in one of them —
fix the spec first, then the code.

## Layout

```
specs/
  README.md                     ← this file (index + conventions)
  NNN-feature-slug/
    spec.md                     ← what & why, requirements, acceptance criteria
    (optional) data-model.md    ← IR / entity shapes when non-trivial
    (optional) notes.md         ← research, open questions, decisions
```

- `NNN` is a zero-padded, incrementing number in the order features are started.
- `feature-slug` is kebab-case.

## Index

| #   | Feature                                                    | Status          |
| --- | ---------------------------------------------------------- | --------------- |
| 001 | [HTML email export](001-html-email-export/spec.md)         | MVP             |
| 002 | [Variables & bindings](002-variables-and-bindings/spec.md) | MVP             |
| 003 | [Theming (dark/light)](003-theming-dark-light/spec.md)     | MVP (Text)      |
| 004 | [Client preview](004-client-preview/spec.md)               | Partial (Gmail) |

## Conventions

- **Language**: `spec.md` is written in Korean; technical/DDD terms stay in
  English (IR, MJML, section, column, auto layout, …).
- **spec.md structure** (keep it lightweight but complete):
  1. 배경 / 목적 — why this exists
  2. 범위 — in scope / out of scope
  3. 요구사항 — numbered, testable requirements (`R1`, `R2`, …)
  4. 동작 규칙 — mapping/heuristic rules
  5. 인수 조건 — acceptance criteria (how we know it works)
  6. 한계 & 로드맵 — known limitations and what comes next
- A spec describes **behavior and rules**, not code. Reference file paths only
  when it genuinely aids understanding.
- When behavior changes, update the spec in the **same** change as the code.
