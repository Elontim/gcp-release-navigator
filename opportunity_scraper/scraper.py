import os
import sqlite3
import urllib.request
import json
import csv
import time
import random
import re
from bs4 import BeautifulSoup

# Paths
BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, 'opportunities.db')
JSON_PATH = os.path.join(BASE_DIR, 'scraped_opportunities.json')
CSV_PATH = os.path.join(BASE_DIR, 'scraped_opportunities.csv')

# User Agent list for rotation
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
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
            saved INTEGER DEFAULT 0,
            target_region TEXT,
            benefits TEXT,
            deadline TEXT
        )
    ''')
    conn.commit()
    conn.close()

def get_random_headers():
    return {
        'User-Agent': random.choice(USER_AGENTS),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
    }

def fetch_html_playwright(url):
    """
    Fallback option in case target platforms implement JS challenges or Cloudflare barriers.
    """
    print(f"Attempting Playwright fallback for: {url}...")
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            # Launch in headless mode
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(user_agent=random.choice(USER_AGENTS))
            page = context.new_page()
            
            # Navigate with timeout and wait until network is idle
            page.goto(url, timeout=30000, wait_until='domcontentloaded')
            time.sleep(random.uniform(2.0, 4.0)) # Let page settle
            
            html_content = page.content()
            browser.close()
            return html_content
    except ImportError:
        print("Playwright library not installed. Skipping browser fallback.")
        return None
    except Exception as e:
        print(f"Playwright execution error: {e}")
        return None

def fetch_html(url):
    # Random ethical delay before requesting
    time.sleep(random.uniform(1.5, 3.5))
    
    headers = get_random_headers()
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15) as response:
            status = response.status
            if status == 200:
                return response.read()
            else:
                print(f"Received non-200 status code: {status}")
    except Exception as e:
        print(f"Static request failed for {url}: {e}")
        
    # Trigger fallback Playwright method
    return fetch_html_playwright(url)

# --- NLP / Regex Extraction Helpers ---

def extract_deadline(text):
    if not text:
        return "Not specified"
    # Look for patterns like "Deadline: October 15, 2026" or "Deadline: 15 Oct 2026"
    patterns = [
        r'(?:deadline|closing date|apply by|applications close)[:\s]+([^.\n]+)',
        r'(?:deadline is|closing on)[:\s]+([^.\n]+)',
        r'(?:by|until)[:\s]+([0-9]{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+[0-9]{4})'
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            extracted = match.group(1).strip()
            # Clean up long extracted strings
            if len(extracted) < 50:
                return extracted
    return "See source link"

def extract_benefits(text):
    if not text:
        return "Not specified"
    
    # Split text into sentences/lines
    sentences = re.split(r'\.|\n', text)
    benefits_sentences = []
    
    # User filters: contain "$", "EUR", "Fully Funded", "Travel" (and general terms like stipend, allowance)
    keywords = ["$", "eur", "fully funded", "fully-funded", "travel", "stipend", "allowance", "accommodation", "flight", "expenses"]
    
    for sentence in sentences:
        s_lower = sentence.lower()
        if any(kw in s_lower for kw in keywords):
            clean_s = sentence.strip()
            if clean_s and len(clean_s) > 10 and len(clean_s) < 150:
                benefits_sentences.append(clean_s)
                
    if benefits_sentences:
        # Return top 3 matched benefits sentences
        return ". ".join(benefits_sentences[:3]) + "."
        
    return "Funding available (review source details)"

def extract_region(text, default="Global"):
    if not text:
        return default
    text_lower = text.lower()
    
    # Common region indicators
    if "sub-saharan africa" in text_lower or "africans" in text_lower or "africa" in text_lower:
        return "Africa / Sub-Saharan Africa"
    if "developing countries" in text_lower or "low income countries" in text_lower:
        return "Developing Countries"
    if "latin america" in text_lower:
        return "Latin America & Caribbean"
    if "asia" in text_lower:
        return "Asia-Pacific"
    if "europe" in text_lower:
        return "Europe"
    if "international students" in text_lower or "worldwide" in text_lower or "global" in text_lower:
        return "Global / Worldwide"
        
    return default

# --- Scraper Core Processes ---

def scrape_opportunity_desk():
    opportunities = []
    
    # Targets category page list
    categories = [
        {"url": "https://opportunitydesk.org/category/fellowships/", "name": "Fellowship"},
        {"url": "https://opportunitydesk.org/category/grants/", "name": "Travel Grant"}
    ]
    
    for cat in categories:
        print(f"Scraping Opportunity Desk: {cat['name']}...")
        html_content = fetch_html(cat["url"])
        if not html_content:
            continue
            
        soup = BeautifulSoup(html_content, 'html.parser')
        
        # Grab post links inside h2 headers
        # Typical markup uses h2 class="entry-title"
        links = []
        for header in soup.find_all(['h2', 'h1', 'h3']):
            a_tag = header.find('a')
            if a_tag and a_tag.get('href'):
                link = a_tag.get('href')
                # Filter posts by checking if the URL contains year indicators (prevents grabbing menus)
                if '/202' in link and link not in links:
                    links.append((a_tag.text.strip(), link))
                    
        # Scrape latest 5 posts per category
        for title, link in links[:5]:
            safe_title = title.encode('ascii', 'ignore').decode('ascii')
            print(f"Extracting details: {safe_title}...")
            post_html = fetch_html(link)
            if not post_html:
                continue
                
            post_soup = BeautifulSoup(post_html, 'html.parser')
            
            # Extract content text
            content_div = post_soup.find(class_='entry-content') or post_soup.find(id='content')
            content_text = content_div.get_text() if content_div else ""
            content_html = str(content_div) if content_div else ""
            
            # Run extraction parameters
            deadline = extract_deadline(content_text)
            benefits = extract_benefits(content_text)
            region = extract_region(content_text)
            
            # Refine classification if category is generic
            refined_cat = cat["name"]
            if refined_cat == "Travel Grant" and "conference" in title.lower() and "fully funded" in title.lower():
                refined_cat = "Fully Funded Conference"
                
            opportunities.append({
                "title": title,
                "link": link,
                "description": content_html,
                "category": refined_cat,
                "source": "Opportunity Desk",
                "pub_date": datetime_now_str(),
                "target_region": region,
                "benefits": benefits,
                "deadline": deadline
            })
            
    return opportunities

def scrape_opportunities_for_africans():
    print("Scraping Opportunities For Africans: Fellowships...")
    opportunities = []
    
    url = "https://www.opportunitiesforafricans.com/category/fellowships/"
    html_content = fetch_html(url)
    if not html_content:
        return opportunities
        
    soup = BeautifulSoup(html_content, 'html.parser')
    
    links = []
    for header in soup.find_all(['h2', 'h1', 'h3']):
        a_tag = header.find('a')
        if a_tag and a_tag.get('href'):
            link = a_tag.get('href')
            if '/202' in link and link not in links:
                links.append((a_tag.text.strip(), link))
                
    # Scrape latest 5 posts
    for title, link in links[:5]:
        safe_title = title.encode('ascii', 'ignore').decode('ascii')
        print(f"Extracting details: {safe_title}...")
        post_html = fetch_html(link)

        if not post_html:
            continue
            
        post_soup = BeautifulSoup(post_html, 'html.parser')
        content_div = post_soup.find(class_='entry-content') or post_soup.find(class_='post-content')
        content_text = content_div.get_text() if content_div else ""
        content_html = str(content_div) if content_div else ""
        
        deadline = extract_deadline(content_text)
        benefits = extract_benefits(content_text)
        
        # Region defaults to Africa for this site
        region = extract_region(content_text, default="Africa")
        
        opportunities.append({
            "title": title,
            "link": link,
            "description": content_html,
            "category": "Fellowship",
            "source": "Opportunities For Africans",
            "pub_date": datetime_now_str(),
            "target_region": region,
            "benefits": benefits,
            "deadline": deadline
        })
        
    return opportunities

def datetime_now_str():
    return time.strftime("%Y-%m-%d %H:%M:%S")

# --- Export / Storage Handlers ---

def export_to_files(opportunities):
    # 1. Output clean JSON
    json_data = []
    for op in opportunities:
        json_data.append({
            "title": op["title"],
            "category": op["category"],
            "target_region": op["target_region"],
            "benefits": op["benefits"],
            "deadline": op["deadline"],
            "source_url": op["link"],
            "source_platform": op["source"],
            "scraped_at": op["scraped_at"]
        })
        
    with open(JSON_PATH, 'w', encoding='utf-8') as f:
        json.dump(json_data, f, indent=4, ensure_ascii=False)
    print(f"Saved {len(json_data)} entries into JSON format at: scraped_opportunities.json")
    
    # 2. Output CSV
    keys = ["title", "category", "target_region", "benefits", "deadline", "source_url", "source_platform", "scraped_at"]
    with open(CSV_PATH, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        writer.writerows(json_data)
    print(f"Saved {len(json_data)} entries into CSV format at: scraped_opportunities.csv")

# --- Main Entry Runner ---

def run_scraper():
    init_db()
    
    all_ops = []
    
    # Scraping runs
    try:
        all_ops.extend(scrape_opportunity_desk())
    except Exception as e:
        print(f"Failed Opportunity Desk scraping execution: {e}")
        
    try:
        all_ops.extend(scrape_opportunities_for_africans())
    except Exception as e:
        print(f"Failed Opportunities For Africans scraping execution: {e}")
        
    if not all_ops:
        print("Scraper completed: 0 results returned. Target platforms may have blocked requests.")
        return 0
        
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    inserted_count = 0
    scraped_at_str = datetime_now_str()
    
    for op in all_ops:
        op["scraped_at"] = scraped_at_str
        try:
            cursor.execute('''
                INSERT INTO opportunities (title, link, description, category, source, pub_date, scraped_at, target_region, benefits, deadline)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                op["title"],
                op["link"],
                op["description"],
                op["category"],
                op["source"],
                op["pub_date"],
                op["scraped_at"],
                op["target_region"],
                op["benefits"],
                op["deadline"]
            ))
            inserted_count += 1
        except sqlite3.IntegrityError:
            # Entry exists, update the scraped metadata and fields instead of failing
            cursor.execute('''
                UPDATE opportunities
                SET target_region = ?, benefits = ?, deadline = ?, scraped_at = ?
                WHERE link = ?
            ''', (op["target_region"], op["benefits"], op["deadline"], scraped_at_str, op["link"]))
            
    conn.commit()
    
    # Export full database rows (both old and new) to JSON and CSV to ensure complete exports
    cursor.execute('SELECT * FROM opportunities')
    rows = cursor.fetchall()
    db_ops = []
    for r in rows:
        db_ops.append({
            "title": r[1],
            "link": r[2],
            "description": r[3],
            "category": r[4],
            "source": r[5],
            "pub_date": r[6],
            "scraped_at": r[7],
            "target_region": r[9] if r[9] else "Global",
            "benefits": r[10] if r[10] else "Funding available",
            "deadline": r[11] if r[11] else "Review source"
        })
    conn.close()
    
    export_to_files(db_ops)
    return inserted_count

if __name__ == '__main__':
    run_scraper()
