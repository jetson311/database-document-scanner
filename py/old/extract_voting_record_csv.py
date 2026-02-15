"""
Extract voting records from Board of Trustees meeting minute PDFs per VOTE_EXTRACTION_GUIDE.md.
Output: CSV in documents/board_of_trustees_documents/voting_record.csv

Usage:
  python extract_voting_record_csv.py              # all files that look like minutes
  python extract_voting_record_csv.py --all        # every PDF in the folder (except drafts)
  python extract_voting_record_csv.py --limit N    # process first N only (for testing)

By default, only PDFs that look like meeting minutes are used (names with "minutes", bd._mtg._*.pdf,
special_mtg, or "mtg" without agenda/attachment/abstract). Use --all to process every PDF in the folder.

Requires: ANTHROPIC_API_KEY in .env.local (project root). pip install pypdf requests.
"""

import csv
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "documents" / "board_of_trustees_documents"
OUT_CSV = DOCS_DIR / "voting_record.csv"
PUBLIC_CSV = ROOT / "public" / "voting_record.csv"  # copy for app to fetch
# Guide: prefer copy in board_of_trustees folder, then Downloads
GUIDE_CANDIDATES = [
    DOCS_DIR / "VOTE_EXTRACTION_GUIDE.md",
    Path(os.path.expanduser("~/Downloads/VOTE_EXTRACTION_GUIDE.md")),
]

CSV_HEADERS = [
    "date",
    "section",
    "motion_description",
    "mover",
    "seconder",
    "vote_result",
    "mayor_rossi",
    "trustee_price_bush",
    "trustee_dunkelbarger",
    "trustee_vandeinse_perez",
    "trustee_dubuque",
    "notes",
]

# JSON schema for one row (trustee columns: YES, NO, ABSENT, ABSTAIN, or empty)
ROW_SCHEMA = {
    "type": "object",
    "properties": {
        "date": {"type": "string"},
        "section": {"type": "string"},
        "motion_description": {"type": "string"},
        "mover": {"type": "string"},
        "seconder": {"type": "string"},
        "vote_result": {"type": "string"},
        "mayor_rossi": {"type": "string"},
        "trustee_price_bush": {"type": "string"},
        "trustee_dunkelbarger": {"type": "string"},
        "trustee_vandeinse_perez": {"type": "string"},
        "trustee_dubuque": {"type": "string"},
        "notes": {"type": "string"},
    },
    "required": [
        "date", "section", "motion_description", "mover", "seconder", "vote_result",
        "mayor_rossi", "trustee_price_bush", "trustee_dunkelbarger",
        "trustee_vandeinse_perez", "trustee_dubuque", "notes",
    ],
    "additionalProperties": False,
}

API_SCHEMA = {
    "type": "object",
    "properties": {
        "rows": {
            "type": "array",
            "items": ROW_SCHEMA,
        },
    },
    "required": ["rows"],
    "additionalProperties": False,
}


def load_env():
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                v = v.strip().strip('"').strip("'")
                os.environ.setdefault(k.strip(), v)


def get_minute_pdfs(limit=None, include_all=False):
    """Return PDFs that look like meeting minutes, or all PDFs (except drafts) if include_all=True."""
    if not DOCS_DIR.exists():
        return []
    names = [f.name for f in DOCS_DIR.iterdir() if f.suffix.lower() == ".pdf"]
    if include_all:
        minutes = [n for n in names if "draft" not in n.lower()]
        minutes.sort()
        if limit is not None:
            minutes = minutes[:limit]
        return minutes
    minutes = []
    for n in names:
        lower = n.lower()
        if "draft" in lower:
            continue
        if "minutes" in lower:
            minutes.append(n)
        elif re.match(r"^bd\._mtg\._\d{2}\.\d{2}\.\d{2}\.pdf$", n, re.I):
            minutes.append(n)
        elif re.match(r"^\d\.\d{2}\.\d{2}_mtg_minutes\.pdf$", n, re.I):
            minutes.append(n)
        elif "special_mtg" in lower or "special_mtg." in lower:
            minutes.append(n)
        elif "mtg" in lower and "agenda" not in lower and "attachment" not in lower and "abstract" not in lower:
            minutes.append(n)
    minutes.sort()
    if limit is not None:
        minutes = minutes[:limit]
    return minutes


def date_from_filename(filename):
    base = Path(filename).stem
    m1 = re.search(r"(\d{1,2})\.(\d{1,2})\.(\d{2})", base)
    if m1:
        month, day, yy = m1.group(1), m1.group(2), m1.group(3)
        year = 2000 + int(yy) if int(yy) < 50 else 1900 + int(yy)
        return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    m2 = re.search(r"(\d{1,2})-(\d{1,2})-(\d{4})", base)
    if m2:
        month, day, year = m2.group(1), m2.group(2), m2.group(3)
        return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
    return ""


def extract_pdf_text(file_path):
    try:
        from pypdf import PdfReader
    except ImportError:
        print("Install pypdf: pip install pypdf", file=sys.stderr)
        sys.exit(1)
    reader = PdfReader(file_path)
    parts = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            parts.append(t)
    text = "\n".join(parts)
    if len(text.strip()) >= 100:
        return text
    text_from_ocr = _extract_text_ocr(file_path)
    if text_from_ocr and len(text_from_ocr.strip()) > len(text.strip()):
        return text_from_ocr
    return text


def _extract_text_ocr(file_path):
    """Fallback: extract text from PDF via OCR (for scanned/image PDFs). Requires pdf2image and pytesseract."""
    try:
        from pdf2image import convert_from_path
        import pytesseract
    except ImportError:
        return ""
    try:
        images = convert_from_path(file_path, dpi=150)
        parts = []
        for img in images:
            parts.append(pytesseract.image_to_string(img))
        return "\n".join(parts)
    except Exception:
        return ""


def load_guide_prompt():
    for path in GUIDE_CANDIDATES:
        if path.exists():
            return path.read_text(encoding="utf-8").strip()
    return """
Use the CSV structure:
date, section, motion_description, mover, seconder, vote_result, mayor_rossi, trustee_price_bush, trustee_dunkelbarger, trustee_vandeinse_perez, trustee_dubuque, notes

Rules: Extract every voted motion; use section (e.g. 3a, 6a-i); vote_result: ALL AYES, FAILED, TABLED, WITHDRAWN, or Vote not recorded; trustee columns: YES, NO, ABSENT, ABSTAIN; consent agenda items get same vote for each sub-item; standardize names (Mayor Rossi, Trustee Price-Bush, etc.).
"""


def analyze_with_anthropic(pdf_text, title, meeting_date_hint, guide_text):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise SystemExit("ANTHROPIC_API_KEY not set. Add it to .env.local in project root.")

    prompt = f"""You are extracting voting records from Board of Trustees meeting minutes for the Village of Ballston Spa. Follow the extraction guide below exactly.

## Extraction guide
{guide_text}

## Your task
1. Read the document text below. Identify the meeting date from the header (or use date hint: {meeting_date_hint}).
2. Find every voted motion. Look for: "Motion made by [Name], seconded by [Name]" and the vote result (ALL AYES, AYES/NAYS, 4-1, etc.).
3. For each motion, extract: section (e.g. 3a, 6a-i), motion_description, mover, seconder, vote_result.
4. For each trustee column (mayor_rossi, trustee_price_bush, trustee_dunkelbarger, trustee_vandeinse_perez, trustee_dubuque), set YES, NO, ABSENT, or ABSTAIN based on the vote. If "ALL AYES", set all present trustees to YES and absent to ABSENT. Use the "Present:" list to know who was there.
5. notes: use "Consent agenda item" for consent items, or leave empty.

## Required output format
Return valid JSON only, no other text. Use this exact structure:
{{"rows": [
  {{"date": "YYYY-MM-DD", "section": "3a", "motion_description": "Approve minutes of ...", "mover": "Trustee DuBuque", "seconder": "Trustee Price-Bush", "vote_result": "ALL AYES", "mayor_rossi": "YES", "trustee_price_bush": "YES", "trustee_dunkelbarger": "YES", "trustee_vandeinse_perez": "YES", "trustee_dubuque": "YES", "notes": ""}},
  ... more rows ...
]}}

Every row must have all 12 fields. Use empty string "" for missing values. vote_result must be one of: ALL AYES, FAILED, TABLED, WITHDRAWN, Vote not recorded, or a count like "4-1".

## Document to process
Filename: {title}
Date hint: {meeting_date_hint}

--- DOCUMENT TEXT ---
{pdf_text[:180000]}
--- END ---"""

    import requests

    body = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 8192,
        "messages": [{"role": "user", "content": prompt}],
    }
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
        json=body,
        timeout=180,
    )
    if not resp.ok:
        err = resp.text
        try:
            err_json = resp.json()
            err = json.dumps(err_json, indent=2)
        except Exception:
            pass
        raise RuntimeError(f"API {resp.status_code}: {err[:500]}")

    data = resp.json()
    text = ""
    for block in data.get("content") or []:
        if block.get("type") == "text":
            text = (block.get("text") or "").strip()
            break
    if not text:
        return []

    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)
    parsed = json.loads(text)
    if isinstance(parsed, list):
        return parsed
    return parsed.get("rows") or []


def main():
    load_env()
    limit = None
    include_all = "--all" in sys.argv
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])

    if not DOCS_DIR.exists():
        print(f"Documents directory not found: {DOCS_DIR}", file=sys.stderr)
        sys.exit(1)

    files = get_minute_pdfs(limit=limit, include_all=include_all)
    label = "PDF(s)" if include_all else "minute PDF(s)"
    print(f"Found {len(files)} {label} to process.")
    if not files:
        print("No meeting minute PDFs found.", file=sys.stderr)
        sys.exit(1)

    guide_text = load_guide_prompt()
    all_rows = []

    for i, name in enumerate(files):
        file_path = DOCS_DIR / name
        date_hint = date_from_filename(name)
        print(f"[{i + 1}/{len(files)}] {name} ({date_hint})")
        try:
            pdf_text = extract_pdf_text(file_path)
            n = len(pdf_text.strip())
            if n < 50:
                print(f"  Skipped: only {n} char(s) extracted (PDF may be image-only; install pdf2image + pytesseract for OCR)")
                continue
            rows = analyze_with_anthropic(pdf_text, name, date_hint, guide_text)
            if not rows:
                print("  -> 0 row(s) (no motions found or parse failed)")
                continue
            for r in rows:
                if not isinstance(r, dict):
                    continue
                r.setdefault("date", date_hint)
                row_dict = {}
                for h in CSV_HEADERS:
                    val = r.get(h)
                    if val is None:
                        val = r.get(h.replace("_", " ").title())
                    row_dict[h] = str(val).strip() if val is not None else ""
                all_rows.append(row_dict)
            print(f"  -> {len(rows)} row(s)")
        except Exception as e:
            print(f"  Error: {e}")

    # Write CSV to board_of_trustees_documents folder
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_HEADERS, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(all_rows)
    PUBLIC_CSV.parent.mkdir(parents=True, exist_ok=True)
    with open(PUBLIC_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_HEADERS, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        w.writerows(all_rows)

    print(f"\nWrote {len(all_rows)} voting record row(s) to {OUT_CSV}")
    print(f"Copied to {PUBLIC_CSV} for Voting History tab.")


if __name__ == "__main__":
    main()
