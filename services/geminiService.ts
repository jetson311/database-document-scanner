
import { GoogleGenAI, Type } from "@google/genai";
import { VillageDocument, BoardAnalysis } from "../types";

export const askDocumentQuestion = async (question: string, contextDocuments: VillageDocument[]) => {
  // Always create a new GoogleGenAI instance right before making an API call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const contextText = contextDocuments.map(d => `- ${d.title} (${d.url})`).join('\n');
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `
      You are an AI assistant for the Village of Ballston Spa. 
      The user is asking a question about village documents.
      
      Available Document Context:
      ${contextText}
      
      Question: ${question}
      
      Use your knowledge of Ballston Spa's public records or search capabilities to provide an accurate, helpful response. 
      If you need to find specific details not in the context, use Google Search grounding.
    `,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });

  // Extract text output from response.text property (not a method)
  const text = response.text || "I couldn't find an answer to that.";

  // Extract grounding chunks for source links
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks as any[] | undefined;
  
  return {
    text: text,
    sources: groundingChunks?.map((chunk: any) => ({
      title: chunk.web?.title || 'Source',
      url: chunk.web?.uri || '#'
    })) || []
  };
};

export const analyzeVotingRecord = async (doc: VillageDocument): Promise<BoardAnalysis> => {
  // Always create a new GoogleGenAI instance right before making an API call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `
      Analyze the following document link from Ballston Spa: ${doc.url}
      Title: ${doc.title}
      Date: ${doc.date}
      
      Extract a structured voting record from these meeting minutes. 
      Look for motions made, who moved/seconded, the ayes, nays, and result.
      Include a brief summary of the major decisions.
    `,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          meetingDate: { type: Type.STRING },
          summary: { type: Type.STRING },
          votes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                motion: { type: Type.STRING },
                proposer: { type: Type.STRING },
                seconder: { type: Type.STRING },
                ayes: { type: Type.ARRAY, items: { type: Type.STRING } },
                nays: { type: Type.ARRAY, items: { type: Type.STRING } },
                absent: { type: Type.ARRAY, items: { type: Type.STRING } },
                result: { type: Type.STRING, enum: ['Passed', 'Failed'] }
              },
              required: ['motion', 'ayes', 'nays', 'result']
            }
          }
        },
        required: ['meetingDate', 'summary', 'votes']
      }
    }
  });

  try {
    // Extract text from property and trim
    const jsonStr = response.text?.trim() || '{}';
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error("Failed to parse voting record analysis");
  }
};
