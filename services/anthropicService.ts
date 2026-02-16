import { VillageDocument, BoardAnalysis } from "../types";
import type { MeetingMinutes } from "../types/meeting";

const API_BASE = "/api/anthropic/v1";

const DYSLEXIA_FRIENDLY_INSTRUCTIONS = `
Format your answer in a dyslexia-friendly way:
- Be concise. Keep answers short without sacrificing structure or important detail. Do not repeat the same point in different words.
- Use short sentences (one idea per sentence when possible). Use short paragraphs (2–3 sentences max).
- Use bullet points for lists; prefer fewer, tighter bullets over long sub-lists.
- Use clear headings for sections (e.g. "Date range", "What we found"). One heading level is enough; avoid deep nesting. If you end with a short summary or key takeaways (bullets or a wrap-up), put a "Summary:" heading right before that so it does not run into the previous section.
- Put the main number or result near the top.
- Avoid long blocks of text and filler (e.g. "This appears to be...", "It is worth noting..."). Say each thing once. Preserve correct grammar.
- Bold important text by wrapping it in double asterisks: **like this**. Bold key numbers, names, dates, and the main conclusion so they stand out.
`;

/** Build a compact text summary of meeting minutes for AI context (votes + public comment themes for pattern detection). */
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
        const sectionLabel = v.section ? `${v.section}` : "";
        const motion = v.motion_description ?? "";
        const breakdown = v.vote_breakdown
          ? Object.entries(v.vote_breakdown)
              .map(([name, vote]) => `${name}: ${vote}`)
              .join(", ")
          : "";
        if (sectionLabel) lines.push(`  ${sectionLabel}`);
        lines.push(`  Motion: ${motion}`);
        if (breakdown) lines.push(`  Votes: ${breakdown}`);
        if (v.vote_result) lines.push(`  Result: ${v.vote_result}`);
      }
    }
    const comments = m.public_comments ?? [];
    if (comments.length > 0) {
      lines.push("  Public comments (themes):");
      for (const c of comments) {
        const who = c.speaker?.name ?? "Speaker";
        const theme = (c.summary ?? c.comment_text ?? "").trim().slice(0, 200);
        if (theme) lines.push(`    - ${who}: ${theme}`);
      }
    }
    const mayorAnn = (m as { mayor_announcements?: { speaker?: string; topic?: string; announcement?: string }[] }).mayor_announcements ?? [];
    if (mayorAnn.length > 0) {
      lines.push("  Mayor/board announcements:");
      for (const a of mayorAnn) {
        const topic = a.topic ?? "";
        const text = (a.announcement ?? "").trim().slice(0, 150);
        if (a.speaker || text) lines.push(`    - ${a.speaker ?? "Mayor"}${topic ? ` (${topic})` : ""}: ${text}`);
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

/** Assessment frameworks (from md/chatbot-logic). Keys match API response. */
const LOGIC_MD_PATHS = [
  { key: "zoning" as const, path: "/md/chatbot-logic/zoning-logic.md", label: "Zoning" },
  { key: "seqra" as const, path: "/md/chatbot-logic/seqra-logic.md", label: "SEQRA" },
  { key: "comprehensivePlan" as const, path: "/md/chatbot-logic/comprehensive-plan-ballston-spa.md", label: "Comprehensive Plan" },
];

/**
 * Key topics from the Ballston Spa Comprehensive Plan (framework + priority issues).
 * Any question relating to these should trigger COMP PLAN logic and fuller review.
 */
const COMP_PLAN_TOPICS =
  "Historic: historic district, historic preservation, historic character, historic buildings, historic resources, architectural compatibility, design guidelines, demolition, village identity, village scale. " +
  "Community: community character, neighborhood character, density, visual dominance, infill. " +
  "Downtown: downtown, central business district, CBD, walkable downtown, form-based code, home occupation. " +
  "Walkability & infrastructure: walkability, sidewalks, pedestrian safety, streetscape, sidewalk connectivity, trails, greenway, bicycle, bike, infrastructure, stormwater. " +
  "Place & open space: parks, open space, recreation, gateway, gateways. " +
  "Housing & growth: affordable housing, accessory dwelling, housing stock, smart growth, sustainability, compatible growth. " +
  "Economy & quality of life: downtown vitality, quality of life, economic growth, small business.";

/** Regex to detect if the question relates to comp plan topics (for fallback when model omits comprehensivePlan). */
function isCompPlanRelatedQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (
    /historic\s*(district|preservation|character|building|resource)?|preservation|architectural|village\s*(scale|identity)|design\s*guideline/i.test(q) ||
    /community\s*character|neighborhood\s*character|density|infill/i.test(q) ||
    /downtown|central\s*business|walkable\s*downtown|form-based|home\s*occupation/i.test(q) ||
    /sidewalk|walkability|pedestrian|streetscape|walkable|trails?|greenway|bicycle|bike\s|infrastructure|stormwater/i.test(q) ||
    /parks?|open\s*space|recreation|gateway/i.test(q) ||
    /affordable\s*housing|accessory\s*dwelling|housing\s*stock|smart\s*growth|sustainability|compatible\s*growth/i.test(q) ||
    /downtown\s*vitality|quality\s*of\s*life|economic\s*growth|small\s*business/i.test(q)
  );
}

let logicMdCache: Record<string, string> | null = null;

async function fetchLogicMds(): Promise<Record<string, string>> {
  if (logicMdCache) return logicMdCache;
  const entries = await Promise.allSettled(
    LOGIC_MD_PATHS.map(async ({ key, path }) => {
      const res = await fetch(path);
      const text = res.ok ? await res.text() : "";
      return [key, text] as const;
    })
  );
  const out: Record<string, string> = {};
  entries.forEach((r) => {
    if (r.status === "fulfilled" && r.value[1]) out[r.value[0]] = r.value[1];
  });
  logicMdCache = out;
  return out;
}

/** Schema for chat response: general answer + optional insights (trends) + framework assessments. */
const CHAT_RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    general: { type: "string", description: "Answer using only the provided context. Be concise: short sentences, no repeated points, minimal filler. Keep structure (headings, bullets) and key detail; preserve grammar. Use a 'Summary:' heading before any final summary or key takeaways so that section is clearly separated. For broad questions, give a concise overview and point to 'insights' when present." },
    insights: {
      type: "array",
      items: { type: "string" },
      description: "High-level list of related repeating patterns, themes, or trends found in the data that relate to the question (e.g. 'Residents have been critical of the mayor in public comment', 'Mayor made announcements about taking time off', 'Board responses from the mayor on several topics'). Scan the context for recurring themes, sentiment, or patterns. Include 2–6 short insight bullets so the user can dig deeper. Omit or empty array if none identified or question is very narrow.",
    },
    zoning: { type: "string", description: "Assessment using the Zoning Logic Framework; omit or empty if the question does not strongly relate to zoning." },
    seqra: { type: "string", description: "Assessment using the SEQRA Logic Framework; omit or empty if the question does not strongly relate to environmental review." },
    comprehensivePlan: { type: "string", description: "MUST be provided when the question touches any Comprehensive Plan theme. Plan themes include: historic district, historic preservation, historic character/buildings; community or neighborhood character; village scale/identity; downtown, CBD, walkable downtown; walkability, sidewalks, pedestrian safety, streetscape, trails, infrastructure, stormwater; parks, open space, recreation, gateways; affordable housing, accessory dwelling, smart growth, sustainability; downtown vitality, quality of life. (1) State how the topic is prioritized in the plan. (2) Compare to the context (e.g. little or substantial discussion vs plan emphasis). (3) One or two sentences of reasoning. Omit only if the question has no connection to these themes." },
  },
  required: ["general"],
  additionalProperties: false,
};

export interface ChatAssessments {
  general: string;
  /** High-level patterns/trends so the user can choose to dig deeper. */
  insights?: string[];
  zoning?: string;
  seqra?: string;
  comprehensivePlan?: string;
}

export type ChatResponseView = "general" | "zoning" | "seqra" | "comprehensivePlan";

/**
 * Ask a question with optional document list and full meeting minutes (vote data).
 * Also assesses the question against Zoning, SEQRA, and Comprehensive Plan logic (from md/chatbot-logic).
 * When the model finds strong relevance to a framework, returns assessments so the UI can show pill tabs.
 */
export const askChatQuestion = async (
  question: string,
  context: ChatContext
): Promise<{
  text: string;
  sources: { title: string; url: string }[];
  assessments?: ChatAssessments;
}> => {
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

  const logicMds = await fetchLogicMds();
  const hasFrameworks = Object.keys(logicMds).length > 0;

  if (hasFrameworks) {
    const frameworkBlock = LOGIC_MD_PATHS.filter((p) => logicMds[p.key])
      .map((p) => `\n---\n## ${p.label} Logic Framework\n${logicMds[p.key]}`)
      .join("\n");

    const systemPrompt =
      "You are an AI assistant for the Village of Ballston Spa. " +
      "You will receive: (1) context (documents list and/or meeting vote data), and (2) assessment frameworks (Zoning, SEQRA, Comprehensive Plan). " +
      "Always answer the user's question using the context in the 'general' field. " +
      "Important: Look for related repeating patterns and trends. For every question (especially broad ones like 'tell me about X' or 'what about [person/topic]'), scan the context for recurring themes, sentiment, or patterns that relate to the question (e.g. resident criticism, repeated board responses, recurring announcements, vote patterns). List 2–6 high-level insights in the 'insights' array so the user can dig deeper. Each insight should be one short phrase or sentence. Omit insights only for very narrow factual questions (e.g. a single vote count). " +
      "Comprehensive Plan key topics (if the question touches any of these, you MUST fill comprehensivePlan): " +
      COMP_PLAN_TOPICS +
      " For Comprehensive Plan: (1) State how the topic is prioritized in the plan (use the framework). (2) Compare to the meeting/context data—e.g. little or substantial discussion vs plan emphasis. (3) Keep to 2–4 sentences. Omit only if the question has no connection to these themes. " +
      "For Zoning and SEQRA: provide a short assessment only when the question strongly relates to that framework. " +
      "For meeting questions: state the date range, give counts when asked, and briefly say what each vote was about. " +
      "Vote sections may be labeled (e.g. '8h', '8i'). Match people by name flexibly (e.g. Trustee Price-Bush, Mayor Rossi). " +
      "If you cannot find the answer in the context, say so in 'general'. " +
      DYSLEXIA_FRIENDLY_INSTRUCTIONS;

    const userContent =
      contextBlock +
      (frameworkBlock ? "\n\nAssessment frameworks (Zoning and SEQRA: use when the question strongly relates; Comprehensive Plan: use whenever the question touches any of these plan themes—historic district/preservation/character, community character, village scale, downtown, walkability/sidewalks, parks/open space, housing, smart growth, quality of life):" + frameworkBlock : "") +
      `\n\nQuestion: ${question}`;

    try {
      const raw = await createMessage({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
        output_config: {
          format: { type: "json_schema", schema: CHAT_RESPONSE_SCHEMA },
        },
      });
      const parsed = JSON.parse(raw?.trim() || "{}") as ChatAssessments;
      const general = (parsed.general ?? "").trim() || "I couldn't find an answer to that.";
      if (isCompPlanRelatedQuestion(question) && !(parsed.comprehensivePlan ?? "").trim()) {
        parsed.comprehensivePlan =
          "This topic is addressed in the Ballston Spa Comprehensive Plan (see framework: historic preservation, community character, walkability, downtown vitality, and related goals). Compare the meeting data to plan priorities; see the full plan (link below) for details.";
      }
      const hasExtra =
        [parsed.zoning, parsed.seqra, parsed.comprehensivePlan].some(
          (s) => typeof s === "string" && s.trim().length > 0
        );
      const hasInsights = Array.isArray(parsed.insights) && parsed.insights.length > 0;
      return {
        text: general,
        sources,
        assessments: hasExtra || hasInsights ? { general, ...parsed } : undefined,
      };
    } catch {
      /* fall through to plain-text path */
    }
  }

  const systemPromptPlain =
    "You are an AI assistant for the Village of Ballston Spa. " +
    "Answer questions using only the context below (documents list and/or meeting vote data). " +
    "For meeting questions: state the date range of the data, give counts when asked (e.g. how many times X voted against Y), and briefly say what each vote was about. " +
    "Each vote in the meeting data may be labeled by section (e.g. '8h', '8i', 'e'). When the user asks about 'item 8h', '8h', or similar, find the vote block labeled '8h' and use its Motion, Votes, and Result. " +
    "Match people by name even if the context uses different forms (e.g. 'Mary Price Bush', 'Trustee Price-Bush', 'Price-Bush' are the same person; 'Mayor Rossi' and 'Rossi' the same). " +
    "If you cannot find the answer in the context, say so clearly. " +
    DYSLEXIA_FRIENDLY_INSTRUCTIONS;

  const text = await createMessage({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPromptPlain,
    messages: [
      {
        role: "user",
        content: `${contextBlock}\n\nQuestion: ${question}`,
      },
    ],
  });

  const generalText = text || "I couldn't find an answer to that.";
  if (isCompPlanRelatedQuestion(question)) {
    const compPlanFallback =
      "This topic is addressed in the Ballston Spa Comprehensive Plan (historic preservation, community character, walkability, downtown vitality, and related goals). Compare the meeting data to plan priorities; see the full plan (link below) for details.";
    return {
      text: generalText,
      sources,
      assessments: { general: generalText, comprehensivePlan: compPlanFallback },
    };
  }
  return {
    text: generalText,
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
