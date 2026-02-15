# Meeting Minutes JSON Extraction Guide

## Objective
Extract all data from Board of Trustees meeting minutes PDFs into a comprehensive, structured JSON format that supports API querying and filtering by individual trustees, mayor, topics, and other attributes.

## Output Format
**JSON file with filename matching the source PDF**
- Input: `1_12_26_mtg_minutes.pdf`
- Output: `1_12_26_mtg_minutes.json`

## Core Principles

### 1. Verbatim Accuracy
- All quotes, comments, and statements must be word-for-word from the source
- `comment_text` fields contain exact original text with no paraphrasing
- `summary` fields can interpret/condense, but original text is always preserved

### 2. Trustee/Mayor Attribution
- Every vote includes individual breakdown by trustee name
- Every discussion/statement tagged with speaker name
- Standardize names consistently (e.g., always "Trustee Price-Bush", never just "Price-Bush")

### 3. Structured for Filtering
- Use arrays for related items (topics, dollar_amounts, action_items)
- Include cross-references (agrees_with, opposes, supports)
- Tag everything with related_topics for cross-filtering

## JSON Structure Template

```json
{
  "filename": "SOURCE_PDF_FILENAME.pdf",
  "meeting_metadata": { ... },
  "meeting_summary": "...",
  "topics_discussed": [...],
  "votes": [...],
  "public_comments": [...],
  "mayor_announcements": [...],
  "liaison_reports": [...],
  "other_business": [...],
  "action_items_summary": [...],
  "dollar_amounts_summary": { ... },
  "named_individuals": { ... },
  "locations_referenced": [...],
  "dates_and_deadlines": [...]
}
```

---

## Section 1: Meeting Metadata

### Required Fields
```json
{
  "filename": "exact_filename.pdf",
  "meeting_metadata": {
    "date": "YYYY-MM-DD",
    "meeting_type": "Organizational|Regular|Special",
    "location": "meeting location",
    "start_time": "HH:MM am/pm or null",
    "end_time": "HH:MM am/pm or null",
    "attendees": {
      "mayor": {
        "name": "Mayor [Last Name]",
        "title": "Mayor",
        "present": true|false
      },
      "trustees": [
        {
          "name": "Trustee [Name]",
          "title": "Trustee",
          "present": true|false
        }
      ],
      "others": [
        {
          "name": "[Full Name]",
          "title": "[Title]",
          "present": true|false
        }
      ]
    }
  }
}
```

### Extraction Rules
- **Date**: Extract from document header (e.g., "held January 12, 2026" → "2026-01-12")
- **Meeting type**: Look for "Organizational", "Regular", "Special" in title
- **Attendees**: Extract from "Present:" section
  - Separate mayor, trustees, and other officials
  - Mark all as present: true (since they're listed)
  - Standardize names (include full title in name field)

---

## Section 2: Meeting Summary

### Required Field
```json
"meeting_summary": "2-3 sentence overview of meeting focus, key decisions, and notable discussions"
```

### Guidelines
- Summarize main themes and outcomes
- Mention any split votes or controversial topics
- Note major announcements or action items
- Keep to 2-4 sentences maximum

---

## Section 3: Topics Discussed

### Required Field
```json
"topics_discussed": [
  "topic 1",
  "topic 2",
  "topic 3"
]
```

### Extraction Rules
- Create flat array of all topics mentioned
- Use lowercase, concise phrases
- Include topics from votes, comments, announcements, and reports
- Remove duplicates
- Examples: "zoning code review", "fire department equipment", "staffing needs"

---

## Section 4: Votes

### Vote Object Structure
```json
{
  "section": "7h",
  "motion_number": 14,
  "motion_description": "Brief description of what was voted on",
  "motion_type": "approval|purchase approval|hiring|bid acceptance|event approval|contract approval|personnel action|declaration|procedural|resolution",
  "mover": "Trustee [Name]",
  "seconder": "Trustee [Name]",
  "vote_result": "ALL AYES|Motion Passes|Motion Fails|Not Recorded|TABLED|WITHDRAWN",
  "vote_breakdown": {
    "Mayor [Name]": "YES|NO|ABSTAIN|NOT NEEDED|UNKNOWN",
    "Trustee [Name]": "YES|NO|ABSTAIN|ABSENT|UNKNOWN"
  },
  "discussion": [
    {
      "speaker": "Trustee [Name] or Mayor [Name] or Attorney [Name]",
      "statement": "exact quote or paraphrase of what was said"
    }
  ],
  "dollar_amounts": [1234.56, 7890.12],
  "related_topics": ["topic1", "topic2"],
  "notes": "Additional context, conditions, or important details"
}
```

### Motion Type Classification
- **approval**: Approving minutes, reports, general items
- **purchase approval**: Buying equipment, supplies, services
- **hiring**: Appointing or hiring personnel
- **bid acceptance**: Accepting construction/service bids
- **event approval**: Approving public events
- **contract approval**: Legal agreements, retainers, professional services
- **personnel action**: Resignations, membership changes, removals
- **declaration**: Declaring items surplus, making formal declarations
- **procedural**: Process/timeline changes, hearing schedules
- **resolution**: Formal resolutions on policy matters

### Vote Result Patterns

#### "ALL AYES"
- Unanimous approval
- Set all present trustees/mayor to "YES"

#### Explicit Vote Count
```
Pattern: "Trustee VanDeinse-Perez- No Trustee Price-Bush- Yes..."
```
- Extract each individual vote
- Map to exact trustee name in vote_breakdown

#### "Motion Passes" without explicit votes
- Indicates approval but individual votes not recorded
- Set all to "UNKNOWN" unless explicit votes shown

#### "Not Recorded"
- Motion made and seconded but no vote result stated
- Set all to "UNKNOWN"
- Add note: "Vote result not explicitly stated"

### Discussion Extraction
- Capture any statements made before/during vote
- Include speaker name and exact or close paraphrase
- Look for patterns:
  - "Mayor [Name] notes/mentions/states..."
  - "Trustee [Name] said/asked/responded..."
  - "Attorney [Name] explains..."
- Include in discussion array even if brief

### Dollar Amounts
- Extract all dollar figures mentioned in motion
- Store as numbers (no $ or commas): 1234.56
- Include amounts in description and conditions

### Related Topics
- Tag with 2-5 relevant topic keywords
- Use same vocabulary as topics_discussed array
- Helps with cross-referencing and filtering

### Consent Agenda Handling
```
Pattern: "a) Motion made by X, seconded by Y, approving the following items:
  i) Item 1
  ii) Item 2
  iii) Item 3
ALL AYES"
```

**Create separate vote object for EACH sub-item:**
- Section: "6a-i", "6a-ii", "6a-iii"
- Same mover/seconder for all
- Same vote result for all
- Each gets unique motion_description
- Add note: "Consent agenda item"

---

## Section 5: Public Comments

### Public Comment Object Structure
```json
{
  "section": "5|13|12a",
  "comment_number": 1,
  "comment_period": "Public Comment on Agenda Items Only|Public Comment on Any Issue|90 second public comment on proposed Local Law 1",
  "speaker": {
    "name": "Full Name",
    "address": "123 Street Name|null",
    "affiliation": "organization/role or null"
  },
  "comment_text": "EXACT WORD-FOR-WORD TEXT FROM MINUTES",
  "comment_type": "Question|Concern|Support|Suggestion|Information|Mixed",
  "topics": ["topic1", "topic2"],
  "referenced_items": ["7h", "12a", "abstract pg 13"],
  "agrees_with": ["Speaker Name"] or null,
  "opposes": ["specific thing opposed"] or null,
  "supports": ["specific thing supported"] or null,
  "contains_question": true|false,
  "dollar_amounts": [30695.00],
  "summary": "1-2 sentence high-level summary of comment",
  "board_response": {
    "responder": "Mayor [Name]|Trustee [Name]|Village Administrator|etc",
    "response": "verbatim or close paraphrase of response"
  } or null
}
```

### Comment Period Types
- **"Public Comment on Agenda Items Only"**: Section 5, early in meeting
- **"Public Comment on Any Issue"**: Section 13, later in meeting
- **Specific item comment**: e.g., "90 second public comment on proposed Local Law 1"

### Speaker Information
- **name**: Full name as written
- **address**: 
  - Full address if provided: "45 West High St"
  - Partial address: "89 Hyde"
  - null if not provided
- **affiliation**: Organization, board membership, or role if mentioned

### Comment Text - CRITICAL
- **MUST be word-for-word from source**
- Include ALL punctuation, spelling, grammar as written
- Do NOT paraphrase or correct
- This is the verbatim record

### Comment Type Classification
- **Question**: Contains questions, seeks information/clarification
- **Concern**: Expresses worry, disagreement, criticism
- **Support**: Expresses approval, agreement, endorsement
- **Suggestion**: Proposes alternatives, additions, improvements
- **Information**: Provides updates, facts, announcements
- **Mixed**: Contains multiple types (agreement + question, concern + suggestion, etc.)

### Referenced Items
- Extract agenda item numbers: "7h", "12a", "Section 205-74"
- Include document references: "abstract pg 13", "Feb 11 meeting"
- Use array format even if single item

### Agrees With / Opposes / Supports
- **agrees_with**: Array of speaker names when "ditto" or agreement stated
- **opposes**: Array of specific items/concepts opposed
- **supports**: Array of specific items/concepts supported
- Can have multiple values or be null

### Contains Question
- Set true if comment contains question marks OR
- Question words (who, what, when, where, why, how, can, will, should, could)
- Rhetorical questions count as true

### Board Response
- Include if board member or official responds to comment
- Capture during discussion or in "Board Response to Public Comment" section
- null if no response provided

---

## Section 6: Mayor Announcements

### Announcement Object Structure
```json
{
  "topic": "Brief topic title",
  "speaker": "Mayor [Name]",
  "announcement": "Full text of announcement",
  "related_topics": ["topic1", "topic2"],
  "action_items": ["specific action 1", "specific action 2"],
  "dollar_amounts": [4000000.00],
  "trustee_responses": [
    {
      "trustee": "Trustee [Name]|Mayor [Name]",
      "response": "what they said in response"
    }
  ]
}
```

### Extraction Rules
- Found in "Mayor's Announcements" section
- Create separate object for each distinct topic
- Capture full announcement text
- Extract action items (things to be done)
- Note any trustee responses or discussion
- Include dollar amounts if mentioned

---

## Section 7: Liaison Reports

### Liaison Report Object Structure
```json
{
  "trustee": "Trustee [Name]",
  "committees": ["Committee 1", "Committee 2"],
  "report": "Full text of liaison report",
  "events": [
    {
      "event": "Event name",
      "location": "location or null",
      "date": "Date string or null",
      "time": "time string or null",
      "cost": "free|$X or null"
    }
  ],
  "announcements": [
    {
      "topic": "topic",
      "detail": "details"
    }
  ],
  "dpw_activities": ["activity1", "activity2"] (if DPW report),
  "mayor_additions": "Any additions made by mayor to this report or null",
  "action_items": ["action1", "action2"],
  "related_topics": ["topic1", "topic2"]
}
```

### Extraction Rules
- Found in "Liaison Reports" section
- One object per trustee reporting
- **committees**: List all boards/committees they report on
- **report**: Full verbatim text of their report
- **events**: Parse out specific events with structured data
- **announcements**: Non-event announcements (new officers, trips, etc.)
- **dpw_activities**: For DPW reports, list specific activities mentioned
- **mayor_additions**: If mayor adds comments to trustee's report
- Include action items derived from report

---

## Section 8: Other Business

### Other Business Object Structure
```json
{
  "topic": "Brief topic title",
  "speaker": "Trustee [Name]|Mayor [Name]|other",
  "update": "Details of the update or discussion",
  "action_items": ["action1", "action2"],
  "related_topics": ["topic1", "topic2"]
}
```

### Extraction Rules
- Found in "Other Business" section
- May include board responses to public comments
- Capture miscellaneous updates not fitting other categories

---

## Section 9: Action Items Summary

### Format
```json
"action_items_summary": [
  "Specific action item 1",
  "Specific action item 2",
  "Specific action item 3"
]
```

### Extraction Rules
- Aggregate all action items from:
  - Vote conditions (e.g., "Mayor authorized to execute")
  - Mayor announcements
  - Liaison reports
  - Other business
  - Board responses to public comments
- Use imperative phrases ("Fill Ethics Board vacancies", "Post to website")
- Remove duplicates
- Be specific and actionable

---

## Section 10: Dollar Amounts Summary

### Structure
```json
"dollar_amounts_summary": {
  "total_vouchers_approved": 446035.33,
  "equipment_purchases": 16798.50,
  "personnel_costs": 0,
  "construction_contracts": 339763.00,
  "professional_services": 5000.00,
  "proposed_infrastructure": 4000000.00,
  "items": [
    {
      "amount": 6400.00,
      "description": "Brief description of what this amount relates to"
    }
  ]
}
```

### Extraction Rules
- Aggregate all dollar amounts from entire document
- Create category totals where applicable
- **items** array: Every unique dollar amount with context
- Store as numbers (not strings)
- Include amounts from:
  - Votes (purchases, contracts, bids)
  - Public comments (questioned expenditures)
  - Mayor announcements (proposed projects)
  - Voucher totals

---

## Section 11: Named Individuals

### Structure
```json
"named_individuals": {
  "appointees": [
    {
      "name": "Full Name",
      "position": "Title/Role",
      "status": "Approved|Approved pending [condition]|Denied"
    }
  ],
  "resignations": [
    {
      "name": "Full Name",
      "position": "Title/Role",
      "status": "Resignation approved|Resignation pending"
    }
  ],
  "staff_mentioned": [
    {
      "name": "Full Name or First Name + Title",
      "position": "Title/Role"
    }
  ],
  "vendors_contractors": [
    {
      "name": "Company/Organization Name",
      "service": "What they provide or were hired for"
    }
  ],
  "public_commenters": [
    {
      "name": "Full Name",
      "address": "Address or null"
    }
  ]
}
```

### Extraction Rules
- **appointees**: Anyone hired, appointed, or added to rolls
- **resignations**: Anyone resigning or being removed
- **staff_mentioned**: Village employees, officials referenced (Chief, Supervisor, Clerk, etc.)
- **vendors_contractors**: Companies, organizations providing services/products
- **public_commenters**: Already captured in public_comments but summarize here
- Include status/context for appointees and resignations

---

## Section 12: Locations Referenced

### Structure
```json
"locations_referenced": [
  {
    "name": "Location Name",
    "type": "park|infrastructure|venue|business|government building|meeting location",
    "street": "Street name or null",
    "context": "Why it was mentioned"
  }
]
```

### Extraction Rules
- Extract all specific locations mentioned
- Include type classification
- Add street/address if mentioned
- Provide brief context (1 sentence)
- Exclude generic references (e.g., "the office" without specifics)

---

## Section 13: Dates and Deadlines

### Structure
```json
"dates_and_deadlines": [
  {
    "date": "YYYY-MM-DD|date string",
    "event": "What happens on this date",
    "time": "time string or null",
    "note": "additional context or null",
    "rain_date": "alternate date or null"
  }
]
```

### Extraction Rules
- Extract all future dates mentioned
- Include events, meetings, deadlines
- Parse dates to ISO format when possible (YYYY-MM-DD)
- If date is relative ("tomorrow", "next month"), calculate actual date if meeting date is known
- Include time if mentioned
- Note any conditions (rain dates, tentative, pending, etc.)

---

## Special Handling Cases

### 1. Walk-On Items
- Items added during meeting not on original agenda
- Usually mentioned in Mayor's announcements or public comment
- Extract as regular votes but note: "Walk-on item mentioned in public comment section"

### 2. Tabled/Postponed Items
- vote_result: "TABLED"
- notes: Include reason and postpone-until date if mentioned

### 3. Split Votes
- Capture every trustee's individual vote
- Note which trustees voted against
- Include any discussion/reasoning if mentioned

### 4. Amended Motions
- If motion is amended before vote:
  - Describe final version in motion_description
  - Note amendment in notes field
  - If amendment voted on separately, create separate vote object

### 5. Executive Session
- Note if mentioned but typically no details
- Record time entered/exited if stated
- Any actions coming out of executive session get separate votes

### 6. Ditto/Agreement Comments
- Store full comment text including "Ditto to..."
- Populate agrees_with array with referenced speaker(s)
- Also capture any unique content beyond the agreement

### 7. Mayor Not Voting
- In split votes where mayor's vote not needed for majority
- vote_breakdown: "Mayor [Name]": "NOT NEEDED"
- Explain in notes

### 8. Attorney or Staff Statements
- Include in discussion array even though not trustees
- Tag speaker properly: "Attorney [Name]", "Village Administrator", etc.

---

## Quality Assurance Checklist

### Before Finalizing JSON:

#### Metadata
- [ ] Filename exactly matches PDF filename
- [ ] Date in YYYY-MM-DD format
- [ ] All attendees from "Present:" section included
- [ ] Meeting type identified

#### Votes
- [ ] Every motion has section number
- [ ] Motion numbers sequential (1, 2, 3...)
- [ ] Vote breakdown includes all present trustees/mayor
- [ ] All consent agenda items separated
- [ ] Dollar amounts extracted and stored as numbers
- [ ] Discussion quotes are accurate

#### Public Comments
- [ ] comment_text is WORD-FOR-WORD from source
- [ ] Every speaker has name
- [ ] Addresses included when available
- [ ] Board responses captured
- [ ] Ditto/agreement chains properly linked

#### Cross-References
- [ ] All trustee/mayor names standardized
- [ ] topics_discussed covers all sections
- [ ] action_items_summary aggregated from all sections
- [ ] dollar_amounts_summary includes all financial mentions
- [ ] No duplicate entries

#### Completeness
- [ ] All sections present (even if empty arrays)
- [ ] No [PLACEHOLDER] or TODO markers
- [ ] All required fields populated or explicitly null
- [ ] Related topics tagged throughout

---

## Common Extraction Patterns

### Pattern: Motion with Discussion
```
Text: "Motion made by Trustee X, seconded by Trustee Y to approve [thing]. 
Discussion: Mayor Z notes [something]. Trustee X mentions [something]. 
All Ayes"

JSON:
{
  "mover": "Trustee X",
  "seconder": "Trustee Y",
  "vote_result": "ALL AYES",
  "discussion": [
    {"speaker": "Mayor Z", "statement": "[something]"},
    {"speaker": "Trustee X", "statement": "[something]"}
  ]
}
```

### Pattern: Ditto Comment
```
Text: "John Doe: Ditto to what Jane said and also [additional point]"

JSON:
{
  "speaker": {"name": "John Doe", ...},
  "comment_text": "Ditto to what Jane said and also [additional point]",
  "agrees_with": ["Jane Smith"],
  ...
}
```

### Pattern: Consent Agenda
```
Text: "a) Motion made by Trustee X, seconded by Trustee Y, approving:
  i) Item 1
  ii) Item 2
ALL AYES"

JSON: Create 2 separate vote objects:
{section: "6a-i", motion_description: "Item 1", vote_result: "ALL AYES", ...},
{section: "6a-ii", motion_description: "Item 2", vote_result: "ALL AYES", ...}
```

### Pattern: Board Response to Comment
```
Text in Section 13:
"Liz Kormos: [question about Ethics Board]
Mayor Rossi responded [answer]"

JSON:
{
  "comment_text": "[question about Ethics Board]",
  "board_response": {
    "responder": "Mayor Rossi",
    "response": "[answer]"
  }
}
```

---

## Output File Naming

**Rule: Output filename MUST match input PDF filename exactly (except extension)**

Examples:
- Input: `1_12_26_mtg_minutes.pdf` → Output: `1_12_26_mtg_minutes.json`
- Input: `board_minutes_4.14.25_revised.pdf` → Output: `board_minutes_4.14.25_revised.json`
- Input: `draft_meeting_minutes_for_12.8.25-1.1.26_meetings.pdf` → Output: `draft_meeting_minutes_for_12.8.25-1.1.26_meetings.json`

**Do NOT**:
- Add dates to filename
- Change underscores to hyphens
- Abbreviate or simplify
- Add descriptors like "processed" or "extraction"

The filename is used to track which PDF was processed and maintain 1:1 correspondence.

---

## Edge Cases and Exceptions

### Missing Information
- **No vote recorded**: vote_result: "Not Recorded", all votes: "UNKNOWN"
- **No public comments**: public_comments: [] (empty array)
- **No dollar amounts**: dollar_amounts: [] (empty array)
- **No board response**: board_response: null

### Unclear Attribution
- If speaker unclear, use best guess based on context
- Add note: "Speaker attribution inferred from context"

### Formatting Issues in Source
- If PDF has OCR errors or unclear text:
  - Extract as accurately as possible
  - Note: "Source text unclear in PDF" in notes field
- If section numbers missing:
  - Infer from structure
  - Use descriptive section names if needed

### Multiple Meetings in One PDF
- Create separate JSON file for each meeting
- Append meeting number to filename: `filename_meeting1.json`, `filename_meeting2.json`

---

## Validation Rules

### Required Fields (cannot be null or missing)
- filename
- meeting_metadata.date
- meeting_metadata.attendees
- meeting_summary
- topics_discussed (can be empty array)
- votes (can be empty array)
- public_comments (can be empty array)

### Field Type Validation
- Dates: ISO format string "YYYY-MM-DD"
- Dollar amounts: Numbers (not strings)
- Booleans: true/false (not "true"/"false")
- Arrays: Always arrays even if single item

### Consistency Checks
- vote_breakdown must include all attendees.trustees + attendees.mayor
- Trustee names must match exactly across all sections
- motion_number must be sequential within votes array
- comment_number must be sequential within public_comments array

---

## Processing Workflow

1. **Extract filename** from PDF → Use as JSON filename
2. **Extract meeting metadata** → Parse date, type, attendees
3. **Read through chronologically** → Process each section
4. **Parse votes** → Create vote objects with all attributes
5. **Parse public comments** → Capture verbatim text + metadata
6. **Extract announcements and reports** → Structure with events/action items
7. **Aggregate summaries** → topics, action items, dollar amounts
8. **Extract cross-cutting data** → named individuals, locations, dates
9. **Write meeting summary** → 2-3 sentence overview
10. **Validate** → Check all required fields, formats, consistency
11. **Output JSON** → Filename matches PDF filename

---

## Final Notes

- **Accuracy over speed**: Take time to be precise
- **Verbatim is critical**: comment_text and discussion statements must be exact
- **Structure for querying**: Every field should be filterable/searchable
- **Think like an API**: Structure data for programmatic access
- **Preserve context**: Don't lose important details in summarization
- **Standardize names**: Use full, consistent names throughout (e.g., "Trustee Price-Bush" not "Price-Bush")
- **Document ambiguity**: Use notes field when source is unclear
- **Keep arrays consistent**: Empty arrays, not null, for list fields

This format enables powerful queries like:
- "Show all votes where Trustee X voted No"
- "Find all comments by resident Y"
- "List all items over $10,000"
- "What did the Mayor announce about topic Z?"
- "Which trustees discussed the zoning code?"
