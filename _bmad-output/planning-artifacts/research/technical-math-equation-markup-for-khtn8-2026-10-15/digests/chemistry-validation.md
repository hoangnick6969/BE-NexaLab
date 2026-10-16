# Source digest: chemistry parsing and validation

Retrieved 2026-10-15 from the ChemPy project’s primary documentation.

- ChemPy documents `Substance.from_formula(...)` for parsing chemical formulas and exposes `balance_stoichiometry(reactants, products)` for balancing reactions.
- Its stated scope is a Python chemistry package mainly for physical, inorganic, and analytical chemistry.
- This supports considering ChemPy for a future validator of supported chemical reactions, but not as a universal equation interchange format, OCR repairer, or complete KHTN8 validator.

Implication: keep OCR text immutable and human-reviewed display markup separate. A balancing result is a validation signal only; it must not overwrite the source transcription or silently “correct” a textbook equation.
