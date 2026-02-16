# Current Chatbot Logic

This document describes how the in-app chatbot works: data flow, context building, API usage, and UI behavior.

---

## Overview

The chatbot is a modal panel that answers questions about **village documents** (metadata only) and **Board of Trustees meeting minutes** (vote data). It uses Claude via the app’s Anthropic API proxy. Answers are formatted in a dyslexia-friendly way and can include source links.

---

## Components and Data Flow

### 1. App.tsx

- **State**
  - `documents`: list of village documents (from CSV/JSON).
  - `meetingList`: list of meeting minutes (from manifest + JSON files).
  - `externalAiMessage`: optional string that, when set, triggers the chatbot with that question (e.g. from an “Ask AI” box).
  - `isChatExpanded`: whether the chat modal is open.
  - `aiQuery`: text in the “Ask AI” input (when used).

- **Chat integration**
  - Chat is rendered inside a modal. When the user submits from the “Ask AI” input, `handleAiAsk` sets `externalAiMessage` to the query and opens the chat.
  - `ChatPanel` receives:
    - `documents` — full document list.
    - `meetingMinutes={meetingList}` — all loaded meetings.
    - `externalTriggerMessage={externalAiMessage}` — question to send as soon as the panel is ready.
    - `onMessageProcessed={() => setExternalAiMessage(null)}` — called after the triggered message is sent so the trigger is consumed once.

### 2. ChatPanel.tsx

- **Props**
  - `documents: VillageDocument[]`
  - `meetingMinutes?: MeetingMinutes[]` (default `[]`)
  - `externalTriggerMessage?: string | null` — when present, that string is sent as a user message and the callback is run.
  - `onMessageProcessed?: () => void`

- **State**
  - `messages`: array of `{ role: 'user' | 'assistant', content: string, sources?: { title, url }[] }`. Initialized with one assistant message (greeting + capabilities).
  - `input`: current textarea value.
  - `isLoading`: true while a request is in flight.

- **Behavior**
  - **Send (user)**  
    User types and clicks Send or presses Enter (no Shift). `handleSend()` appends the input as a user message, clears the input, and calls `processMessage(input)`.
  - **External trigger**  
    `useEffect` watches `externalTriggerMessage`. When it is set, the panel calls `processMessage(externalTriggerMessage)` and then `onMessageProcessed()`. The parent clears `externalAiMessage` so the same trigger is not sent again.
  - **processMessage(msg)**  
    - If message is empty or `isLoading`, return.  
    - Append `{ role: 'user', content: msg }`.  
    - Set `isLoading = true`.  
    - Call `askChatQuestion(msg, { documents, meetings: meetingMinutes })`.  
    - On success: append assistant message with `result.text` (or fallback “No specific records…”) and optional `result.sources`.  
    - On error: append assistant message “CONNECTION ERROR: Document Intelligence Engine offline.”  
    - Set `isLoading = false`.  

- **UI**
  - Messages list; only section headers (##) and meeting dates are bolded (`renderContentWithDatesBold` + `.chat-content-h2`).
  - If the assistant message has `sources`, they are shown as “SOURCES” with links (title + url).
  - While loading, a “WORKING” indicator with dots is shown.
  - Footer: “POWERED BY CLAUDE”.

---

## Backend: anthropicService.ts

### askChatQuestion(question, context)

- **Purpose**  
  Answer a single user question using only the provided context (documents list and/or meeting vote data). Used by the chatbot when meetings are loaded.

- **Context**
  - `context.documents`: optional list of `VillageDocument` (title, url, etc.).
  - `context.meetings`: optional list of `MeetingMinutes`.

- **Context block sent to the model**
  1. **Documents**  
     If `context.documents` has items: a line “Available documents (metadata only):” followed by lines like `- ${title} (${url})`. No document body text is sent.
  2. **Meetings**  
     If `context.meetings` has items: a line like “Board of Trustees meeting vote data (N meetings, from &lt;date&gt; to &lt;date&gt;):” plus the output of `buildMeetingContext(meetings)`.
  3. If both are empty, the block is “No document or meeting context provided.”

- **User message to API**  
  `Context:\n` + context block + `\n\nQuestion: ` + the user’s question.

### buildMeetingContext(meetings)

Builds a compact text summary of all meetings for the model:

- For each meeting:
  - Header: `## Meeting: <date> (<meeting_type>)` (e.g. `2026-01-26 (Regular)`).
  - If present: `Summary: <meeting_summary>`.
  - For each vote in `meeting.votes`:
    - Section label (e.g. `8h`).
    - `Motion: <motion_description>`.
    - `Votes: <name>: <vote>, …` from `vote_breakdown`.
    - `Result: <vote_result>`.

No public comments, mayor announcements, or board responses are included in this context—only vote-oriented fields (section, motion_description, vote_breakdown, vote_result, and meeting_summary).

### System prompt (chatbot)

- Role: AI assistant for the Village of Ballston Spa.
- Instructions:
  - Use only the provided context (documents list and/or meeting vote data).
  - For meeting questions: state the date range, give counts when asked (e.g. how many times X voted against Y), and briefly describe what each vote was about.
  - Section labels (e.g. `8h`, `8i`, `e`) are used in the data; when the user asks about “item 8h” or “8h”, use the vote block with that section.
  - Match people by name flexibly (e.g. “Mary Price Bush”, “Trustee Price-Bush”, “Price-Bush”; “Mayor Rossi” and “Rossi”).
  - If the answer is not in the context, say so clearly.
- Plus **dyslexia-friendly formatting** instructions: short sentences and paragraphs, bullets, clear headings, main result near the top, bold key items with `**...**`.

### API call

- **Endpoint**: `POST /api/anthropic/v1/messages`.
- **Model**: `claude-sonnet-4-20250514`.
- **max_tokens**: 2048.
- **Body**: `system` (prompt above), `messages: [{ role: 'user', content: contextBlock + question }]`.
- **Response**: First `content` block of type `text` is used as the assistant reply. No structured schema; response is plain text (with optional markdown-style bold).

### Return value

- `{ text: string, sources: { title: string, url: string }[] }`.
- Currently `sources` is always set to the empty array in `askChatQuestion` (document/meeting links are not yet collected and returned as sources).

---

## Summary Table

| Layer        | Responsibility |
|-------------|----------------|
| **App**     | Owns `documents`, `meetingList`, `externalAiMessage`; passes them into `ChatPanel`; “Ask AI” sets trigger and opens chat. |
| **ChatPanel** | Message list, input, external trigger effect, loading state; calls `askChatQuestion` with documents + meetings; displays reply, optional sources, and when present assessment pill tabs (General / Zoning / SEQRA / COMP PLAN). |
| **anthropicService** | Builds context (document list + `buildMeetingContext(meetings)`), fetches logic MDs from `public/md/chatbot-logic/`, system prompt, single user-message call to Claude with optional JSON schema; returns `{ text, sources, assessments? }`. |

---

## Strategic assessment (framework pills)

When the app has loaded the logic frameworks from `public/md/chatbot-logic/` (zoning, SEQRA, comprehensive plan), each question is also assessed against those frameworks:

1. **Context sent to the model** includes documents, meeting vote data, **public comment themes** (speaker + summary per comment), and **mayor/board announcements** so the model can detect repeating patterns (e.g. resident criticism, recurring topics). It also receives the full text of the three framework MDs.
2. **Structured response** is requested: JSON with `general` (required), optional **`insights`** (array of 2–6 high-level patterns/trends so the user can dig deeper), and optional `zoning`, `seqra`, `comprehensivePlan`. The model is instructed to **look for related repeating patterns** for every question (especially broad ones like "tell me about X") and list them in `insights`. The UI shows "Related patterns found" with those bullets and "Would you like to know more about any of these?" The model is also instructed to **reason holistically**: a question may relate to the Comprehensive Plan even when the user does not say "comprehensive plan" (e.g. sidewalks → walkability, development → character/scale). For **Zoning** and **SEQRA**, the model fills the key only when the question strongly relates. For **Comprehensive Plan**, the model fills it whenever the question touches plan-related themes (walkability, sidewalks, historic character, village scale, downtown, density, development, infrastructure, quality of life) and provides a short "Consider" assessment. So the user may get both a general answer and a COMP PLAN "consider" from comprehensive plan logic.
3. **UI**: When the API returns **insights**, the assistant message shows a **"Related patterns found"** bullet list and the line **"Would you like to know more about any of these?"** so the user can ask a follow-up. If the API returns at least one framework assessment in addition to `general`, the assistant message also shows **pill buttons** at the top (General, Zoning, SEQRA, COMP PLAN — only for keys that have content). Clicking a pill acts as a tab: it shows/hides the corresponding content. General is always included when any framework pill is shown. When the COMP PLAN view is shown, the UI also asks "Would you like more information from the Comprehensive Plan?" and provides a link to the full plan PDF: [Village of Ballston Spa Comprehensive Plan](https://www.ballstonspa.gov/sites/g/files/vyhlif6186/f/pages/village_of_ballston_spa_comprehensive_plan.pdf). The structured comp plan data file is `documents/comprehensive-plan/comprehensive-plan.json` (`comprehensive-plan.json`).
4. **Fallback**: If framework MDs fail to load or the structured call fails, the service falls back to a single plain-text answer (no pills).

---

## Files

- `components/ChatPanel.tsx` — UI and message handling.
- `services/anthropicService.ts` — `askChatQuestion`, `buildMeetingContext`, system prompt, API.
- `App.tsx` — document/meeting loading, chat modal, external trigger wiring.
