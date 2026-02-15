# Board of Trustees Vote Extraction Instructions

## Objective
Extract all voted items from Board of Trustees meeting minutes and identify how each trustee member voted on each motion.

## Document Structure

### Meeting Header Information
- **Meeting Type**: Organizational Meeting, Regular Meeting, Special Meeting
- **Date**: Extract from document header
- **Attendees**: Listed in "Present:" section at start
  - Mayor
  - Trustees (typically 4)
  - Attorney
  - Village Clerk
  - Village Administrator

### Trustee Members to Track
From the sample document, the current trustees are:
- Mayor Rossi
- Trustee Price-Bush
- Trustee Dunkelbarger
- Trustee VanDeinse-Perez
- Trustee DuBuque

**Note**: Verify current trustees from the "Present:" section of each document, as membership may change.

## Motion Patterns to Identify

### Standard Motion Format
```
Motion made by [Trustee Name], seconded by [Trustee Name], [action description].
```

### Vote Recording Patterns

1. **Unanimous Approval**
   - Pattern: `ALL AYES`
   - Interpretation: All present trustees voted YES

2. **Explicit Vote Count**
   - Pattern: `AYES: [names]` and `NAYS: [names]`
   - Pattern: `Vote: 4-1` or similar numerical format

3. **No Vote Recorded**
   - If motion text exists but no vote result is stated
   - Mark as "Vote not recorded"

4. **Amendments or Revisions**
   - Pattern: `approved as revised` or `approved as amended`
   - Note the modification in the item description

## Extraction Process

### For Each Motion:

1. **Identify Motion Number/Location**
   - Extract section number (e.g., "3a", "6a", "7a")
   - Note agenda item title if present

2. **Extract Motion Details**
   - **Mover**: First trustee named ("Motion made by...")
   - **Seconder**: Second trustee named ("seconded by...")
   - **Description**: The action being voted on
   - **Type**: Approval, Resolution, Declaration, Authorization, etc.

3. **Record Vote Results**
   - **ALL AYES**: 
     - Mark all present trustees as YES
   - **AYES/NAYS listed**:
     - Record each trustee's vote explicitly
   - **Abstentions**: 
     - Note if trustee present but didn't vote
   - **Absent**:
     - If trustee listed in "Present" but not in vote, investigate
     - If trustee not listed in "Present", mark as ABSENT

4. **Handle Consent Agenda Items**
   - Consent agendas are grouped items voted on together
   - Pattern: Section with multiple sub-items (i, ii, iii, etc.)
   - One vote applies to ALL sub-items
   - Extract each sub-item separately but apply same vote to all

## Output Format

### CSV Structure
```
date,section,motion_description,mover,seconder,vote_result,mayor_rossi,trustee_price_bush,trustee_dunkelbarger,trustee_vandeinse_perez,trustee_dubuque,notes
```

### Example Rows
```csv
"2026-01-12","3a","Approve minutes of 12/8/25 Meeting","Trustee DuBuque","Trustee Price-Bush","ALL AYES","YES","YES","YES","YES","YES",""
"2026-01-12","6a-i","Declare library microfilm machine as surplus","Trustee VanDeinse-Perez","Trustee Price-Bush","ALL AYES","YES","YES","YES","YES","YES","Consent agenda item"
"2026-01-12","6a-ii","Approve Fire Dept purchase of 2 Motorola radios ($6,400)","Trustee VanDeinse-Perez","Trustee Price-Bush","ALL AYES","YES","YES","YES","YES","YES","Consent agenda item"
```

## Special Cases

### 1. Walk-On Items
- Items added during meeting (mentioned in Public Comment section)
- May not have formal section numbers
- Extract if voted on

### 2. Tabled Items
- Pattern: "tabled until [date]" or "postponed"
- Record as "TABLED" in vote_result
- Note the reason if provided

### 3. Withdrawn Motions
- Pattern: "motion withdrawn"
- Record but mark as "WITHDRAWN"

### 4. Failed Motions
- If vote shows more NAYS than AYES
- Mark as "FAILED" in vote_result

### 5. Multiple Votes on Same Item
- Amendments voted on separately
- Original motion voted on after amendments
- Create separate rows for each vote

## Validation Checks

1. **Vote Count Validation**
   - If "ALL AYES", count should match number of present trustees
   - If explicit vote, sum of AYES + NAYS + ABSTAIN should equal present trustees

2. **Mover/Seconder Validation**
   - Both must be in "Present" list
   - Mover and seconder cannot be the same person

3. **Consent Agenda Validation**
   - All sub-items should have same vote result
   - If different, flag for manual review

## Edge Cases to Watch For

1. **Name Variations**
   - "Mayor Rossi" vs "Rossi"
   - "Trustee Price-Bush" vs "Price-Bush"
   - Standardize all names in output

2. **Incomplete Records**
   - Motion made but no second recorded
   - Motion described but no vote recorded
   - Mark clearly in notes field

3. **Voice Votes**
   - Pattern: "voice vote" or "by acclamation"
   - Treat as ALL AYES unless otherwise noted

4. **Roll Call Votes**
   - Explicitly lists each trustee's vote
   - Most precise format - use exactly as stated

## Processing Instructions

### Step 1: Document Preparation
- Extract text from PDF
- Identify meeting date from header
- Extract present trustees list

### Step 2: Section Parsing
- Parse agenda structure
- Identify motion sections (usually numbered)

### Step 3: Motion Extraction
- For each section, identify motion pattern
- Extract mover, seconder, description
- Extract vote result

### Step 4: Vote Assignment
- Based on vote result pattern, assign individual votes
- Cross-reference with present trustees

### Step 5: Output Generation
- Create CSV row for each voted item
- Include all metadata

## Quality Assurance

- Review any motion without recorded vote
- Flag any vote count mismatches
- Verify consent agenda items have consistent votes
- Check for duplicate entries
