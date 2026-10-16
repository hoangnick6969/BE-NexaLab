# Source digest: equation markup and web rendering

Retrieved 2026-10-15 from primary documentation.

- W3C MathML Core: browser-oriented core specification for mathematical notation/layout; useful interoperability target, but not chemistry-specific semantics.
- CTAN mhchem: LaTeX package for chemical molecular formulae and equations.
- KaTeX official docs: the extension list includes mhchem; Node docs demonstrate loading `katex/contrib/mhchem` and rendering `\\ce{...}`. KaTeX’s output option docs describe HTML, MathML, and combined output.
- MathJax official docs: mhchem implements `\\ce` and `\\pu`; output processors include HTML/CSS, SVG, and serialized MathML; MathJax also describes assistive tech support.

Implication: use a chemistry notation extension with a general math renderer. The renderer parses/typesets notation; it does not establish correctness of OCR or scientific meaning.
