"""
Validate that we can read text from PDFs in documents/board_of_trustees_documents.
Reports character counts per file for pypdf and (if installed) OCR.
Run from py/:  python3 validate_pdf_reading.py [--limit N]
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "documents" / "board_of_trustees_documents"


def try_pypdf(file_path):
    """Extract text with pypdf. Returns (char_count, first_200_chars)."""
    try:
        from pypdf import PdfReader
    except ImportError:
        return -1, "(pypdf not installed)"
    try:
        reader = PdfReader(file_path)
        parts = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                parts.append(t)
        text = "\n".join(parts)
        n = len(text.strip())
        preview = text.strip()[:200].replace("\n", " ") if text.strip() else "(empty)"
        return n, preview
    except Exception as e:
        return -2, str(e)


def try_ocr(file_path):
    """Extract text with pdf2image + pytesseract. Returns (char_count, first_200_chars)."""
    try:
        from pdf2image import convert_from_path
        import pytesseract
    except ImportError:
        return -1, "(pdf2image or pytesseract not installed)"
    try:
        images = convert_from_path(file_path, dpi=150)
        parts = []
        for img in images:
            parts.append(pytesseract.image_to_string(img))
        text = "\n".join(parts)
        n = len(text.strip())
        preview = text.strip()[:200].replace("\n", " ") if text.strip() else "(empty)"
        return n, preview
    except Exception as e:
        return -2, str(e)


def main():
    if not DOCS_DIR.exists():
        print(f"Directory not found: {DOCS_DIR}", file=sys.stderr)
        sys.exit(1)

    limit = None
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])

    pdfs = sorted([f.name for f in DOCS_DIR.iterdir() if f.suffix.lower() == ".pdf"])
    if not pdfs:
        print("No PDFs found.")
        sys.exit(0)
    if limit:
        pdfs = pdfs[:limit]

    print(f"Testing text extraction on {len(pdfs)} PDF(s) in {DOCS_DIR.name}/\n")
    print("-" * 80)

    pypdf_ok = 0
    ocr_ok = 0
    ocr_available = None

    for name in pdfs:
        path = DOCS_DIR / name
        n_pypdf, preview_pypdf = try_pypdf(path)
        n_ocr, preview_ocr = try_ocr(path)
        if ocr_available is None:
            ocr_available = n_ocr != -1

        if n_pypdf >= 100:
            pypdf_ok += 1
        if n_ocr >= 100:
            ocr_ok += 1

        pypdf_status = f"{n_pypdf} chars" if n_pypdf >= 0 else ("error" if n_pypdf == -2 else "not installed")
        ocr_status = f"{n_ocr} chars" if n_ocr >= 0 else ("error" if n_ocr == -2 else "not installed")

        print(f"\n{name}")
        print(f"  pypdf:  {pypdf_status}")
        print(f"  OCR:    {ocr_status}")
        if n_pypdf >= 50 and n_pypdf < 500:
            print(f"  pypdf preview: {preview_pypdf!r}...")
        elif n_pypdf >= 500:
            print(f"  pypdf preview: {preview_pypdf!r}...")
        elif n_ocr >= 50 and ocr_available:
            print(f"  OCR preview:    {preview_ocr!r}...")

    print("\n" + "-" * 80)
    print(f"Summary: {len(pdfs)} PDF(s) tested")
    print(f"  pypdf:  {pypdf_ok} file(s) with ≥100 chars")
    if ocr_available:
        print(f"  OCR:    {ocr_ok} file(s) with ≥100 chars")
    else:
        print("  OCR:    not available (install: pip install pdf2image pytesseract, brew install poppler tesseract)")
    if pypdf_ok == 0 and (not ocr_available or ocr_ok == 0):
        print("\n  → No method extracted enough text. Check that PDFs are not encrypted and that OCR is installed if they are scanned.")
    elif pypdf_ok > 0:
        print("\n  → pypdf works for some/all files; extract_voting_record_csv.py can use it.")
    elif ocr_ok > 0:
        print("\n  → OCR works; extract_voting_record_csv.py will use OCR when pypdf returns little text.")


if __name__ == "__main__":
    main()
