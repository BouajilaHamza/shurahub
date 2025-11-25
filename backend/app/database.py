import sqlite3
import json
from datetime import datetime

DATABASE_NAME = "shurahub.db"

def initialize_db():
    """Initializes the database and creates the debates table if it doesn't exist."""
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS debates (
                debate_id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                user_prompt TEXT NOT NULL,
                opener_model TEXT NOT NULL,
                opener_response TEXT NOT NULL,
                critiquer_model TEXT NOT NULL,
                critiquer_response TEXT NOT NULL,
                synthesizer_model TEXT NOT NULL,
                synthesizer_response TEXT NOT NULL,
                opener_rating INTEGER,
                final_rating INTEGER
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS feedback (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT,
                message TEXT NOT NULL,
                category TEXT,
                created_at TEXT NOT NULL
            )
        ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS analytics_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_name TEXT NOT NULL,
                metadata TEXT,
                created_at TEXT NOT NULL
            )
        ''')
        conn.commit()

def add_debate(debate_data):
    """Adds a new debate to the database."""
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO debates (
                debate_id, timestamp, user_prompt,
                opener_model, opener_response,
                critiquer_model, critiquer_response,
                synthesizer_model, synthesizer_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            debate_data['debate_id'],
            debate_data['timestamp'],
            debate_data['user_prompt'],
            debate_data['opener']['model'],
            debate_data['opener']['response'],
            debate_data['critiquer']['model'],
            debate_data['critiquer']['response'],
            debate_data['synthesizer']['model'],
            debate_data['synthesizer']['response']
        ))
        conn.commit()

def update_rating(debate_id, rater, rating):
    """Updates the rating for a specific debate."""
    # The rater from the frontend is 'opener' or 'final'
    rating_column = "opener_rating" if rater == "opener" else "final_rating"
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        # Use f-string carefully here, only for the column name which is validated.
        cursor.execute(f'''
            UPDATE debates
            SET {rating_column} = ?
            WHERE debate_id = ?
        ''', (rating, debate_id))
        conn.commit()

def get_all_debates():
    """Retrieves all debates from the database and formats them for the frontend."""
    with sqlite3.connect(DATABASE_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM debates ORDER BY timestamp DESC")
        rows = cursor.fetchall()

        debates = []
        for row in rows:
            debates.append({
                "debate_id": row["debate_id"],
                "timestamp": row["timestamp"],
                "user_prompt": row["user_prompt"],
                "opener": {"model": row["opener_model"], "response": row["opener_response"]},
                "critiquer": {"model": row["critiquer_model"], "response": row["critiquer_response"]},
                "synthesizer": {"model": row["synthesizer_model"], "response": row["synthesizer_response"]},
                "ratings": {"opener": row["opener_rating"], "final": row["final_rating"]}
            })
        return debates

def migrate_from_jsonl(log_file="debate_log.jsonl"):
    """Migrates data from the old JSONL file to the SQLite database."""
    try:
        with sqlite3.connect(DATABASE_NAME) as conn, open(log_file, "r") as f:
            cursor = conn.cursor()
            migrated_count = 0
            for line in f:
                try:
                    entry = json.loads(line)
                    # Check if debate already exists to avoid duplicates
                    cursor.execute("SELECT 1 FROM debates WHERE debate_id = ?", (entry['debate_id'],))
                    if cursor.fetchone():
                        continue

                    cursor.execute('''
                        INSERT INTO debates (
                            debate_id, timestamp, user_prompt,
                            opener_model, opener_response,
                            critiquer_model, critiquer_response,
                            synthesizer_model, synthesizer_response,
                            opener_rating, final_rating
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        entry.get('debate_id'),
                        entry.get('timestamp'),
                        entry.get('user_prompt'),
                        entry.get('opener', {}).get('model'),
                        entry.get('opener', {}).get('response'),
                        entry.get('critiquer', {}).get('model'),
                        entry.get('critiquer', {}).get('response'),
                        entry.get('synthesizer', {}).get('model'),
                        entry.get('synthesizer', {}).get('response'),
                        entry.get('ratings', {}).get('opener'),
                        entry.get('ratings', {}).get('final')
                    ))
                    migrated_count += 1
                except (json.JSONDecodeError, KeyError) as e:
                    print(f"Skipping malformed line in log file: {e}")
            
            if migrated_count > 0:
                conn.commit()
                print(f"Successfully migrated {migrated_count} debates.")
            else:
                print("No new debates to migrate.")

    except FileNotFoundError:
        print("Log file not found, skipping migration.")
    except Exception as e:
        print(f"An error occurred during migration: {e}")


def save_feedback_entry(email, message, category=None):
    """Stores user feedback submissions for later analysis."""
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute(
            '''
            INSERT INTO feedback (email, message, category, created_at)
            VALUES (?, ?, ?, ?)
            ''',
            (email, message, category, datetime.utcnow().isoformat()),
        )
        conn.commit()


def record_analytics_event(event_name, metadata=None):
    """Records lightweight analytics events for the landing page."""
    with sqlite3.connect(DATABASE_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute(
            '''
            INSERT INTO analytics_events (event_name, metadata, created_at)
            VALUES (?, ?, ?)
            ''',
            (event_name, json.dumps(metadata or {}), datetime.utcnow().isoformat()),
        )
        conn.commit()
