const nodes = new Map();

async function loadStatus() {
  const res = await fetch("/api/status", { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function renderMetrics(kpis) {
  const root = document.getElementById("metrics");
  const visible = kpis.slice(0, 6);
  root.innerHTML = visible
    .map(
      (kpi) => `
        <article class="metric">
          <span>${kpi.department_id}</span>
          <strong>${kpi.value}</strong>
          <small>${kpi.metric_code} · ${kpi.unit}</small>
        </article>
      `
    )
    .join("");
}

function renderHotspots(departments, kpis) {
  const root = document.getElementById("hotspots");
  const kpiMap = new Map(kpis.map((kpi) => [kpi.department_id, kpi]));
  nodes.clear();
  root.innerHTML = departments
    .map((department) => {
      const kpi = kpiMap.get(department.id);
      nodes.set(department.id, department);
      return `
        <button
          class="hotspot ${department.state.toLowerCase()}"
          style="left:${department.x}%;top:${department.y}%"
          aria-label="${department.name}: ${kpi ? `${kpi.value} ${kpi.unit}` : department.state}"
          title="${department.name}"
        ></button>
      `;
    })
    .join("");
}

function renderLines(lines) {
  const svg = document.getElementById("lineLayer");
  svg.innerHTML = "";
  for (const line of lines) {
    const from = nodes.get(line.from);
    const to = nodes.get(line.to);
    if (!from || !to) continue;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const midY = Math.min(from.y, to.y) - 4;
    path.setAttribute("d", `M ${from.x} ${from.y} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`);
    path.setAttribute("class", line.kind === "cc" ? "cc-line" : "handoff-line");
    svg.appendChild(path);
  }
}

function renderRobots(routes) {
  const root = document.getElementById("robots");
  root.innerHTML = routes
    .map((route, index) => {
      const from = nodes.get(route.from);
      const to = nodes.get(route.to);
      if (!from || !to) return "";
      const duration = route.duration || 12;
      const delay = route.delay || index * -1.4;
      return `
        <div
          class="delivery-robot bot-${index + 1}"
          style="--from-x:${from.x}%;--from-y:${from.y}%;--to-x:${to.x}%;--to-y:${to.y}%;--duration:${duration}s;--delay:${delay}s;--accent:${route.accent || "#20d17f"}"
          aria-label="${route.name || `Delivery robot ${index + 1}`}: ${from.name} to ${to.name}"
          title="${route.name || `Delivery robot ${index + 1}`}"
        >
          <span class="bot-shadow"></span>
          <span class="bot-head">
            <span class="bot-eye left"></span>
            <span class="bot-eye right"></span>
            <span class="bot-smile"></span>
          </span>
          <span class="bot-body">
            <span class="bot-core"></span>
            <span class="bot-arm left"></span>
            <span class="bot-arm right"></span>
            <span class="bot-parcel"></span>
          </span>
          <span class="bot-foot left"></span>
          <span class="bot-foot right"></span>
        </div>
      `;
    })
    .join("");
}

function renderStatus(data) {
  const sheet = data.sheet || {};
  setText("freshness", `${data.source_freshness} · ${data.generated_at_bkk}`);
  document.getElementById("systemStatus").innerHTML = `
    <dt>Business date</dt><dd>${data.business_date}</dd>
    <dt>Timezone</dt><dd>${data.timezone}</dd>
    <dt>Sheet</dt><dd>${sheet.status || "UNKNOWN"}</dd>
    <dt>Rows read</dt><dd>${sheet.rows_read ?? "-"}</dd>
    <dt>Notes</dt><dd>${(data.notes || []).join(" / ") || "No notes"}</dd>
  `;
}

function renderEvents(events) {
  const root = document.getElementById("events");
  root.innerHTML = events
    .slice(0, 12)
    .map(
      (event) => `
        <div class="event">
          <strong>${event.title}</strong>
          <span>${event.department_id} · ${event.metric_code} · ${event.receipt_status}</span>
        </div>
      `
    )
    .join("");
}

async function main() {
  try {
    const data = await loadStatus();
    renderMetrics(data.kpis || []);
    renderHotspots(data.departments || [], data.kpis || []);
    renderLines(data.light_lines || []);
    renderRobots(data.robot_routes || []);
    renderStatus(data);
    renderEvents(data.events || []);
  } catch (error) {
    setText("freshness", `API_ERROR · ${error.message}`);
  }
}

main();
setInterval(main, 60000);
