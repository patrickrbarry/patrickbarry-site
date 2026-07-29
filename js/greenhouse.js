/**
 * Greenhouse Company Map
 * Fetches data/greenhouse.json (company + industry group only) and renders
 * a browsable, filterable list.
 */

const GROUP_ORDER = [
  "Modern Healthtech & Wellness",
  "Biotech & Life Sciences",
  "Enterprise AI & Automation",
  "AI/Dev Infrastructure, Security & Web3",
  "Fintech & Financial Infrastructure",
  "Climate, Energy & Materials",
  "Robotics, Aerospace & Frontier Deep Tech",
  "Consumer Lifestyle Apps",
  "Media & Content",
  "Marketplaces & Two-Sided Platforms",
  "Legal, Compliance & GovTech",
  "Unclassified",
];

// Same order and hex values as the private review tool's palette — validated
// for colorblind-safe adjacent separation (ring order = this array's order).
const GROUP_COLORS = [
  "#B26E1A", "#009699", "#BF614E", "#008DBB",
  "#948000", "#BB5D7D", "#567FCA", "#11976B",
  "#8670C3", "#658F39", "#A763A7", "#8A8F87",
];
const colorFor = (group) => GROUP_COLORS[GROUP_ORDER.indexOf(group)] || "#999";

let COMPANIES = [];
let activeGroup = null;
let query = "";

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function groupCounts() {
  const c = {};
  GROUP_ORDER.forEach(g => c[g] = 0);
  COMPANIES.forEach(co => { c[co.group] = (c[co.group] || 0) + 1; });
  return c;
}

function renderPills() {
  const counts = groupCounts();
  const pillsEl = document.getElementById("ghPills");
  pillsEl.innerHTML = "";
  GROUP_ORDER.forEach(group => {
    const n = counts[group] || 0;
    if (n === 0) return;
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "jump-pill" + (activeGroup === group ? " active" : "");
    pill.innerHTML = `<span class="dot" style="background:${colorFor(group)}"></span>${escapeHtml(group)} (${n})`;
    pill.addEventListener("click", () => {
      activeGroup = activeGroup === group ? null : group;
      renderPills();
      renderList();
    });
    pillsEl.appendChild(pill);
  });
  renderDonut(counts);
}

const DONUT_R = 40, DONUT_CX = 50, DONUT_CY = 50, DONUT_STROKE = 13, DONUT_GAP = 2.2;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;
const SVGNS = "http://www.w3.org/2000/svg";

function renderDonut(counts) {
  const svg = document.getElementById("ghDonut");
  const tip = document.getElementById("ghTip");
  svg.innerHTML = "";
  const total = COMPANIES.length;
  if (!total) return;

  let cumulative = 0;
  GROUP_ORDER.forEach(group => {
    const n = counts[group] || 0;
    if (n === 0) return;
    const frac = n / total;
    const rawLen = frac * DONUT_CIRC;
    const len = Math.max(rawLen - DONUT_GAP, 0.001);
    const dashoffset = DONUT_CIRC * (1 - cumulative) + DONUT_CIRC * 0.25;
    cumulative += frac;

    const circle = document.createElementNS(SVGNS, "circle");
    circle.setAttribute("cx", DONUT_CX);
    circle.setAttribute("cy", DONUT_CY);
    circle.setAttribute("r", DONUT_R);
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", colorFor(group));
    circle.setAttribute("stroke-width", DONUT_STROKE);
    circle.setAttribute("stroke-dasharray", `${len} ${DONUT_CIRC - len}`);
    circle.setAttribute("stroke-dashoffset", dashoffset);
    circle.setAttribute("tabindex", "0");
    circle.setAttribute("role", "img");
    circle.setAttribute("aria-label", `${group}: ${n} ${n === 1 ? "company" : "companies"}`);

    const show = (evt) => {
      tip.innerHTML = `${escapeHtml(group)} &mdash; <b>${n}</b>`;
      tip.classList.add("show");
      circle.classList.add("hover");
      const x = evt.clientX !== undefined ? evt.clientX : circle.getBoundingClientRect().left;
      const y = evt.clientY !== undefined ? evt.clientY : circle.getBoundingClientRect().top;
      tip.style.left = x + "px";
      tip.style.top = (y - 12) + "px";
    };
    const hide = () => {
      tip.classList.remove("show");
      circle.classList.remove("hover");
    };
    circle.addEventListener("pointermove", show);
    circle.addEventListener("pointerenter", show);
    circle.addEventListener("pointerleave", hide);
    circle.addEventListener("focus", show);
    circle.addEventListener("blur", hide);

    svg.appendChild(circle);
  });
}

function renderList() {
  const listEl = document.getElementById("ghList");
  const emptyEl = document.getElementById("ghEmpty");
  const q = query.trim().toLowerCase();

  let filtered = COMPANIES;
  if (activeGroup) filtered = filtered.filter(c => c.group === activeGroup);
  if (q) filtered = filtered.filter(c => c.name.toLowerCase().includes(q));

  if (filtered.length === 0) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const byGroup = {};
  filtered.forEach(c => {
    (byGroup[c.group] = byGroup[c.group] || []).push(c);
  });

  const groupsToShow = activeGroup ? [activeGroup] : GROUP_ORDER;

  listEl.innerHTML = groupsToShow
    .filter(g => byGroup[g] && byGroup[g].length)
    .map(g => {
      const items = byGroup[g].sort((a, b) => a.name.localeCompare(b.name));
      return `
        <div class="gh-group">
          <div class="gh-group-title">
            ${escapeHtml(g)}
            <span class="gh-group-count">${items.length}</span>
          </div>
          <div class="gh-company-grid">
            ${items.map(c => `<div class="gh-company">${escapeHtml(c.name)}</div>`).join("")}
          </div>
        </div>
      `;
    })
    .join("");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

async function init() {
  try {
    const res = await fetch("data/greenhouse.json", { cache: "no-store" });
    const data = await res.json();
    COMPANIES = data.companies || [];
    document.getElementById("ghCount").textContent = COMPANIES.length.toLocaleString();
    document.getElementById("ghDonutCount").textContent = COMPANIES.length.toLocaleString();
    document.getElementById("ghUpdated").textContent = formatDate(data.updated_at);
  } catch (err) {
    document.getElementById("ghEmpty").hidden = false;
    document.getElementById("ghEmpty").textContent = "Couldn't load the company list right now.";
    console.error(err);
    return;
  }

  renderPills();
  renderList();

  document.getElementById("ghSearch").addEventListener("input", (e) => {
    query = e.target.value;
    renderList();
  });
}

init();
