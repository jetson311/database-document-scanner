import os
import json
from pathlib import Path
from anthropic import Anthropic
from dotenv import load_dotenv
import PyPDF2

# Load environment variables from .env.local
env_path = Path("../.env.local")
if env_path.exists():
    load_dotenv(env_path)
    print(f"✅ Loaded environment from {env_path}")
else:
    print(f"⚠️  Warning: {env_path} not found, using system environment variables")

# Initialize Anthropic client
client = Anthropic()

# Define paths relative to project root
PDF_DIR = Path("../documents/board_of_trustees_documents/meeting_minutes/pdf")
JSON_DIR = Path("../documents/board_of_trustees_documents/meeting_minutes/json")

# Create JSON directory if it doesn't exist
JSON_DIR.mkdir(parents=True, exist_ok=True)

def get_pdfs_to_process():
    """Get list of PDFs that don't have matching JSON files"""
    if not PDF_DIR.exists():
        print(f"Error: PDF directory not found: {PDF_DIR}")
        return []
    
    pdf_files = list(PDF_DIR.glob("*.pdf"))
    
    if not pdf_files:
        print(f"No PDF files found in {PDF_DIR}")
        return []
    
    to_process = []
    for pdf_path in pdf_files:
        json_filename = pdf_path.stem + ".json"
        json_path = JSON_DIR / json_filename
        
        if not json_path.exists():
            to_process.append(pdf_path)
        else:
            print(f"⏭️  Skipping {pdf_path.name} (JSON already exists)")
    
    return to_process

def get_pdf_page_count(pdf_path):
    """Get number of pages in PDF"""
    try:
        with open(pdf_path, 'rb') as f:
            pdf_reader = PyPDF2.PdfReader(f)
            return len(pdf_reader.pages)
    except:
        return 0

def read_pdf_as_base64(pdf_path):
    """Read PDF file and convert to base64"""
    import base64
    with open(pdf_path, 'rb') as f:
        return base64.standard_b64encode(f.read()).decode('utf-8')

def extract_meeting_data(pdf_path):
    """Use Claude API to extract meeting data from PDF"""
    
    print(f"\n📄 Processing: {pdf_path.name}")
    
    # Check page count to determine if chunking is needed
    page_count = get_pdf_page_count(pdf_path)
    print(f"   Pages: {page_count}")
    
    if page_count <= 4:
        # Process normally for shorter documents
        return extract_single_pass(pdf_path)
    else:
        # Use chunked processing for longer documents
        print(f"   📚 Long document detected - using chunked processing")
        return extract_chunked(pdf_path)

def extract_single_pass(pdf_path):
    """Extract data from PDF in a single API call"""
    print("   Reading PDF...")
    
    # Read PDF as base64
    pdf_base64 = read_pdf_as_base64(pdf_path)
    
    # Load extraction guide
    guide_path = Path("../md/MEETING_MINUTES_EXTRACTION_GUIDE.md")
    if guide_path.exists():
        with open(guide_path, 'r') as f:
            extraction_guide = f.read()
    else:
        print("   ⚠️  Warning: Extraction guide not found at ../md/MEETING_MINUTES_EXTRACTION_GUIDE.md")
        print("   Using basic instructions instead")
        extraction_guide = "Extract all meeting data following standard meeting minutes format."
    
    print("   Sending to Claude API for extraction...")
    
    # Create prompt for Claude
    prompt = f"""You are processing a Board of Trustees meeting minutes PDF. 

Follow the MEETING_MINUTES_EXTRACTION_GUIDE.md exactly to extract all data into JSON format.

CRITICAL REQUIREMENTS:
1. Output filename MUST be: {pdf_path.stem}.json
2. Include ALL sections: meeting_metadata, votes, public_comments, mayor_announcements, liaison_reports, etc.
3. Public comment_text must be WORD-FOR-WORD from source
4. Every vote must include individual trustee breakdown
5. Standardize all trustee/mayor names consistently

Return ONLY valid JSON - no markdown, no explanations, just the JSON object.

The PDF filename is: {pdf_path.name}

EXTRACTION GUIDE:
{extraction_guide[:50000]}

Please extract all data from this meeting minutes PDF into the JSON format specified in the guide."""

    try:
        # Call Claude API with PDF
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=64000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": pdf_base64
                            }
                        },
                        {
                            "type": "text",
                            "text": prompt
                        }
                    ]
                }
            ]
        )
        
        # Extract JSON from response
        response_text = message.content[0].text
        
        # Remove markdown code blocks if present
        if response_text.strip().startswith("```"):
            # Find first { and last }
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            if start != -1 and end != 0:
                response_text = response_text[start:end]
        
        # Parse JSON to validate
        meeting_data = json.loads(response_text)
        
        print("   ✅ Extraction successful")
        return meeting_data
        
    except json.JSONDecodeError as e:
        print(f"   ❌ Error: Invalid JSON response - {e}")
        print(f"   Response preview: {response_text[:200]}...")
        return None
    except Exception as e:
        print(f"   ❌ Error during extraction: {e}")
        return None

def extract_chunked(pdf_path):
    """Extract data from long PDF using chunked approach"""
    
    # Load extraction guide
    guide_path = Path("../md/MEETING_MINUTES_EXTRACTION_GUIDE.md")
    if guide_path.exists():
        with open(guide_path, 'r') as f:
            extraction_guide = f.read()
    else:
        extraction_guide = "Extract all meeting data following standard meeting minutes format."
    
    # Read PDF as base64
    pdf_base64 = read_pdf_as_base64(pdf_path)
    
    print("   📖 Pass 1: Extracting structure and metadata...")
    
    # First pass - get basic structure
    structure_prompt = f"""You are processing a LONG Board of Trustees meeting minutes PDF.

This is PASS 1 of 2. In this pass, extract:
1. meeting_metadata (date, type, attendees)
2. meeting_summary (brief overview)
3. topics_discussed (list of all topics)
4. List all section numbers and brief descriptions of votes and public comments (just count them, don't extract full text yet)

Return ONLY valid JSON with these sections.

PDF filename: {pdf_path.name}"""

    try:
        # Pass 1 - Structure
        message1 = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=8000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": pdf_base64
                            }
                        },
                        {
                            "type": "text",
                            "text": structure_prompt
                        }
                    ]
                }
            ]
        )
        
        structure_text = message1.content[0].text
        if structure_text.strip().startswith("```"):
            start = structure_text.find('{')
            end = structure_text.rfind('}') + 1
            if start != -1 and end != 0:
                structure_text = structure_text[start:end]
        
        structure_data = json.loads(structure_text)
        print("   ✅ Structure extracted")
        
        print("   📝 Pass 2: Extracting detailed content...")
        
        # Pass 2 - Detailed extraction
        detail_prompt = f"""You are processing a LONG Board of Trustees meeting minutes PDF.

This is PASS 2 of 2. Extract the COMPLETE detailed data following the guide EXACTLY:

CRITICAL - WORD-FOR-WORD REQUIREMENTS:
- ALL public comment_text must be verbatim from source
- ALL trustee discussion statements must be verbatim
- ALL votes with individual trustee breakdowns

Include ALL sections as specified in the extraction guide:
- votes (every single vote with full details)
- public_comments (every comment with verbatim text)
- mayor_announcements
- liaison_reports  
- other_business
- action_items_summary
- dollar_amounts_summary
- named_individuals
- locations_referenced
- dates_and_deadlines

The filename is: {pdf_path.stem}.json

EXTRACTION GUIDE:
{extraction_guide[:50000]}

Return ONLY valid JSON with ALL detailed sections."""

        message2 = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=64000,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "document",
                            "source": {
                                "type": "base64",
                                "media_type": "application/pdf",
                                "data": pdf_base64
                            }
                        },
                        {
                            "type": "text",
                            "text": detail_prompt
                        }
                    ]
                }
            ]
        )
        
        detail_text = message2.content[0].text
        if detail_text.strip().startswith("```"):
            start = detail_text.find('{')
            end = detail_text.rfind('}') + 1
            if start != -1 and end != 0:
                detail_text = detail_text[start:end]
        
        detail_data = json.loads(detail_text)
        print("   ✅ Details extracted")
        
        # Merge the two passes
        final_data = {
            "filename": f"{pdf_path.stem}.json",
            **structure_data,
            **detail_data
        }
        
        print("   ✅ Chunked extraction successful")
        return final_data
        
    except json.JSONDecodeError as e:
        print(f"   ❌ Error: Invalid JSON response in chunked processing - {e}")
        return None
    except Exception as e:
        print(f"   ❌ Error during chunked extraction: {e}")
        return None

def save_json(data, pdf_path):
    """Save extracted data as JSON"""
    json_filename = pdf_path.stem + ".json"
    json_path = JSON_DIR / json_filename
    
    try:
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"   💾 Saved: {json_path}")
        return True
    except Exception as e:
        print(f"   ❌ Error saving JSON: {e}")
        return False

def main():
    print("="*80)
    print("MEETING MINUTES PDF TO JSON PROCESSOR")
    print("="*80)
    print(f"\nPDF Directory: {PDF_DIR.absolute()}")
    print(f"JSON Directory: {JSON_DIR.absolute()}")
    
    # Get PDFs to process
    pdfs_to_process = get_pdfs_to_process()
    
    if not pdfs_to_process:
        print("\n✅ No PDFs to process (all have matching JSON files)")
        return
    
    print(f"\n📋 Found {len(pdfs_to_process)} PDF(s) to process:\n")
    for pdf in pdfs_to_process:
        print(f"   • {pdf.name}")
    
    # Ask for confirmation
    response = input(f"\nProcess these {len(pdfs_to_process)} file(s)? (y/n): ")
    if response.lower() != 'y':
        print("Cancelled.")
        return
    
    # Process each PDF
    successful = 0
    failed = 0
    
    for i, pdf_path in enumerate(pdfs_to_process, 1):
        print(f"\n[{i}/{len(pdfs_to_process)}]")
        
        # Extract data
        meeting_data = extract_meeting_data(pdf_path)
        
        if meeting_data:
            # Save JSON
            if save_json(meeting_data, pdf_path):
                successful += 1
            else:
                failed += 1
        else:
            failed += 1
    
    # Summary
    print("\n" + "="*80)
    print("PROCESSING COMPLETE")
    print("="*80)
    print(f"✅ Successful: {successful}")
    print(f"❌ Failed: {failed}")
    print(f"📁 JSON files saved to: {JSON_DIR.absolute()}")
    print("="*80)

if __name__ == "__main__":
    main()