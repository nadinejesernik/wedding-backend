const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

app.use(cors());
app.use(express.json());

// Railway has a persistent filesystem for your project.
// Store the DB next to this file:
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "rsvps.db");

// Open DB and handle errors explicitly (prevents silent crash loops)
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("❌ Failed to open DB:", err);
    process.exit(1);
  } else {
    console.log("✅ DB opened at:", DB_PATH);
  }
});

// Create table
db.run(
  `CREATE TABLE IF NOT EXISTS rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT,
    attending TEXT,
    dietary TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) {
      console.error("❌ Failed to create table:", err);
      process.exit(1);
    } else {
      console.log("✅ Table ready");
    }
  }
);

// Health/test route
app.get("/", (req, res) => {
  res.send("Wedding RSVP backend is running 🌿");
});

// Save RSVP
app.post("/rsvp", (req, res) => {
  const { code, name, attending, dietary, message } = req.body;

  db.run(
    `INSERT INTO rsvps (code, name, attending, dietary, message)
     VALUES (?, ?, ?, ?, ?)`,
    [code, name, attending, dietary, message],
    function (err) {
      if (err) {
        console.error("❌ Insert failed:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// List RSVPs (JSON)
app.get("/rsvps", (req, res) => {
  db.all(
    `SELECT id, code, name, attending, dietary, message, created_at
     FROM rsvps
     ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) {
        console.error("❌ Select failed:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(rows);
    }
  );
});

// Export JSON
app.get("/export.json", (req, res) => {
  db.all(
    `SELECT id, code, name, attending, dietary, message, created_at
     FROM rsvps
     ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) {
        console.error("❌ Export JSON failed:", err);
        return res.status(500).json({ error: "Database error" });
      }
      const filename = `wedding-rsvps-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(rows, null, 2));
    }
  );
});

// Export CSV
app.get("/export.csv", (req, res) => {
  db.all(
    `SELECT id, code, name, attending, dietary, message, created_at
     FROM rsvps
     ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) {
        console.error("❌ Export CSV failed:", err);
        return res.status(500).send("Database error");
      }

      const escapeCsv = (value) => {
        const s = String(value ?? "");
        if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
        return s;
      };

      const header = ["id", "created_at", "code", "name", "attending", "dietary", "message"];
      const lines = [
        header.join(","),
        ...rows.map(r =>
          [r.id, r.created_at, r.code, r.name, r.attending, r.dietary, r.message]
            .map(escapeCsv)
            .join(",")
        ),
      ];

      const filename = `wedding-rsvps-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(lines.join("\n"));
    }
  );
});

// Admin page (simple table)
app.get("/admin", (req, res) => {
  db.all(
    `SELECT id, code, name, attending, dietary, message, created_at
     FROM rsvps
     ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) {
        console.error("❌ Admin query failed:", err);
        return res.status(500).send("Database error");
      }

      const esc = (s) =>
        String(s ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");

      const tableRows = rows.map(r => `
        <tr>
          <td>${esc(r.created_at)}</td>
          <td>${esc(r.code)}</td>
          <td>${esc(r.name)}</td>
          <td>${esc(r.attending)}</td>
          <td>${esc(r.dietary)}</td>
          <td>${esc(r.message)}</td>
        </tr>
      `).join("");

      res.send(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>Wedding RSVPs</title>
            <style>
              body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #ddd; padding: 10px; vertical-align: top; }
              th { background: #f6f6f6; text-align: left; }
              tr:nth-child(even) { background: #fafafa; }
              a { display:inline-block; padding:8px 12px; border:1px solid #ddd; border-radius:10px; text-decoration:none; margin-right:8px; }
              code { background:#f2f2f2; padding:2px 6px; border-radius:6px; }
            </style>
          </head>
          <body>
            <h1>RSVP Responses</h1>
            <p>
              <a href="/export.csv">Download CSV</a>
              <a href="/export.json">Download JSON</a>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Submitted</th><th>Code</th><th>Party</th><th>Attendance</th><th>Dietary</th><th>Message</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows || `<tr><td colspan="6">No RSVPs yet.</td></tr>`}
              </tbody>
            </table>
            <p><small>DB: <code>${esc(DB_PATH)}</code></small></p>
          </body>
        </html>
      `);
    }
  );
});

// IMPORTANT: bind to 0.0.0.0 on Railway
app.listen(PORT, HOST, () => {
  console.log(`✅ Server listening on http://${HOST}:${PORT}`);
});
