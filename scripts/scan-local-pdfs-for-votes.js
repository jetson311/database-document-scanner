/**
 * Scan Board of Trustees meeting minute PDFs in documents/board_of_trustees_documents,
 * extract text, call Anthropic to get voting records, and write public/generated-votes.json.
 * Usage: node scripts/scan-local-pdfs-for-votes.js [--limit N]
 * Default: first 3 minute files. Set ANTHROPIC_API_KEY in .env.local.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { pdf } from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DOCS_DIR = path.join(ROOT, "documents", "board_of_trustees_documents");
const OUT_FILE = path.join(ROOT, "public", "generated-votes.json");

dotenv.config({ path: path.join(ROOT, ".env.local") });

const BOARD_OF_TRUSTEES_MEMBERS = [
  "Mayor Rossi",
  "Baskin",
  "Fitzpatrick",
  "Kormos",
  "VanHall",
];

const VOTING_JSON_SCHEMA = {
  type: "object",
  properties: {
    meetingDate: { type: "string" },
    summary: { type: "string" },
    votes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          motion: { type: "string" },
          proposer: { type: "string" },
          seconder: { type: "string" },
          ayes: { type: "array", items: { type: "string" } },
          nays: { type: "array", items: { type: "string" } },
          absent: { type: "array", items: { type: "string" } },
          result: { type: "string", enum: ["Passed", "Failed"] },
        },
        required: ["motion", "ayes", "nays", "result"],
      },
    },
  },
  required: ["meetingDate", "summary", "votes"],
  additionalProperties: false,
};

function getMinutePdfs(limit = 3) {
  const names = fs.readdirSync(DOCS_DIR);
  const minutes = names.filter((n) => {
    const lower = n.toLowerCase();
    if (!n.endsWith(".pdf")) return false;
    if (lower.includes("draft")) return false;
    return (
      lower.includes("minutes") ||
      /^bd\._mtg\._\d{2}\.\d{2}\.\d{2}\.pdf$/i.test(n) ||
      /^\d\.\d{2}\.\d{2}_mtg_minutes\.pdf$/i.test(n)
    );
  });
  return minutes.sort().slice(0, limit);
}

function dateFromFilename(filename) {
  const base = path.basename(filename, ".pdf");
  const m1 = base.match(/(\d{1,2})\.(\d{1,2})\.(\d{2})/);
  if (m1) {
    const [, month, day, yy] = m1;
    const year = parseInt(yy, 10) < 50 ? 2000 + parseInt(yy, 10) : 1900 + parseInt(yy, 10);
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const m2 = base.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m2) {
    const [, month, day, year] = m2;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return "unknown";
}

function analysisToVoteRecords(analysis, docMeta) {
  const votes = analysis.votes ?? [];
  return votes.map((v, i) => {
    const ayes = Array.isArray(v.ayes) ? v.ayes : [];
    const nays = Array.isArray(v.nays) ? v.nays : [];
    const absent = Array.isArray(v.absent) ? v.absent : [];
    const memberVotes = BOARD_OF_TRUSTEES_MEMBERS.map((memberName) => {
      const match = (arr) =>
        arr.some(
          (name) =>
            name.toLowerCase().includes(memberName.toLowerCase()) ||
            memberName.toLowerCase().includes(name.toLowerCase())
        );
      if (match(ayes)) return { memberName, status: "Aye" };
      if (match(nays)) return { memberName, status: "No" };
      if (match(absent)) return { memberName, status: "Absent" };
      return { memberName, status: "Not Found" };
    });
    return {
      id: `local-${docMeta.id}-${i}`,
      motion: typeof v.motion === "string" ? v.motion : "",
      description: analysis.summary || "",
      category: "Board of Trustees",
      date: docMeta.date,
      proposer: typeof v.proposer === "string" ? v.proposer : "",
      seconder: typeof v.seconder === "string" ? v.seconder : "",
      votes: memberVotes,
      result: v.result === "Failed" ? "Failed" : "Passed",
      url: docMeta.url,
    };
  });
}

async function extractPdfText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const text = await pdf(buffer);
  return typeof text === "string" ? text : "";
}

async function analyzeWithAnthropic(pdfText, title, date) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set in .env.local");

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Below is the full text of a Board of Trustees meeting minutes document from the Village of Ballston Spa.

Title: ${title}
Date (from filename): ${date}

Extract: meeting date, a brief summary of major decisions, and for each motion: motion text, proposer, seconder, ayes (array of trustee names), nays (array of names), absent (array of names), and result (Passed or Failed). Return only valid JSON matching the required schema.

--- DOCUMENT TEXT ---
${pdfText.slice(0, 180000)}
--- END ---`,
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: VOTING_JSON_SCHEMA },
    },
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b) => b.type === "text");
  const text = textBlock?.text ?? "";
  return JSON.parse(text.trim());
}

async function main() {
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 && process.argv[limitIdx + 1]
    ? parseInt(process.argv[limitIdx + 1], 10)
    : 3;

  if (!fs.existsSync(DOCS_DIR)) {
    console.error("Documents directory not found:", DOCS_DIR);
    process.exit(1);
  }

  const files = getMinutePdfs(limit);
  console.log(`Found ${files.length} minute PDF(s) to scan (limit=${limit}):`, files);

  const allVotes = [];

  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    const filePath = path.join(DOCS_DIR, name);
    const date = dateFromFilename(name);
    const id = `local-bot-${i + 1}`;
    console.log(`[${i + 1}/${files.length}] ${name} (${date})`);
    try {
      const pdfText = await extractPdfText(filePath);
      if (!pdfText || pdfText.length < 100) {
        console.warn("  Skipped: too little text extracted");
        continue;
      }
      const analysis = await analyzeWithAnthropic(pdfText, name, date);
      const docMeta = { id, title: name, date, url: `/documents/board_of_trustees_documents/${name}` };
      const records = analysisToVoteRecords(analysis, docMeta);
      allVotes.push(...records);
      console.log(`  -> ${records.length} vote(s)`);
    } catch (e) {
      console.error("  Error:", e.message);
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(allVotes, null, 2), "utf8");
  console.log(`\nWrote ${allVotes.length} vote record(s) to ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
