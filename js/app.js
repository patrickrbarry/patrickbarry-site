/**
 * Patrick Barry — Personal Site
 * Fetches links.json and renders the Links section
 */

const TAG_LABELS = {
  work: 'Work',
  reading: 'Reading',
  startup: 'Startup',
  tools: 'Tools',
  misc: 'Misc'
};

/**
 * Format ISO date string to readable month/year
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00'); // Avoid timezone shift
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

/**
 * Render a single link item
 */
function renderLinkItem(link) {
  const tagLabel = TAG_LABELS[link.tag] || link.tag || '';
  const dateStr = formatDate(link.date);

  return `
    <div class="link-item">
      <div class="link-body">
        <a class="link-title" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(link.title)}
        </a>
        ${link.description ? `<p class="link-description">${escapeHtml(link.description)}</p>` : ''}
      </div>
      <div class="link-meta">
        ${dateStr ? `<span class="link-date">${escapeHtml(dateStr)}</span>` : ''}
        ${tagLabel ? `<span class="link-tag">${escapeHtml(tagLabel)}</span>` : ''}
      </div>
    </div>
  `;
}

/**
 * Load links from JSON and render them into #linksList
 */
async function loadLinks() {
  const container = document.getElementById('linksList');
  if (!container) return;

  try {
    const res = await fetch('./data/links.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const links = await res.json();

    if (!links || links.length === 0) {
      container.innerHTML = '<p class="links-empty">No links yet.</p>';
      return;
    }

    // Sort newest first
    const sorted = [...links].sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date);
      return 0;
    });

    container.innerHTML = `
      <div class="links-list">
        ${sorted.map(renderLinkItem).join('')}
      </div>
    `;
  } catch (err) {
    console.error('Failed to load links:', err);
    container.innerHTML = '<p class="links-empty">Could not load links.</p>';
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadLinks);
} else {
  loadLinks();
}
