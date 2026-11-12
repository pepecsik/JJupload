// JJupload server -- replaces the old Apps Script backend. A plain Node
// server has no per-call execution overhead (unlike Apps Script, which
// spins up a fresh execution for every single request), so a video goes
// straight to Drive in one real streamed upload instead of many small
// base64-encoded chunks.
//
// Authenticates as the organizer's OWN Google account via a stored OAuth
// refresh token -- NOT a service account. Service accounts have zero
// personal Drive storage quota of their own, so creating a file as one
// always fails with storageQuotaExceeded on a regular (non-Workspace)
// personal Gmail Drive -- confirmed live. Using the organizer's own
// refresh token means uploads count against their real quota, while
// guests still never see a login screen (the authorization happened once,
// by the organizer, when this refresh token was generated).

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const os = require("os");
const fs = require("fs");
const { google } = require("googleapis");

const PORT = process.env.PORT || 3000;
const FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "https://pepecsik.github.io";
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

if (!FOLDER_ID) {
  console.error("Missing DRIVE_FOLDER_ID environment variable.");
  process.exit(1);
}
if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  console.error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN environment variable(s).");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
const drive = google.drive({ version: "v3", auth: oauth2Client });

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));

// Streamed to disk, not buffered in memory -- a multi-hundred-MB video
// held entirely in RAM would risk exhausting a small server's memory.
const upload = multer({ dest: os.tmpdir() });

function buildFileName(uploaderName, originalName) {
  const stamp = new Date()
    .toISOString()
    .replace("T", " ")
    .slice(0, 16)
    .replace(":", "h");
  const clean = String(uploaderName || "Onbekend")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  return `${clean} - ${stamp} - ${originalName}`;
}

app.post("/upload", upload.single("video"), async (req, res) => {
  const tempPath = req.file && req.file.path;
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: "Geen video ontvangen." });
    const uploaderName = (req.body.name || "").trim();
    if (!uploaderName) return res.status(400).json({ ok: false, error: "Naam ontbreekt." });

    const fileName = buildFileName(uploaderName, req.file.originalname);
    const driveRes = await drive.files.create({
      requestBody: { name: fileName, parents: [FOLDER_ID] },
      media: { mimeType: req.file.mimetype || "video/mp4", body: fs.createReadStream(tempPath) },
      fields: "id, size",
    });

    res.json({ ok: true, fileId: driveRes.data.id, size: Number(driveRes.data.size) });
  } catch (err) {
    console.error("upload failed:", err);
    res.status(500).json({ ok: false, error: "Upload mislukt op de server." });
  } finally {
    if (tempPath) fs.unlink(tempPath, () => {});
  }
});

app.get("/verify", async (req, res) => {
  try {
    const fileId = String(req.query.fileId || "");
    const expectedSize = req.query.expectedSize ? Number(req.query.expectedSize) : null;
    const driveRes = await drive.files.get({ fileId, fields: "id, size" });
    const size = Number(driveRes.data.size);
    res.json({ ok: !expectedSize || size === expectedSize, size });
  } catch (err) {
    res.json({ ok: false, error: "Bestand niet gevonden." });
  }
});

app.get("/", (req, res) => res.send("JJupload server running."));

app.listen(PORT, () => console.log("JJupload server listening on", PORT));
