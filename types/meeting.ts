export interface MeetingVote {
  section: string;
  motion_number?: number;
  motion_description: string;
  mover?: string;
  seconder?: string;
  vote_result: string;
  vote_breakdown?: Record<string, string>;
  discussion?: { speaker: string; statement: string }[];
  notes?: string | null;
  /** Addendum note (e.g. amended resolution) shown in Context column */
  addendum?: string | null;
  /** Optional context for this resolution, shown in Context column */
  context?: string | null;
}

export interface PublicComment {
  speaker: { name: string; address?: string | null };
  comment_text: string;
  comment_type?: string;
  summary?: string;
  /** Agenda items / motions this comment is in response to (e.g. ["7h", "7d"]) */
  referenced_items?: string[];
}

export interface MeetingMetadata {
  date: string;
  meeting_type?: string;
  location?: string;
  attendees?: unknown;
}

export interface MeetingMinutes {
  filename: string;
  meeting_metadata: MeetingMetadata;
  meeting_summary?: string;
  votes?: MeetingVote[];
  public_comments?: PublicComment[];
}

/**
 * Canonical display date for a meeting. Uses the first "date" attribute from the JSON file (meeting_metadata.date).
 * Falls back to parsing the filename only when the JSON does not provide a valid date.
 * Returns ISO date string (YYYY-MM-DD) for consistent display and sorting.
 */
export function getMeetingDisplayDate(meeting: MeetingMinutes): string {
  const fromJson = meeting.meeting_metadata?.date?.trim();
  if (fromJson) {
    const normalized = normalizeToIsoDate(fromJson);
    if (normalized) return normalized;
  }
  const fromFilename = parseDateFromFilename(meeting.filename || '');
  if (fromFilename) return fromFilename;
  return fromJson || '';
}

/** Parse a date string from the file (e.g. "2026-01-26", "January 26, 2026") into YYYY-MM-DD, or return empty if invalid. */
function normalizeToIsoDate(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse meeting date from filename when file content does not provide one. */
function parseDateFromFilename(name: string): string {
  if (!name) return '';
  const datePattern = /(\d{1,2})[._](\d{1,2})[._](\d{2})(?=_?minutes?\.(?:pdf|json)|\.(?:pdf|json)$)/gi;
  let match: RegExpExecArray | null = null;
  let lastMatch: RegExpExecArray | null = null;
  while ((match = datePattern.exec(name)) !== null) lastMatch = match;
  if (lastMatch) {
    const [, month, day, yy] = lastMatch;
    const m = parseInt(month!, 10);
    const d = parseInt(day!, 10);
    const y = parseInt(yy!, 10);
    const year = y >= 0 && y <= 99 ? 2000 + y : y;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const fallback = name.match(/(\d{1,2})[._](\d{1,2})[._](\d{2})(?:\D|$)/);
  if (fallback) {
    const [, month, day, yy] = fallback;
    const m = parseInt(month!, 10);
    const d = parseInt(day!, 10);
    const y = parseInt(yy!, 10);
    const year = y >= 0 && y <= 99 ? 2000 + y : y;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  return '';
}
