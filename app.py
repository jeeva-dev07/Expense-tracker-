from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
import os

app = Flask(__name__, static_folder='static')
app.secret_key = os.urandom(24)
CORS(app, supports_credentials=True)

DB_FILE = "database.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            date TEXT NOT NULL,
            note TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    conn.commit()
    conn.close()

# Routing to render front-end static layout pages seamlessly
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'login.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Missing request body"}), 400
        
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')

    if not username or not email or not password:
        return jsonify({"error": "Missing required fields"}), 400

    hashed_password = generate_password_hash(password)

    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
            (username, email, hashed_password)
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "User registered successfully"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username or Email already exists"}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, password FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()

    if user and check_password_hash(user[2], password):
        session['user_id'] = user[0]
        session['username'] = user[1]
        return jsonify({"message": "Login successful", "username": user[1]}), 200
    else:
        return jsonify({"error": "Invalid username or password"}), 401

@app.route('/logout', methods=['GET'])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully"}), 200

@app.route('/check-session', methods=['GET'])
def check_session():
    if 'user_id' in session:
        return jsonify({"logged_in": True, "username": session['username']}), 200
    return jsonify({"logged_in": False}), 401

@app.route('/expenses', methods=['GET', 'POST'])
def handle_expenses():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    user_id = session['user_id']

    if request.method == 'POST':
        data = request.get_json()
        title = data.get('title')
        amount = data.get('amount')
        category = data.get('category')
        date = data.get('date')
        note = data.get('note', '')

        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO expenses (user_id, title, amount, category, date, note) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, title, amount, category, date, note)
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "Expense added successfully"}), 201

    else:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC", (user_id,))
        rows = cursor.fetchall()
        conn.close()

        expenses = [dict(row) for row in rows]
        return jsonify(expenses), 200

@app.route('/expenses/<int:expense_id>', methods=['PUT', 'DELETE'])
def modify_expense(expense_id):
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    user_id = session['user_id']

    if request.method == 'PUT':
        data = request.get_json()
        title = data.get('title')
        amount = data.get('amount')
        category = data.get('category')
        date = data.get('date')
        note = data.get('note', '')

        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE expenses 
            SET title = ?, amount = ?, category = ?, date = ?, note = ? 
            WHERE id = ? AND user_id = ?
        ''', (title, amount, category, date, note, expense_id, user_id))
        conn.commit()
        conn.close()
        return jsonify({"message": "Expense updated successfully"}), 200

    elif request.method == 'DELETE':
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM expenses WHERE id = ? AND user_id = ?", (expense_id, user_id))
        conn.commit()
        conn.close()
        return jsonify({"message": "Expense deleted successfully"}), 200

@app.route('/expenses/summary', methods=['GET'])
def get_summary():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    user_id = session['user_id']
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*), SUM(amount), MAX(amount) FROM expenses WHERE user_id = ?", (user_id,))
    count, total, highest = cursor.fetchone()
    total = total if total else 0.0
    highest = highest if highest else 0.0

    cursor.execute("SELECT DISTINCT category FROM expenses WHERE user_id = ?", (user_id,))
    categories_count = len(cursor.fetchall())

    cursor.execute("SELECT category, SUM(amount) FROM expenses WHERE user_id = ? GROUP BY category", (user_id,))
    breakdown_rows = cursor.fetchall()
    category_breakdown = [{"category": row[0], "amount": row[1]} for row in breakdown_rows]

    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT title, category, amount, date FROM expenses WHERE user_id = ? ORDER BY date DESC LIMIT 5", (user_id,))
    recent_rows = cursor.fetchall()
    recent_expenses = [dict(row) for row in recent_rows]

    conn.close()

    return jsonify({
        "total_count": count,
        "total_spent": total,
        "highest_expense": highest,
        "categories_used": categories_count,
        "category_breakdown": category_breakdown,
        "recent_expenses": recent_expenses
    }), 200

@app.route('/expenses/filter', methods=['GET'])
def filter_expenses():
    if 'user_id' not in session:
        return jsonify({"error": "Unauthorized"}), 401

    user_id = session['user_id']
    category = request.args.get('category')
    from_date = request.args.get('from')
    to_date = request.args.get('to')

    query = "SELECT * FROM expenses WHERE user_id = ?"
    params = [user_id]

    if category:
        query += " AND category = ?"
        params.append(category)
    if from_date:
        query += " AND date >= ?"
        params.append(from_date)
    if to_date:
        query += " AND date <= ?"
        params.append(to_date)

    query += " ORDER BY date DESC"

    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()

    return jsonify([dict(row) for row in rows]), 200

if __name__ == '__main__':
    init_db()
    app.run(host='127.0.0.1', port=5000, debug=True)
