// server.js (Render-friendly, works WITH or WITHOUT a persistent disk)

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const path = require("path");
const os = require("os");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/**
 * SQLite path strategy:
 * - If you ever get a persistent disk, set DB_PATH (e.g. /var/data/rsvps.db)
 * - Otherwise (Render free, no disk), use a writable temp directory (/tmp)
 */
const DB_PATH = process.env.DB_PATH || path.join(os.tmpdir(), "rsvps.db");

// Create / open database
const db = new sqlite3.Database(DB_PATH);

// Create table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT,
    name TEXT,
    attending TEXT,
    dietary TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Test route
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
        console.error(err);
        return res.status(500).json({ error: "Database error" });
      }

      res.json({
        success: true,
        id: this.lastID,
      });
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
        console.error(err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json(rows);
    }
  );
});

// Simple admin page (human-friendly)
app.get("/admin", (req, res) => {
  db.all(
    `SELECT id, code, name, attending, dietary, message, created_at
     FROM rsvps
     ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Database error");
      }

      const escapeHtml = (s) =>
        String(s ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");

      const tableRows = rows
        .map(
          (r) => `
        <tr>
          <td>${escapeHtml(r.created_at)}</td>
          <td>${escapeHtml(r.code)}</td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.attending)}</td>
          <td>${escapeHtml(r.dietary)}</td>
          <td>${escapeHtml(r.message)}</td>
        </tr>
      `
        )
        .join("");

      res.send(`
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Wedding RSVPs</title>
          <style>
            body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; }
            h1 { margin: 0 0 12px; }
            .meta { color: #555; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ddd; padding: 10px; vertical-align: top; }
            th { background: #f6f6f6; text-align: left; }
            tr:nth-child(even) { background: #fafafa; }
            .small { font-size: 12px; color: #666; }
            code { background: #f2f2f2; padding: 2px 6px; border-radius: 6px; }
          </style>
        </head>
        <body>
          <h1>RSVP Responses</h1>
          <div class="meta">
  View JSON at <code>/rsvps</code>
  <div style="margin-top:10px;">
    <a href="/export.csv" style="display:inline-block;padding:8px 12px;border:1px solid #ddd;border-radius:10px;text-decoration:none;margin-right:8px;">
      Download CSV
    </a>
    <a href="/export.json" style="display:inline-block;padding:8px 12px;border:1px solid #ddd;border-radius:10px;text-decoration:none;">
      Download JSON
    </a>
  </div>
</div>

          <table>
            <thead>
              <tr>
                <th>Submitted</th>
                <th>Code</th>
                <th>Party</th>
                <th>Attendance</th>
                <th>Dietary</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || `<tr><td colspan="6" class="small">No RSVPs yet.</td></tr>`}
            </tbody>
          </table>

          <p class="small" style="margin-top:16px;">
            DB path: <code>${escapeHtml(DB_PATH)}</code>
          </p>
        </body>
        </html>
      `);
    }
  );
});

// Export RSVPs as JSON (backup)
app.get("/export.json", (req, res) => {
  db.all(
    `SELECT id, code, name, attending, dietary, message, created_at
     FROM rsvps
     ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Database error" });
      }

      const filename = `wedding-rsvps-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(rows, null, 2));
    }
  );
});

// Export RSVPs as CSV (backup)
app.get("/export.csv", (req, res) => {
  db.all(
    `SELECT id, code, name, attending, dietary, message, created_at
     FROM rsvps
     ORDER BY created_at DESC`,
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Database error");
      }

      const escapeCsv = (value) => {
        const s = String(value ?? "");
        // Wrap in quotes if it contains comma, quote, or newline
        if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
        return s;
      };

      const header = ["id", "created_at", "code", "name", "attending", "dietary", "message"];
      const lines = [
        header.join(","),
        ...rows.map(r => [
          r.id,
          r.created_at,
          r.code,
          r.name,
          r.attending,
          r.dietary,
          r.message
        ].map(escapeCsv).join(","))
      ];

      const filename = `wedding-rsvps-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(lines.join("\n"));
    }
  );
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`DB path: ${DB_PATH}`);
});
