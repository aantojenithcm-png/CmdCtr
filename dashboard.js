// ---------- Domain data (mirrors the routing + access-control model) ----------
const DEPARTMENTS = [
  { id: "traffic", name: "Traffic Police", icon: "traffic-light",
    full: ["Live signal control", "Congestion heatmap", "Officer dispatch", "Corridor override log"] },
  { id: "health", name: "Health / Ambulance", icon: "truck-medical",
    full: ["Ambulance GPS fleet", "Patient severity intake", "Hospital matching", "ETA broadcast"] },
  { id: "hospital", name: "Hospitals", icon: "hospital",
    full: ["ICU / bed inventory", "Specialist roster", "Incoming patient queue", "Diversion control"] },
  { id: "fire", name: "Fire & Rescue", icon: "fire-extinguisher",
    full: ["Vehicle dispatch", "Live incident feed", "Resource allocation", "Structural risk data"] },
  { id: "police", name: "Police", icon: "shield-halved",
    full: ["Scene security log", "Crowd control units", "Alternate route control", "Incident reports"] },
  { id: "municipal", name: "Municipal Corp.", icon: "city",
    full: ["Road condition database", "Closure orders", "Camera network", "Infrastructure faults"] },
  { id: "disaster", name: "Disaster Mgmt.", icon: "cloud-showers-heavy",
    full: ["Multi-incident coordination", "Shelter capacity", "Resource pooling", "Escalation control"] },
  { id: "transport", name: "Transport / RTO", icon: "car-side",
    full: ["Vehicle verification", "Violation flags", "Fleet compliance records"] },
];

const EMERGENCY_TYPES = [
  { id: "medical", label: "Medical emergency", severity: "standard", routes: ["traffic", "health", "hospital"] },
  { id: "fire", label: "Fire", severity: "standard", routes: ["fire", "traffic", "police", "hospital"] },
  { id: "accident", label: "Major road accident", severity: "standard", routes: ["police", "traffic", "fire", "health", "hospital"] },
  { id: "flood", label: "Flood / structural", severity: "elevated", routes: ["disaster", "municipal", "fire", "police", "hospital"] },
  { id: "mass", label: "Mass casualty event", severity: "critical", routes: DEPARTMENTS.map(d => d.id) },
];

const CITIZEN_MESSAGES = {
  medical: "Ambulance en route through your area — please clear the lane if signalled.",
  fire: "Fire response active nearby. Avoid the marked zone until cleared.",
  accident: "Major accident reported. Alternate routes suggested below.",
  flood: "Flood response active. Some roads are closed — check the list below.",
  mass: "Multiple emergency services active in your area. Follow official instructions.",
};

// ---------- State ----------
const state = {
  role: "command",
  incidents: [],   // { id, typeId, label, severity, routes, time, status }
  log: [],         // { id, text, time }
};

function activeIncident() {
  return state.incidents.find(i => i.status === "active") || null;
}

function triggerEmergency(typeId) {
  const type = EMERGENCY_TYPES.find(t => t.id === typeId);
  const id = `INC-${1000 + state.incidents.length}`;
  const time = new Date().toLocaleTimeString();
  const incident = { id, typeId, label: type.label, severity: type.severity, routes: type.routes, time, status: "active" };
  state.incidents = [incident, ...state.incidents.map(i => ({ ...i, status: "resolved" }))];
  state.log = [{ id: `${id}-log`, text: `${type.label} classified — routed to ${type.routes.length} departments`, time }, ...state.log];
  render();
}

function resolveIncident() {
  state.incidents = state.incidents.map(i => i.status === "active" ? { ...i, status: "resolved" } : i);
  state.log = [{ id: `resolve-${Date.now()}`, text: "Incident marked resolved", time: new Date().toLocaleTimeString() }, ...state.log];
  render();
}

function setRole(role) {
  state.role = role;
  render();
}

// ---------- Rendering ----------
function sevPillClass(sev) {
  return sev === "critical" ? "red" : sev === "elevated" ? "amber" : "teal";
}

function renderRail() {
  const rail = document.getElementById("rail-buttons");
  const options = [
    { id: "command", name: "Command Centre", icon: "tower-broadcast" },
    ...DEPARTMENTS.map(d => ({ id: d.id, name: d.name, icon: d.icon })),
    { id: "citizen", name: "Citizen", icon: "users" },
  ];
  rail.innerHTML = options.map(opt => `
    <button class="rail-btn ${state.role === opt.id ? "active" : ""}" data-role="${opt.id}">
      <span class="icon" data-icon="${opt.icon}"></span><span>${opt.name}</span>
    </button>
  `).join("");
  rail.querySelectorAll(".rail-btn").forEach(btn => {
    btn.addEventListener("click", () => setRole(btn.dataset.role));
  });
}

function renderCommand() {
  const inc = activeIncident();
  const triggerButtons = EMERGENCY_TYPES.map(t => `
    <button class="trigger-btn sev-${t.severity}" data-trigger="${t.id}">${t.label}</button>
  `).join("");

  const incidentCard = inc ? `
    <div class="dpanel accent">
      <div class="incident-top">
        <div>
          <span class="incident-id">${inc.id}</span>
          <span class="pill ${sevPillClass(inc.severity)}">${inc.severity}</span>
          <div class="incident-title">${inc.label}</div>
          <div class="incident-time">${inc.time}</div>
        </div>
        <button class="resolve-btn" id="resolve-btn">Mark resolved</button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:12px;">
        ${inc.routes.map(id => `<span class="pill teal">${DEPARTMENTS.find(d => d.id === id).name}</span>`).join("")}
      </div>
    </div>
  ` : "";

  const statusGrid = DEPARTMENTS.map(d => {
    const routed = inc && inc.routes.includes(d.id);
    return `
      <div class="status-tile ${routed ? "routed" : ""}">
        <span class="icon st-icon" data-icon="${d.icon}"></span>
        <div class="st-name">${d.name}</div>
        <div class="st-state">${routed ? "ROUTED" : "IDLE"}</div>
      </div>
    `;
  }).join("");

  const logRows = state.log.length ? state.log.map(e => `
    <div class="log-row"><span>${e.text}</span><span class="log-time">${e.time}</span></div>
  `).join("") : `<div style="font-size:13px; color:var(--muted);">No events yet. Trigger one above.</div>`;

  document.getElementById("main").innerHTML = `
    <div class="main-head">
      <h2>Command centre</h2>
      <div class="sub">Orchestrates routing. Cannot edit department data directly.</div>
    </div>
    <div class="dpanel">
      <div class="label-row">Classify and trigger an event</div>
      <div class="trigger-row">${triggerButtons}</div>
    </div>
    ${incidentCard}
    <div class="label-row" style="margin-top:8px;">Department status</div>
    <div class="status-grid">${statusGrid}</div>
    <div class="label-row">Event log</div>
    <div class="dpanel">${logRows}</div>
  `;

  document.querySelectorAll("[data-trigger]").forEach(btn => {
    btn.addEventListener("click", () => triggerEmergency(btn.dataset.trigger));
  });
  const resolveBtn = document.getElementById("resolve-btn");
  if (resolveBtn) resolveBtn.addEventListener("click", resolveIncident);
}

function renderDepartment(deptId) {
  const dept = DEPARTMENTS.find(d => d.id === deptId);
  const inc = activeIncident();
  const isRouted = inc && inc.routes.includes(dept.id);
  const others = inc ? inc.routes.filter(id => id !== dept.id) : [];

  const statusBlock = isRouted ? `
    <div class="dpanel accent-fill">
      <div style="font-size:12px; color:var(--teal); margin-bottom:4px;">ACTIVE — ${inc.id}</div>
      <div class="incident-title" style="margin-top:0;">${inc.label}</div>
    </div>
  ` : `
    <div class="dpanel"><div style="font-size:13px; color:var(--muted);">No active incident routed to this department.</div></div>
  `;

  const features = dept.full.map(f => `
    <div class="feature-item ${isRouted ? "on" : ""}"><span class="icon" data-icon="circle-check"></span>${f}</div>
  `).join("");

  const othersBlock = (inc && others.length) ? `
    <div class="label-row"><span class="icon" data-icon="eye"></span> Other departments involved — status only, no edit access</div>
    <div style="display:flex; flex-wrap:wrap; gap:6px;">
      ${others.map(id => `<span class="pill">${DEPARTMENTS.find(d => d.id === id).name} · active</span>`).join("")}
    </div>
  ` : "";

  document.getElementById("main").innerHTML = `
    <div class="main-head">
      <h2><span class="icon" data-icon="${dept.icon}" style="color:var(--teal); margin-right:10px;"></span>${dept.name}</h2>
      <div class="sub">Full access to your own tools. Read-only summary of other departments during shared incidents.</div>
    </div>
    ${statusBlock}
    <div class="label-row"><span class="icon" data-icon="lock"></span> Full feature access</div>
    <div class="feature-grid">${features}</div>
    ${othersBlock}
  `;
}

function renderCitizen() {
  const inc = activeIncident();
  const alertText = inc ? CITIZEN_MESSAGES[inc.typeId] : "No active alerts in your area.";
  const nearestER = inc ? "Open — see app for directions" : "Open";
  const roadClosures = (inc && inc.typeId === "flood") ? "1 nearby — rerouted" : "None nearby";
  const ambulanceETA = (inc && inc.typeId === "medical") ? "~4 min through your street" : "—";

  document.getElementById("main").innerHTML = `
    <div class="citizen-wrap">
      <div class="main-head">
        <h2>Citizen app</h2>
        <div class="sub">Only what you need to know — nothing internal to any department.</div>
      </div>
      <button class="sos-btn" id="sos-btn"><span class="icon" data-icon="triangle-exclamation"></span> Report an emergency</button>
      <div class="label-row"><span class="icon" data-icon="bell"></span> Alerts near you</div>
      <div class="dpanel" style="font-size:13.5px; line-height:1.6;">${alertText}</div>
      <div class="label-row"><span class="icon" data-icon="location-dot"></span> Public status</div>
      <div class="dpanel">
        <div class="pub-row"><span>Nearest ER</span><span>${nearestER}</span></div>
        <div class="pub-row"><span>Road closures</span><span>${roadClosures}</span></div>
        <div class="pub-row"><span>Ambulance ETA</span><span>${ambulanceETA}</span></div>
      </div>
      <div class="citizen-foot">Not visible to citizens: hospital bed counts, dispatch logs, internal department communications, other citizens' reports.</div>
    </div>
  `;

  document.getElementById("sos-btn").addEventListener("click", () => triggerEmergency("medical"));
}

function render() {
  renderRail();
  if (state.role === "command") renderCommand();
  else if (state.role === "citizen") renderCitizen();
  else renderDepartment(state.role);
  applyIcons(document);
}

render();
