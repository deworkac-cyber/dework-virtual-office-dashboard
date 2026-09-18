import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");

const PORT = Number(process.env.PORT || 3000);
const SHEET_ID =
  process.env.GOOGLE_SHEET_ID || "1RJglBDbDmFJ51SYHKcnN0VT5sa-C7-nEtMcvc3m_UeA";
const SHEET_GID = process.env.GOOGLE_SHEET_GID || "0";
const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || "Asia/Bangkok";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body, null, 2));
}

function nowBangkok() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

function businessDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function parseCsv(csv) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const out = {};
    headers.forEach((header, index) => {
      out[header] = (row[index] || "").trim();
    });
    return out;
  });
}

function normalizeEvents(rows) {
  return rows
    .map((row, index) => {
      const departmentId = row.department_id || row.Department || row.department || "";
      const metricCode = row.metric_code || row.Metric || row.metric || "";
      const rawValue = row.metric_value || row.value || row.Value || row.count || "0";
      const value = Number(String(rawValue).replace(/,/g, "")) || 0;
      const status = (row.receipt_status || row.record_status || row.status || "").toLowerCase();
      const accepted = !status || ["accepted", "done", "ok", "true"].includes(status);
      return {
        event_id:
          row.event_id ||
          `${departmentId || "sheet"}-${row.business_date || businessDate()}-${metricCode || "metric"}-${index + 1}`,
        business_date: row.business_date || row.date || businessDate(),
        department_id: departmentId || "unmapped",
        lane_id: row.lane_id || "",
        metric_code: metricCode || "sheet_row",
        value,
        unit: row.unit || "event",
        title: row.title || row.metric_name || metricCode || "Sheet KPI row",
        evidence_url: row.evidence_url || row.url || "",
        receipt_status: accepted ? "ACCEPTED" : status.toUpperCase(),
        source: "google_sheet"
      };
    })
    .filter((event) => event.department_id && event.metric_code);
}

function aggregate(events) {
  const map = new Map();
  for (const event of events) {
    if (event.receipt_status !== "ACCEPTED") continue;
    const key = `${event.department_id}|${event.metric_code}|${event.unit}`;
    const current = map.get(key) || {
      department_id: event.department_id,
      metric_code: event.metric_code,
      unit: event.unit,
      value: 0,
      events: 0
    };
    current.value += event.value;
    current.events += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => a.department_id.localeCompare(b.department_id));
}

async function readSeed() {
  const seedPath = path.join(dataDir, "seed-status.json");
  const raw = await readFile(seedPath, "utf8");
  return JSON.parse(raw);
}

async function fetchSheetRows() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Google Sheet HTTP ${response.status}`);
  }
  const text = await response.text();
  if (text.includes("<!DOCTYPE html") || text.includes("Sign in")) {
    throw new Error("Google Sheet is not publicly readable as CSV");
  }
  return rowsToObjects(parseCsv(text));
}

async function buildStatus() {
  const seed = await readSeed();
  try {
    const sheetRows = await fetchSheetRows();
    const events = normalizeEvents(sheetRows);
    const aggregated = aggregate(events);
    return {
      ok: true,
      timezone: BUSINESS_TZ,
      business_date: businessDate(),
      generated_at: new Date().toISOString(),
      generated_at_bkk: nowBangkok(),
      source_freshness: events.length ? "FRESH" : "UNKNOWN",
      sheet: {
        id: SHEET_ID,
        gid: SHEET_GID,
        status: "CONNECTED",
        rows_read: sheetRows.length,
        events_read: events.length
      },
      departments: seed.departments,
      workflow: seed.workflow,
      kpis: aggregated,
      events,
      light_lines: seed.light_lines,
      notes: events.length
        ? []
        : ["Sheet connected but no recognizable KPI event rows were found."]
    };
  } catch (error) {
    return {
      ok: true,
      timezone: BUSINESS_TZ,
      business_date: businessDate(),
      generated_at: new Date().toISOString(),
      generated_at_bkk: nowBangkok(),
      source_freshness: "UNKNOWN",
      sheet: {
        id: SHEET_ID,
        gid: SHEET_GID,
        status: "UNAVAILABLE",
        reason: error.message
      },
      departments: seed.departments,
      workflow: seed.workflow,
      kpis: seed.kpis,
      events: seed.events,
      light_lines: seed.light_lines,
      notes: [
        "Google Sheet could not be read from the server. Showing seed structure, not business totals.",
        "Missing data is UNKNOWN, not zero."
      ]
    };
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const body = await readFile(filePath);
  res.writeHead(200, {
    "content-type": contentTypes[ext] || "application/octet-stream",
    "cache-control": ext === ".html" ? "no-store" : "public, max-age=300"
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/health") {
      json(res, 200, {
        ok: true,
        service: "dework-virtual-office-dashboard",
        timezone: BUSINESS_TZ,
        business_date: businessDate(),
        generated_at: new Date().toISOString()
      });
      return;
    }
    if (url.pathname === "/api/status" || url.pathname === "/api/kpis") {
      json(res, 200, await buildStatus());
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    json(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Dework Virtual Office Dashboard running on :${PORT}`);
});
