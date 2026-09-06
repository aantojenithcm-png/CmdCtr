// Static reference/config data — the routing rulebook and department registry.
// This mirrors the front-end prototype's data exactly, but now it's the
// single source of truth: the client fetches this from the API rather than
// hardcoding it, so changing routing rules here changes the whole system.

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

// Public-safe fields only — this function is the entire "citizen data filter"
// described in the README. It never receives or returns department names,
// routing internals, or anything beyond these four fields.
function publicIncidentView(incident) {
  if (!incident) {
    return {
      active: false,
      alert: "No active alerts in your area.",
      nearestER: "Open",
      roadClosures: "None nearby",
      ambulanceETA: "—",
    };
  }
  return {
    active: true,
    alert: CITIZEN_MESSAGES[incident.typeId] || "An emergency is active in your area.",
    nearestER: "Open — see app for directions",
    roadClosures: incident.typeId === "flood" ? "1 nearby — rerouted" : "None nearby",
    ambulanceETA: incident.typeId === "medical" ? "~4 min through your street" : "—",
  };
}

module.exports = { DEPARTMENTS, EMERGENCY_TYPES, CITIZEN_MESSAGES, publicIncidentView };
