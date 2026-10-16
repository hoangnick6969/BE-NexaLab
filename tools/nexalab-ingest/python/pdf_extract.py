#!/usr/bin/env python3
"""PyMuPDF bridge. Stdout is reserved for one JSON result."""
from __future__ import annotations

import argparse
import json
import sys


def fail(message: str, code: int = 1) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("--ocr", action="store_true")
    args = parser.parse_args()
    try:
        import fitz  # PyMuPDF
    except ImportError:
        fail("PyMuPDF is required: python -m pip install pymupdf")

    try:
        document = fitz.open(args.pdf)
    except Exception as exc:  # file/input diagnostics belong on stderr
        fail(f"Unable to open PDF: {exc}")

    pages = []
    has_text = False
    for page_number, page in enumerate(document, start=1):
        blocks = []
        for block_index, block in enumerate(page.get_text("blocks"), start=1):
            text = " ".join(str(block[4]).split())
            if text:
                has_text = True
                blocks.append({"locator": f"page:{page_number}:block:{block_index}", "text": text})
        pages.append({"page": page_number, "width": page.rect.width, "height": page.rect.height, "blocks": blocks})

    ocr_used = False
    if not has_text and args.ocr:
        try:
            for page_number, page in enumerate(document, start=1):
                text_page = page.get_textpage_ocr()
                text = " ".join(page.get_text("text", textpage=text_page).split())
                pages[page_number - 1]["blocks"] = ([{"locator": f"page:{page_number}:ocr", "text": text}] if text else [])
            ocr_used = True
        except Exception as exc:
            fail(f"OCR requested after empty text layer but failed: {exc}")

    result = {"kind": "PDF_DOCUMENT", "pageCount": len(document), "textLayerPresent": has_text, "ocrRequested": args.ocr, "ocrUsed": ocr_used, "pages": pages}
    sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
