import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
import csv

def extract_pdf_urls(page_url):
    """Extract all PDF URLs from a given page"""
    try:
        response = requests.get(page_url, timeout=10)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        pdf_links = []
        # Find all links that contain .pdf
        for link in soup.find_all('a', href=True):
            href = link['href']
            if '.pdf' in href.lower():
                full_url = urljoin(page_url, href)
                pdf_links.append(full_url)
        
        return pdf_links
    except Exception as e:
        print(f"Error processing {page_url}: {e}")
        return []

# Read URLs from CSV file
events_data = []
with open('bspa-event-urls-25-26.csv', 'r') as file:
    csv_reader = csv.reader(file)
    next(csv_reader)  # Skip header row
    for row in csv_reader:
        if len(row) > 1 and row[1]:  # Check that columns exist
            events_data.append({
                'event': row[0],      # Column A: Event name
                'url': row[1],        # Column B: URL
                'date': row[2] if len(row) > 2 else ''  # Column C: Date
            })

print(f"Loaded {len(events_data)} events from CSV\n")

# Extract PDFs and save results
results = []
for event in events_data:
    print(f"Checking: {event['event']}")
    pdfs = extract_pdf_urls(event['url'])
    if pdfs:
        for pdf in pdfs:
            print(f"  Found: {pdf}")
            results.append({
                'event': event['event'],
                'date': event['date'],
                'page_url': event['url'],
                'pdf_url': pdf
            })
    else:
        print("  No PDFs found")

# Save to CSV file
with open('pdf_results.csv', 'w', newline='') as csvfile:
    fieldnames = ['event', 'date', 'page_url', 'pdf_url']
    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(results)

print(f"\n✓ Done! Found {len(results)} PDFs total. Results saved to pdf_results.csv")
