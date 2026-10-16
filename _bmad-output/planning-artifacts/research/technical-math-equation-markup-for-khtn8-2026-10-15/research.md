---
title: 'Technical research: equation markup for KHTN8'
type: technical
topic: 'math equation markup for KHTN8'
decision: 'Choose a safe, interoperable representation/rendering approach for chemistry and physics equations in KHTN8 learning content'
source: native-web-research
status: complete
preset: quick
validation: normal
created: 2026-10-15
updated: 2026-10-15
---

# Technical research: equation markup for KHTN8

**Decision this research serves:** Choose a safe, interoperable representation/rendering approach for chemistry and physics equations in KHTN8 learning content.

## Approved scope

- Compare representation standards for chemistry equations and general mathematics/physics expressions.
- Compare web renderers and chemistry notation support.
- Identify whether a chemistry parser can validate semantic balance, distinct from rendering or OCR.
- Primary documentation only; focused quick pass, no subagents, no code changes.

## Executive summary

Use **LaTeX as the authoring/rendering source**, with the `mhchem` `\\ce{...}` syntax for chemical formulas/reactions and ordinary LaTeX for physics/math expressions. Render it in the React web app with **KaTeX plus its mhchem extension** as the lean first choice; MathJax is a reasonable alternative if richer MathML/accessibility and exploration features become a priority. Keep W3C MathML as an interoperability/accessibility output where useful, not as the sole canonical source for all textbook content.

Crucially, markup and rendering do not verify scientific correctness. Preserve OCR text and page locator separately; require human review before a corrected equation becomes trusted content. If later tasks need equation balancing or machine reasoning, store a reviewed structured chemistry representation alongside display markup and validate it with chemistry-aware logic (e.g. ChemPy for supported stoichiometry), never by silently rewriting the source.

## Findings

1. **There is no single universal “equation format” that also solves OCR, display, and scientific semantics.** MathML is a W3C web standard for mathematical notation; MathML Core narrows the implementation target for browsers. LaTeX is a practical authoring representation supported by mature renderers, while a chemistry-specific layer is needed for readable chemical formulae and reaction arrows. [1][2]

2. **`mhchem` is the right notation layer for chemistry display.** The LaTeX package is specifically for typesetting chemical molecular formulae and equations. Both KaTeX and MathJax provide `mhchem` support for `\\ce`/chemical notation; KaTeX documents a direct extension import and render example. [3][4][5]

3. **For NexaLab’s current React/Vite web app, start with KaTeX + mhchem.** It is available as a JavaScript package, includes MathML output options, and its official extension list includes `mhchem`. MathJax is a good alternative when broader MathML input/output, speech, Braille, or math exploration is needed; it offers HTML/CSS, SVG, and serialized MathML output. This is a product-fit recommendation, not a measured bundle-size or speed benchmark. [4][5][6][7]

4. **A renderer is not a chemistry validator.** KaTeX/MathJax parse and typeset expressions. ChemPy, by contrast, exposes formula parsing and stoichiometric balancing APIs, but it is a Python chemistry package whose documented domain is mainly physical, inorganic, and analytical chemistry. It could later validate supported reactions; it is not an OCR correction engine or a general KHTN8 equation schema. [5][8]

5. **Do not normalize OCR directly into canonical display markup without review.** `H2O`, `H₂O`, and OCR-confused forms such as `H20` can look similar in plain text but carry different meaning. Keep the extracted string immutable, create a human-reviewed display form, and record whether parsing/balance checks passed. The equation should retain the textbook page reference so reviewers can compare with the source image/PDF.

## Recommendation

For the current KHTN8 source-of-truth workflow:

- Store the exact OCR extraction as `rawText` (immutable), with source document ID, printed page, PDF page index, and optional bounding box/image reference.
- Store a reviewed `renderSource` string separately. Use `\\ce{2H2 + O2 -> 2H2O}` for chemical reactions; use normal LaTeX for physics/math, e.g. `p = F/A` or `I = U/R`.
- Tag the expression type (`CHEMICAL_REACTION`, `CHEMICAL_FORMULA`, `PHYSICS_FORMULA`, `MATH_EXPRESSION`) so display/parser behavior is explicit.
- Store `reviewStatus` and validation results separately from the rendered string. “KaTeX rendered successfully” only means syntax parsed; it does **not** mean the OCR or equation is scientifically correct or balanced.
- For chemical reasoning later, add optional reviewed structured parts (reactants, products, coefficients, states/conditions, charge) and a validator result. Balance checking must never edit the quoted source equation automatically.
- Implement KaTeX + mhchem first; evaluate MathJax only if product requirements need richer accessibility interactions than the first implementation provides.

Example record (illustrative shape, not an existing project contract):

```json
{
  "kind": "CHEMICAL_REACTION",
  "rawText": "2H2 + O2 -> 2H2O",
  "renderSource": "\\ce{2H2 + O2 -> 2H2O}",
  "source": { "documentId": "sgk-khtn8", "printedPage": 16, "pdfPageIndex": 19 },
  "reviewStatus": "HUMAN_VERIFIED",
  "validation": { "renderer": "PASS", "stoichiometry": "PASS" }
}
```

## Open questions

- Does the first release need inline editing/authoring of equations in admin, or only rendering reviewed equation markup imported from the content pipeline?
- Should student-facing content expose accessible spoken math/keyboard exploration in the first release? If yes, compare KaTeX + assistive support against MathJax in an actual frontend prototype before committing.
- Which specific equation families occur in the KHTN8 source (chemical reactions, circuits, pressure/density, graphs/tables), and which need structured semantics beyond display?

## Sources

| # | Primary source | Evidence used |
|---|---|---|
| 1 | [W3C MathML Core](https://www.w3.org/TR/mathml-core/) | W3C’s browser-oriented core spec for rendering mathematical notation. |
| 2 | [W3C MathML 3: Presentation Markup](https://www.w3.org/TR/MathML3/mathml.html) | Presentation markup captures visual layout; distinguish presentation from richer semantics. |
| 3 | [CTAN: mhchem](https://www.ctan.org/pkg/mhchem) | Package purpose is typesetting chemical molecular formulae and equations. |
| 4 | [KaTeX: Extensions & Libraries](https://katex.org/docs/libs) | Official extension catalog identifies mhchem for chemical equations. |
| 5 | [KaTeX: Node.js and mhchem](https://katex.org/docs/node) | Official example loads `katex/contrib/mhchem` and renders `\\ce{...}`. |
| 6 | [MathJax: mhchem](https://docs.mathjax.org/en/latest/input/tex/extensions/mhchem.html) | Implements the `\\ce` and `\\pu` LaTeX mhchem macros. |
| 7 | [MathJax: Output Formats](https://docs.mathjax.org/en/stable/output/index.html) and [MathML support](https://docs.mathjax.org/en/v4.0/input/mathml.html) | Output options and MathML/accessibility support context. |
| 8 | [ChemPy project documentation](https://github.com/bjodah/chempy) | Documents formula parsing and stoichiometric balancing examples; scope is chemistry computations, not OCR. |

Research run: 2026-10-15. Documentation pages are rolling/live; accessed on this date. No benchmark or implementation compatibility test was run.
