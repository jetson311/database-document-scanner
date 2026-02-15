"""
Scan Board of Trustees meeting minute PDFs in documents/board_of_trustees_documents,
extract text, call Anthropic to get voting records, and write public/generated-votes.json.
Usage: python scan_trustees_votes.py [--limit N]
Default: first 3 minute files. Set ANTHROPIC_API_KEY in .env.local (project root).
"""

import json
import os
import re
import sys
from pathlib import Path

# Project root (parent of py/)
ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "documents" / "board_of_trustees_documents"
OUT_FILE = ROOT / "public" / "generated-votes.json"

# Load .env.local from project root
def load_env():
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                v = v.strip().strip('"').strip("'")
                os.environ.setdefault(k.strip(), v)

load_env()

BOARD_OF_TRUSTEES_MEMBERS = [
    "Mayor Rossi",
    "Baskin",
    "Fitzpatrick",
    "Kormos",
    "VanHall",
]

VOTING_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "meetingDate": {"type": "string"},
        "summary": {"type": "string"},
        "votes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "motion": {"type": "string"},
                    "proposer": {"type": "string"},
                    "seconder": {"type": "string"},
                    "ayes": {"type": "array", "items": {"type": "string"}},
                    "nays": {"type": "array", "items": {"type": "string"}},
                    "absent": {"type": "array", "items": {"type": "string"}},
                    "result": {"type": "string", "enum": ["Passed", "Failed"]},
                },
                "required": ["motion", "ayes", "nays", "result"],
            },
        },
    },
    "required": ["meetingDate", "summary", "votes"],
    "additionalProperties": False,
}


def get_minute_pdfs(limit=3):
    if not DOCS_DIR.exists():
        return []
    names = [f.name for f in DOCS_DIR.iterdir() if f.suffix.lower() == ".pdf"]
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
    minutes.sort()
    return minutes[:limit]


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
    return "unknown"


def analysis_to_vote_records(analysis, doc_meta):
    votes = analysis.get("votes") or []
    out = []
    for i, v in enumerate(votes):
        ayes = v.get("ayes") or []
        nays = v.get("nays") or []
        absent = v.get("absent") or []
        if not isinstance(ayes, list):
            ayes = []
        if not isinstance(nays, list):
            nays = []
        if not isinstance(absent, list):
            absent = []

        def match(arr, name):
            name_l = name.lower()
            for x in arr:
                if not isinstance(x, str):
                    continue
                if name_l in x.lower() or x.lower() in name_l:
                    return True
            return False

        member_votes = []
        for member_name in BOARD_OF_TRUSTEES_MEMBERS:
            if match(ayes, member_name):
                status = "Aye"
            elif match(nays, member_name):
                status = "No"
            elif match(absent, member_name):
                status = "Absent"
            else:
                status = "Not Found"
            member_votes.append({"memberName": member_name, "status": status})

        out.append({
            "id": f"local-{doc_meta['id']}-{i}",
            "motion": v.get("motion") or "",
            "description": analysis.get("summary") or "",
            "category": "Board of Trustees",
            "date": doc_meta["date"],
            "proposer": v.get("proposer") or "",
            "seconder": v.get("seconder") or "",
            "votes": member_votes,
            "result": "Failed" if v.get("result") == "Failed" else "Passed",
            "url": doc_meta["url"],
        })
    return out


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
    return "\n".join(parts)


def analyze_with_anthropic(pdf_text, title, date):
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise SystemExit("ANTHROPIC_API_KEY not set. Add it to .env.local in project root.")

    prompt = f"""Below is the full text of a Board of Trustees meeting minutes document from the Village of Ballston Spa.

Title: {title}
Date (from filename): {date}

Extract: meeting date, a brief summary of major decisions, and for each motion: motion text, proposer, seconder, ayes (array of trustee names), nays (array of names), absent (array of names), and result (Passed or Failed). Return only valid JSON matching the required schema.

--- DOCUMENT TEXT ---
{pdf_text[:180000]}
--- END ---"""

    import requests

    body = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 4096,
        "messages": [{"role": "user", "content": prompt}],
        "output_config": {
            "format": {"type": "json_schema", "schema": VOTING_JSON_SCHEMA},
        },
    }
    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
        },
        json=body,
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    text = ""
    for block in data.get("content") or []:
        if block.get("type") == "text":
            text = block.get("text") or ""
            break
    return json.loads(text.strip())


def main():
    limit = 3
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])

    if not DOCS_DIR.exists():
        print(f"Documents directory not found: {DOCS_DIR}", file=sys.stderr)
        sys.exit(1)

    files = get_minute_pdfs(limit)
    print(f"Found {len(files)} minute PDF(s) to scan (limit={limit}):", files)

    all_votes = []
    for i, name in enumerate(files):
        file_path = DOCS_DIR / name
        date = date_from_filename(name)
        doc_id = f"local-bot-{i + 1}"
        print(f"[{i + 1}/{len(files)}] {name} ({date})")
        try:
            pdf_text = extract_pdf_text(file_path)
            if len(pdf_text.strip()) < 100:
                print("  Skipped: too little text extracted")
                continue
            analysis = analyze_with_anthropic(pdf_text, name, date)
            doc_meta = {
                "id": doc_id,
                "title": name,
                "date": date,
                "url": f"/documents/board_of_trustees_documents/{name}",
            }
            records = analysis_to_vote_records(analysis, doc_meta)
            all_votes.extend(records)
            print(f"  -> {len(records)} vote(s)")
        except Exception as e:
            print(f"  Error: {e}")

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(json.dumps(all_votes, indent=2), encoding="utf-8")
    print(f"\nWrote {len(all_votes)} vote record(s) to {OUT_FILE}")


if __name__ == "__main__":
    main()
