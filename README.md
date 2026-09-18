# Dework Virtual Office Dashboard

Railway-ready Node app for a 3D Dework Virtual Office dashboard.

## What It Does

- Shows the provided 3D Virtual Office image as the main control tower screen.
- Provides `/health` and `/api/status`.
- Attempts to read KPI rows from Google Sheet CSV/GViz.
- Shows `UNKNOWN` when the Sheet is not public or rows do not match the KPI event contract.
- Uses seed structure only as a system skeleton, not real business totals.

## Source Sheet

Default:

```text
GOOGLE_SHEET_ID=1RJglBDbDmFJ51SYHKcnN0VT5sa-C7-nEtMcvc3m_UeA
GOOGLE_SHEET_GID=0
BUSINESS_TIMEZONE=Asia/Bangkok
```

For live KPI monitoring, the sheet should expose rows similar to:

```text
event_id,business_date,department_id,metric_code,metric_value,unit,title,status,evidence_url
```

Accepted statuses:

- `accepted`
- `done`
- `ok`
- blank status

## Railway

Build command can be empty or `npm install`.

Start command:

```bash
npm start
```

Required env:

```text
GOOGLE_SHEET_ID
GOOGLE_SHEET_GID
BUSINESS_TIMEZONE
```

No secrets are required for public read mode. If Google auth is added later, keep credentials only in Railway variables.

## SOP Notes

- Dashboard is display only.
- KPI must come from accepted events with evidence.
- Missing data is `UNKNOWN`, not zero.
- CC/Handoff lines are separate from completed KPI.
