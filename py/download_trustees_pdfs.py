import requests
import csv
import os
from urllib.parse import urlparse

# Create folder inside documents directory
docs_folder = '../documents/board_of_trustees_documents'
if not os.path.exists(docs_folder):
    os.makedirs(docs_folder)
    print(f"Created folder: {docs_folder}")

# Read the CSV
print("Reading CSV...")
pdf_data = []
with open('bspa-event-pdfs-2025-2026.csv', 'r') as file:
    csv_reader = csv.DictReader(file)
    for row in csv_reader:
        if 'Village of Ballston Spa Board of Trustees Meeting' in row['event']:
            pdf_data.append(row)

print(f"Found {len(pdf_data)} Board of Trustees PDFs to download\n")

# Download each PDF
successful = 0
failed = 0

for i, item in enumerate(pdf_data, 1):
    pdf_url = item['pdf_url']
    
    # Extract filename from URL
    filename = pdf_url.split('/')[-1]
    
    # Create full path
    filepath = os.path.join(docs_folder, filename)
    
    print(f"[{i}/{len(pdf_data)}] Downloading: {filename}")
    
    try:
        # Download the PDF
        response = requests.get(pdf_url, timeout=30)
        response.raise_for_status()
        
        # Save to file
        with open(filepath, 'wb') as f:
            f.write(response.content)
        
        print(f"  ✓ Saved to: {filepath}")
        successful += 1
        
    except Exception as e:
        print(f"  ✗ Error: {e}")
        failed += 1

print(f"\n{'='*50}")
print(f"Download complete!")
print(f"  Successfully downloaded: {successful}")
print(f"  Failed: {failed}")
print(f"  Location: {os.path.abspath(docs_folder)}")
print(f"{'='*50}")