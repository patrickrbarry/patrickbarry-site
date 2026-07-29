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
    pill.textContent = `${group} (${n})`;
    pill.addEventListener("click", () => {
      activeGroup = activeGroup === group ? null : group;
      renderPills();
      renderList();
    });
    pillsEl.appendChild(pill);
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
