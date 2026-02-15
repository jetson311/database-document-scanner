/**
 * Reads py/bspa-event-pdfs-2025-2026.csv and writes public/documents.json
 * for the app to load. Run: node scripts/csv-to-documents.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CSV_PATH = path.join(__dirname, '../py/bspa-event-pdfs-2025-2026.csv');
const OUT_PATH = path.join(__dirname, '../public/documents.json');

// Map event name substrings to app category (DocCategory enum values)
// Order matters: more specific matches (e.g. Library Board) before broad ones (Board of Trustees)
function inferCategory(event) {
  const e = (event || '').toLowerCase();
  if (e.includes('library board')) return 'Library Board';
  if (e.includes('board of trustees') || e.includes('trustees meeting') || e.includes('organizational meeting') || e.includes('special board of trustees') || e.includes('special trustees meeting') || e.includes('special meeting') || e.includes('workshop on the tentative budget')) return 'Board of Trustees';
  if (e.includes('planning board')) return 'Planning Board';
  if (e.includes('zoning board') || e.includes('zba') || e.includes('zba continuation') || e.includes('location change')) return 'Zoning Board';
  if (e.includes('historic district') || e.includes('hdc meeting') || e.includes('hdc ')) return 'Historic District Commission';
  if (e.includes('boa steering') || e.includes('boa committee') || e.includes('boa meeting') || e.includes('revitalize ballston spa') || e.includes('reviatalize ballston spa')) return 'BOA Steering Committee';
  if (e.includes('committee on the arts') || e.includes('arts committee') || e.includes('poetry open mic') || e.includes('poetry performance') || e.includes('poetry writing')) return 'Committee on the Arts';
  if (e.includes('park and tree')) return 'Park and Tree';
  if (e.includes('ethics board') || e.includes('board of ethics')) return 'Ethics Board';
  if (e.includes('rezoning public forum')) return 'ReZoning Public Forum';
  if (e.includes('joint zoning board and planning board')) return 'Special Projects';
  return 'Special Projects';
}

// Infer doc type from PDF filename
function inferType(pdfUrl) {
  const name = (pdfUrl || '').split('/').pop().toLowerCase();
  if (name.includes('agenda')) return 'Agenda';
  if (name.includes('minutes') || name.includes('mtg.') || name.includes('_mtg')) return 'Minutes';
  if (name.includes('abstract') || name.includes('attachments') || name.includes('att')) return 'Project Document';
  return 'Project Document';
}

// "February 11, 2026 - 7:00pm" -> "2026-02-11"
function parseDate(dateStr) {
  if (!dateStr) return '';
  const part = dateStr.replace(/^"|"$/g, '').split(' - ')[0].trim();
  const d = new Date(part);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

// Simple CSV parse (handles quoted date with comma, e.g. "February 11, 2026 - 7:00pm")
function parseCsvLine(line) {
  const urls = line.match(/https:\/\/[^\s,]+/g);
  if (!urls || urls.length < 2) return null;
  const pdfUrl = urls[urls.length - 1].trim();
  const pageUrl = urls[urls.length - 2].trim();
  const beforeUrls = line.substring(0, line.indexOf(pageUrl)).trim();
  const dateMatch = beforeUrls.match(/"([^"]+)"/);
  const date = dateMatch ? dateMatch[1].trim() : '';
  const event = dateMatch ? beforeUrls.substring(0, dateMatch.index).replace(/,\s*$/, '').trim() : beforeUrls;
  return { event, date, page_url: pageUrl, pdf_url: pdfUrl };
}

// Stable id from url
function toId(url, index) {
  try {
    const u = new URL(url);
    const base = (u.pathname || '').replace(/\//g, '_').slice(-80);
    return `doc-${index}-${base}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  } catch {
    return `doc-${index}`;
  }
}

function main() {
  const csv = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = csv.split('\n').filter((l) => l.trim());
  const header = lines[0];
  if (!header.toLowerCase().includes('event') || !header.includes('pdf_url')) {
    console.error('Expected CSV with headers: event, date, page_url, pdf_url');
    process.exit(1);
  }

  const documents = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    if (!row || !row.pdf_url) continue;
    const category = inferCategory(row.event);
    const type = inferType(row.pdf_url);
    const date = parseDate(row.date);
    const filename = row.pdf_url.split('/').pop() || 'document';
    documents.push({
      id: toId(row.pdf_url, i),
      title: filename,
      event: row.event,
      url: row.pdf_url,
      date: date || '2025-01-01',
      category,
      type,
      pageUrl: row.page_url,
    });
  }

  const publicDir = path.join(__dirname, '../public');
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(documents, null, 2), 'utf8');
  console.log(`Wrote ${documents.length} documents to ${OUT_PATH}`);
}

main();
