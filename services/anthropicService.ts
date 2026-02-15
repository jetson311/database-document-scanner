import { VillageDocument, BoardAnalysis } from "../types";

const API_BASE = "/api/anthropic/v1";

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
