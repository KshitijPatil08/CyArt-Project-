import sqlite3 from "sqlite3"
import path from "path"

const dbPath = path.join(process.cwd(), "users.db")
const db = new sqlite3.Database(dbPath)

// Initialize database
export function initializeDatabase() {
  return new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      // Create users table
      db.run(
        `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
        (err) => {
          if (err) reject(err)
          else resolve()
        },
      )
    })
  })
}

// Get user by email
export function getUserByEmail(email: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

// Get user by username
export function getUserByUsername(username: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM users WHERE username = ?", [username], (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

// Create new user
export function createUser(email: string, username: string, passwordHash: string): Promise<number> {
  return new Promise((resolve, reject) => {
    db.run(
      "INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)",
      [email, username, passwordHash],
      function (err) {
        if (err) reject(err)
        else resolve(this.lastID)
      },
    )
  })
}

export default db
