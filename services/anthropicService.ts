import { VillageDocument, BoardAnalysis } from "../types";
import type { MeetingMinutes } from "../types/meeting";

const API_BASE = "/api/anthropic/v1";

const DYSLEXIA_FRIENDLY_INSTRUCTIONS = `
Format your answer in a dyslexia-friendly way:
- Use short sentences (one idea per sentence when possible).
- Use short paragraphs (2–3 sentences max).
- Use bullet points for lists.
- Use clear headings for sections (e.g. "Date range", "Summary", "What we found").
- Put the main number or result near the top.
- Avoid long blocks of text; break things into small chunks.
- Bold important text by wrapping it in double asterisks: **like this**. Bold key numbers, names, dates, and the main conclusion so they stand out.
`;

/** Build a compact text summary of meeting minutes for AI context (dates + vote breakdowns). */
function buildMeetingContext(meetings: MeetingMinutes[]): string {
  if (!meetings.length) return "";
  const lines: string[] = [];
  for (const m of meetings) {
    const date = m.meeting_metadata?.date ?? "unknown";
    const type = m.meeting_metadata?.meeting_type ?? "";
    lines.push(`\n## Meeting: ${date}${type ? ` (${type})` : ""}`);
    if (m.meeting_summary) lines.push(`Summary: ${m.meeting_summary}`);
    if (m.votes?.length) {
      for (const v of m.votes) {
        const motion = v.motion_description ?? "";
        const breakdown = v.vote_breakdown
          ? Object.entries(v.vote_breakdown)
              .map(([name, vote]) => `${name}: ${vote}`)
              .join(", ")
          : "";
        lines.push(`  Motion: ${motion}`);
        if (breakdown) lines.push(`  Votes: ${breakdown}`);
        if (v.vote_result) lines.push(`  Result: ${v.vote_result}`);
      }
    }
  }
  return lines.join("\n");
}

async function createMessage(body: {
  model: string;
  max_tokens: number;
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  output_config?: { format: { type: "json_schema"; schema: object } };
}) {
  const res = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Anthropic API error ${res.status}`);
  }
  const data = await res.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  return textBlock?.text ?? "";
}

export const askDocumentQuestion = async (
  question: string,
  contextDocuments: VillageDocument[]
) => {
  const contextText = contextDocuments
    .map((d) => `- ${d.title} (${d.url})`)
    .join("\n");

  const text = await createMessage({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system:
      "You are an AI assistant for the Village of Ballston Spa. Answer questions about village documents accurately and concisely. If you cannot find specific details in the context, say so.",
    messages: [
      {
        role: "user",
        content: `Available Document Context:\n${contextText}\n\nQuestion: ${question}`,
      },
    ],
  });

  return {
    text: text || "I couldn't find an answer to that.",
    sources: [] as { title: string; url: string }[],
  };
};

export interface ChatContext {
  documents?: VillageDocument[];
  meetings?: MeetingMinutes[];
}

/**
 * Ask a question with optional document list and full meeting minutes (vote data).
 * Use this for the chatbot when meetings are loaded so it can answer questions
 * like "How many times did X vote against Y?" with date range and context.
 * Answers are formatted in a dyslexia-friendly way.
 */
export const askChatQuestion = async (
  question: string,
  context: ChatContext
): Promise<{ text: string; sources: { title: string; url: string }[] }> => {
  const parts: string[] = [];
  const sources: { title: string; url: string }[] = [];

  if (context.documents?.length) {
    const docList = context.documents
      .map((d) => `- ${d.title} (${d.url})`)
      .join("\n");
    parts.push("Available documents (metadata only):\n" + docList);
  }

  if (context.meetings?.length) {
    const meetingContext = buildMeetingContext(context.meetings);
    const dateRange =
      context.meetings.length === 1
        ? context.meetings[0].meeting_metadata?.date ?? "unknown"
        : [
            context.meetings[0].meeting_metadata?.date,
            context.meetings[context.meetings.length - 1].meeting_metadata?.date,
          ].join(" to ");
    parts.push(
      `\nBoard of Trustees meeting vote data (${context.meetings.length} meetings, from ${dateRange}):\n` +
        meetingContext
    );
  }

  const contextBlock = parts.length
    ? "Context:\n" + parts.join("\n")
    : "No document or meeting context provided.";

  const systemPrompt =
    "You are an AI assistant for the Village of Ballston Spa. " +
    "Answer questions using only the context below (documents list and/or meeting vote data). " +
    "For meeting questions: state the date range of the data, give counts when asked (e.g. how many times X voted against Y), and briefly say what each vote was about. " +
    "Match people by name even if the context uses different forms (e.g. 'Mary Price Bush', 'Trustee Price-Bush', 'Price-Bush' are the same person; 'Mayor Rossi' and 'Rossi' the same). " +
    "If you cannot find the answer in the context, say so clearly. " +
    DYSLEXIA_FRIENDLY_INSTRUCTIONS;

  const text = await createMessage({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `${contextBlock}\n\nQuestion: ${question}`,
      },
    ],
  });

  return {
    text: text || "I couldn't find an answer to that.",
    sources,
  };
};

const VOTING_JSON_SCHEMA = {
  type: "object" as const,
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

export const analyzeVotingRecord = async (
  doc: VillageDocument
): Promise<BoardAnalysis> => {
  const text = await createMessage({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Analyze the following document from Ballston Spa and extract a structured voting record from the meeting minutes.

Document link: ${doc.url}
Title: ${doc.title}
Date: ${doc.date}

Extract: meeting date, a brief summary of major decisions, and for each motion: motion text, proposer, seconder, ayes (array of names), nays (array of names), absent (array of names), and result (Passed or Failed). Return only valid JSON matching the required schema.`,
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: VOTING_JSON_SCHEMA },
    },
  });

  try {
    const parsed = JSON.parse(text.trim());
    return parsed as BoardAnalysis;
  } catch {
    throw new Error("Failed to parse voting record analysis");
  }
};
