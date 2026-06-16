import os
import sqlite3
from flask import Flask, jsonify, render_template, request
import scraper

app = Flask(__name__)

# Ensure the database is initialized and seeded on start
DB_PATH = scraper.DB_PATH

# Seed mock data if database is empty
MOCK_SEED_OPPORTUNITIES = [
    {
        "title": "Humphrey Fellowship Program 2026-2027 (Fully Funded to the United States)",
        "link": "https://opportunitydesk.org/2026/06/humphrey-fellowship-2026/",
        "description": "The Hubert H. Humphrey Fellowship Program provides ten months of non-degree academic study and related professional experiences in the United States. Humphrey Fellows are selected based on their potential for leadership and their commitment to public service in either the public or the private sector.",
        "category": "Fellowship",
        "source": "Opportunity Desk",
        "pub_date": "2026-06-15 08:30:00",
        "target_region": "Global / Worldwide",
        "benefits": "Covers tuition fees, monthly living allowance, accident and sickness coverage, and round-trip travel.",
        "deadline": "October 1, 2026"
    },
    {
        "title": "IETF 120 Travel Grants for Network Engineers (Fully Funded to Madrid, Spain)",
        "link": "https://opportunitydesk.org/2026/06/ietf-120-travel-grants/",
        "description": "The Internet Engineering Task Force (IETF) is offering travel grants to support network engineers, researchers, and developers from underrepresented regions to attend the IETF 120 meeting in Madrid, Spain. The grant covers flights, accommodation, and meeting registration.",
        "category": "Travel Grant",
        "source": "Opportunity Desk",
        "pub_date": "2026-06-14 10:15:00",
        "target_region": "Developing Countries",
        "benefits": "Includes complimentary meeting registration, round-trip economy flight, and private hotel accommodation.",
        "deadline": "July 12, 2026"
    },
    {
        "title": "One Young World Summit 2026 - Fully Funded Delegate Scholarship (Munich, Germany)",
        "link": "https://opportunitydesk.org/2026/06/one-young-world-summit-2026-scholarship/",
        "description": "One Young World is looking for young leaders from around the globe to participate in the One Young World Summit 2026 in Munich, Germany. The scholarship covers summit access, private hotel accommodation, catering, and return travel.",
        "category": "Fully Funded Conference",
        "source": "Youth Opportunities",
        "pub_date": "2026-06-12 14:00:00",
        "target_region": "Global / Worldwide",
        "benefits": "Access to the OYW 2026 summit, hotel accommodation, transport, and catering.",
        "deadline": "August 30, 2026"
    },
    {
        "title": "CERN Summer Student Programme 2026 in Geneva (Fully Funded Fellowship)",
        "link": "https://www.youthop.com/fellowships/cern-summer-student-programme-2026-in-geneva",
        "description": "The CERN Summer Student Programme offers undergraduate and graduate students in physics, computing, engineering, and mathematics a unique opportunity to join in the day-to-day work of research teams in Geneva, Switzerland. Includes allowance, travel coverage, and health insurance.",
        "category": "Fellowship",
        "source": "Youth Opportunities",
        "pub_date": "2026-06-10 09:00:00",
        "target_region": "Global / Worldwide",
        "benefits": "Covers a daily allowance of 92 CHF, travel allowance, and comprehensive health insurance coverage.",
        "deadline": "January 31, 2027"
    },
    {
        "title": "ACM SIGCOMM 2026 Travel Grants for Graduate Students (Fully Funded to Athens)",
        "link": "https://www.youthop.com/grants/acm-sigcomm-2026-travel-grants",
        "description": "ACM SIGCOMM offers travel grants to support graduate students and early-career researchers attending the SIGCOMM 2026 conference in Athens, Greece. Grants cover travel expenses, lodging, and conference registration.",
        "category": "Travel Grant",
        "source": "Youth Opportunities",
        "pub_date": "2026-06-08 11:45:00",
        "target_region": "Global / Worldwide",
        "benefits": "Covers economy travel costs, registration, and shared hotel accommodation.",
        "deadline": "June 30, 2026"
    },
    {
        "title": "UN Climate Change Conference (COP 31) Youth Fellowship (Fully Funded)",
        "link": "https://opportunitydesk.org/2026/06/un-climate-change-cop31-youth-fellowship/",
        "description": "The UN Climate Change Youth Fellowship program is designed to bring young climate advocates and researchers directly into international climate negotiations. The fellowship covers full travel, lodging, daily allowance, and pre-conference training workshops.",
        "category": "Fully Funded Conference",
        "source": "Opportunity Desk",
        "pub_date": "2026-06-05 16:30:00",
        "target_region": "Global / Worldwide",
        "benefits": "Includes travel tickets, hotel stay, daily subsistence allowance, and expert training sessions.",
        "deadline": "September 15, 2026"
    }
]

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def seed_db():
    scraper.init_db()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if DB has any rows
    cursor.execute('SELECT COUNT(*) FROM opportunities')
    count = cursor.fetchone()[0]
    
    if count == 0:
        print("Seeding initial database with mock opportunity data...")
        import datetime
        scraped_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for op in MOCK_SEED_OPPORTUNITIES:
            try:
                cursor.execute('''
                    INSERT INTO opportunities (title, link, description, category, source, pub_date, scraped_at, target_region, benefits, deadline)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (op["title"], op["link"], op["description"], op["category"], op["source"], op["pub_date"], scraped_at, op["target_region"], op["benefits"], op["deadline"]))
            except sqlite3.IntegrityError:
                pass
        conn.commit()
    conn.close()


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/opportunities')
def get_opportunities():
    category = request.args.get('category', '').strip()
    search = request.args.get('search', '').strip()
    saved_only = request.args.get('saved_only', 'false').lower() == 'true'
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = 'SELECT * FROM opportunities WHERE 1=1'
    params = []
    
    if category:
        query += ' AND category = ?'
        params.append(category)
        
    if search:
        query += ' AND (title LIKE ? OR description LIKE ?)'
        search_param = f'%{search}%'
        params.append(search_param)
        params.append(search_param)
        
    if saved_only:
        query += ' AND saved = 1'
        
    query += ' ORDER BY pub_date DESC'
    
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    opportunities = []
    for row in rows:
        opportunities.append({
            "id": row["id"],
            "title": row["title"],
            "link": row["link"],
            "description": row["description"],
            "category": row["category"],
            "source": row["source"],
            "pub_date": row["pub_date"],
            "scraped_at": row["scraped_at"],
            "saved": bool(row["saved"])
        })
        
    conn.close()
    return jsonify(opportunities)

@app.route('/api/opportunities/<int:op_id>/save', methods=['POST'])
def toggle_save_opportunity(op_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get current saved state
    cursor.execute('SELECT saved FROM opportunities WHERE id = ?', (op_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Opportunity not found"}), 404
        
    new_saved_state = 1 if row["saved"] == 0 else 0
    cursor.execute('UPDATE opportunities SET saved = ? WHERE id = ?', (new_saved_state, op_id))
    conn.commit()
    conn.close()
    
    return jsonify({
        "id": op_id,
        "saved": bool(new_saved_state),
        "message": "Opportunity saved successfully" if new_saved_state else "Opportunity removed from saved list"
    })

@app.route('/api/scrape', methods=['POST'])
def trigger_scrape():
    try:
        new_count = scraper.run_scraper()
        return jsonify({
            "status": "success",
            "new_count": new_count
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/api/stats')
def get_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute('SELECT category, COUNT(*) as count FROM opportunities GROUP BY category')
    rows = cursor.fetchall()
    
    stats = {
        "Fellowship": 0,
        "Travel Grant": 0,
        "Fully Funded Conference": 0,
        "Total": 0
    }
    
    total = 0
    for row in rows:
        cat = row["category"]
        if cat in stats:
            stats[cat] = row["count"]
            total += row["count"]
            
    stats["Total"] = total
    
    # Also get saved count
    cursor.execute('SELECT COUNT(*) FROM opportunities WHERE saved = 1')
    saved_count = cursor.fetchone()[0]
    stats["Saved"] = saved_count
    
    conn.close()
    return jsonify(stats)

if __name__ == '__main__':
    seed_db()
    app.run(debug=True, host="0.0.0.0", port=5001)
