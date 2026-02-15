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
