const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

const initializeDatabase = () => {
  const dbPath = process.env.DB_PATH || './data/agent.db';
  
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database:', err.message);
    } else {
      console.log('✅ Connected to SQLite database');
      createTables();
    }
  });
};

const createTables = () => {
 
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`, (err) => {
    if (err) {
      console.error('Error creating sessions table:', err.message);
    } else {
      console.log('✅ Sessions table ready');
    }
  });

  
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    extracted_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions (id)
  )`, (err) => {
    if (err) {
      console.error('Error creating messages table:', err.message);
    } else {
      console.log('✅ Messages table ready');
    }
  });
};

const saveSession = (sessionId) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO sessions (id, updated_at) VALUES (?, CURRENT_TIMESTAMP)',
      [sessionId],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
};

const saveMessage = (sessionId, role, content, extractedData = null) => {
  return new Promise((resolve, reject) => {
    const extractedDataJson = extractedData ? JSON.stringify(extractedData) : null;
    
    db.run(
      'INSERT INTO messages (session_id, role, content, extracted_data) VALUES (?, ?, ?, ?)',
      [sessionId, role, content, extractedDataJson],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
};

const getChatHistory = (sessionId) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT role, content, extracted_data, created_at FROM messages WHERE session_id = ? ORDER BY created_at ASC',
      [sessionId],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const messages = rows.map(row => ({
            role: row.role,
            content: row.content,
            extractedData: row.extracted_data ? JSON.parse(row.extracted_data) : null,
            timestamp: row.created_at
          }));
          resolve(messages);
        }
      }
    );
  });
};

const getSession = (sessionId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM sessions WHERE id = ?',
      [sessionId],
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
};

const closeDatabase = () => {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('✅ Database connection closed');
      }
    });
  }
};

module.exports = {
  initializeDatabase,
  saveSession,
  saveMessage,
  getChatHistory,
  getSession,
  closeDatabase
};
