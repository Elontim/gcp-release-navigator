import os
import sqlite3
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
import re
import html

DB_PATH = os.path.join(os.path.dirname(__file__), 'opportunities.db')

FEEDS = [
    {"name": "Opportunity Desk", "url": "https://opportunitydesk.org/feed/"},
    {"name": "Youth Opportunities", "url": "https://www.youthop.com/feed"}
]

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS opportunities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            link TEXT UNIQUE NOT NULL,
            description TEXT,
            category TEXT,
            source TEXT,
            pub_date TEXT,
            scraped_at TEXT,
            saved INTEGER DEFAULT 0
        )
    ''')
    conn.commit()
    conn.close()

def clean_html(raw_html):
    if not raw_html:
        return ""
    # Remove HTML tags
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, '', raw_html)
    # Decode HTML entities
    cleantext = html.unescape(cleantext)
    return cleantext.strip()

def classify_opportunity(title, description):
    text = (title + " " + description).lower()
    
    # Fellowship checks
    if "fellowship" in text or "fellow" in text:
        return "Fellowship"
        
    # Travel Grant checks
    if "travel grant" in text or "travel assistance" in text or "travel award" in text or "mobility grant" in text:
        return "Travel Grant"
        
    # Fully Funded Conference checks
    if ("conference" in text or "summit" in text or "forum" in text) and ("fully funded" in text or "fully-funded" in text or "funded" in text):
        return "Fully Funded Conference"
        
    # Standard filters
    if "grant" in text:
        return "Travel Grant"
    if "conference" in text:
        return "Fully Funded Conference"
        
    return "Other"

def fetch_feed(feed_name, feed_url):
    print(f"Fetching feed: {feed_name} from {feed_url}...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        req = urllib.request.Request(feed_url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            xml_data = response.read()
            
        root = ET.fromstring(xml_data)
        
        # Standard RSS parses items in channel
        items = root.findall('.//item')
        parsed_items = []
        
        for item in items:
            title = item.find('title').text if item.find('title') is not None else ""
            link = item.find('link').text if item.find('link') is not None else ""
            
            # Extract description or content
            description = ""
            desc_el = item.find('description')
            if desc_el is not None:
                description = desc_el.text or ""
            
            # Fallback for content:encoded if description is short or empty
            content_encoded = item.find('{http://purl.org/rss/1.0/modules/content/}encoded')
            if content_encoded is not None and content_encoded.text:
                description = content_encoded.text
                
            pub_date_str = item.find('pubDate').text if item.find('pubDate') is not None else ""
            
            # Format pubDate
            try:
                # Example: Tue, 16 Jun 2026 12:00:00 +0000
                parsed_date = datetime.strptime(pub_date_str[:25].strip(), "%a, %d %b %Y %H:%M:%S")
                formatted_date = parsed_date.strftime("%Y-%m-%d %H:%M:%S")
            except Exception:
                formatted_date = pub_date_str
                
            parsed_items.append({
                "title": clean_html(title),
                "link": link.strip(),
                "description": description, # Keep HTML description for rendering
                "pub_date": formatted_date,
                "source": feed_name
            })
            
        return parsed_items
    except Exception as e:
        print(f"Error reading feed {feed_name}: {e}")
        return []

def run_scraper():
    init_db()
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    new_opportunities_count = 0
    scraped_at_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    for feed in FEEDS:
        items = fetch_feed(feed["name"], feed["url"])
        
        for item in items:
            # Check if this meets our target keyword criteria
            desc_clean = clean_html(item["description"])
            category = classify_opportunity(item["title"], desc_clean)
            
            # We filter for specific targets only
            if category in ["Fellowship", "Travel Grant", "Fully Funded Conference"]:
                try:
                    cursor.execute('''
                        INSERT INTO opportunities (title, link, description, category, source, pub_date, scraped_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        item["title"],
                        item["link"],
                        item["description"], # Keep html tags in description for richer render
                        category,
                        item["source"],
                        item["pub_date"],
                        scraped_at_str
                    ))
                    new_opportunities_count += 1
                except sqlite3.IntegrityError:
                    # Duplicate link, skip
                    pass
                    
    conn.commit()
    conn.close()
    
    print(f"Scraper complete. Found {new_opportunities_count} new opportunities matching target filters.")
    return new_opportunities_count

if __name__ == '__main__':
    run_scraper()
