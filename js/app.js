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

// ── Spotify ───────────────────────────────────────────────────────────────────

const SPOTIFY_RANGES = [
  { key: 'short_term',  label: 'This Month' },
  { key: 'medium_term', label: '6 Months'   },
  { key: 'long_term',   label: 'All Time'   },
];

/**
 * Return a human-readable "X hours ago" string from an ISO timestamp.
 */
function timeAgo(isoStr) {
  if (!isoStr) return null;
  const diff = Math.floor((Date.now() - new Date(isoStr)) / 1000);
  if (diff < 60)       return 'just now';
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Render tracks + artists for one time range into the existing containers.
 */
function renderRange(rangeData) {
  const { top_tracks = [], top_artists = [] } = rangeData;

  const tracksHtml = top_tracks.map((t, i) => `
    <a class="spotify-track" href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer">
      <span class="track-num">${i + 1}</span>
      ${t.image ? `<img class="track-art" src="${escapeHtml(t.image)}" alt="" loading="lazy">` : '<div class="track-art"></div>'}
      <span class="track-info">
        <span class="track-name">${escapeHtml(t.name)}</span>
        <span class="track-artist">${escapeHtml(t.artist)}</span>
      </span>
    </a>
  `).join('');

  const artistsHtml = top_artists.map(a => `
    <a class="spotify-artist" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">
      ${a.image ? `<img class="artist-photo" src="${escapeHtml(a.image)}" alt="${escapeHtml(a.name)}" loading="lazy">` : '<div class="artist-photo"></div>'}
      <span class="artist-name">${escapeHtml(a.name)}</span>
    </a>
  `).join('');

  document.getElementById('spotify-tracks-inner').innerHTML = tracksHtml;
  document.getElementById('spotify-artists-inner').innerHTML = top_artists.length ? `
    <p class="spotify-artists-label">Top Artists</p>
    <div class="spotify-artists">${artistsHtml}</div>
  ` : '';
}

/**
 * Render the Spotify section from spotify.json data.
 */
function renderSpotify(data) {
  const container = document.getElementById('spotifyData');
  if (!container) return;

  const hasRanges = data.short_term !== undefined;

  if (!hasRanges && (!data.updated_at || (data.top_tracks || []).length === 0)) {
    container.innerHTML = '<p class="spotify-pending">Spotify data will appear once the first sync runs.</p>';
    return;
  }

  const ago = timeAgo(data.updated_at);
  let activeRange = 'short_term';

  const tabsHtml = hasRanges ? `
    <div class="spotify-tabs">
      ${SPOTIFY_RANGES.map(r => `
        <button class="spotify-tab${r.key === activeRange ? ' active' : ''}" data-range="${r.key}">
          ${escapeHtml(r.label)}
        </button>
      `).join('')}
    </div>
  ` : '';

  container.innerHTML = `
    ${tabsHtml}
    <div class="spotify-tracks" id="spotify-tracks-inner"></div>
    <div id="spotify-artists-inner"></div>
    <div class="spotify-footer">
      ${ago ? `<span class="spotify-updated">Updated ${ago}</span>` : ''}
      <a class="spotify-logo" href="https://open.spotify.com" target="_blank" rel="noopener noreferrer">
        ♫ Spotify
      </a>
    </div>
  `;

  renderRange(hasRanges ? data[activeRange] : data);

  if (hasRanges) {
    container.querySelectorAll('.spotify-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        activeRange = btn.dataset.range;
        container.querySelectorAll('.spotify-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderRange(data[activeRange]);
      });
    });
  }
}

/**
 * Load and render spotify.json.
 */
async function loadSpotify() {
  const container = document.getElementById('spotifyData');
  if (!container) return;

  try {
    const res = await fetch('./data/spotify.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderSpotify(data);
  } catch (err) {
    console.error('Failed to load Spotify data:', err);
    container.innerHTML = '<p class="spotify-loading">Could not load listening data.</p>';
  }
}

// ── Career Timeline ───────────────────────────────────────────────────────────

function toggleTimeline() {
  const timeline = document.getElementById('careerTimeline');
  const btn = document.getElementById('timelineToggle');
  if (!timeline || !btn) return;
  const expanded = timeline.classList.toggle('timeline-collapsed');
  btn.textContent = expanded ? 'Show full timeline ↓' : 'Show less ↑';
}

// ── Books ─────────────────────────────────────────────────────────────────────

async function loadBooks() {
  const container = document.getElementById('booksList');
  if (!container) return;

  try {
    const res = await fetch('./data/books.json');
    if (!res.ok) throw new Error('Failed to load books');
    const data = await res.json();
    const books = data.reading || [];

    if (!books.length) {
      container.innerHTML = '<p class="links-empty">Nothing on the nightstand right now.</p>';
      return;
    }

    container.innerHTML = books.map((b) => {
      const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(b.title + ' ' + b.author)}`;
      return `
      <a class="book-item" href="${amazonUrl}" target="_blank" rel="noopener noreferrer">
        <div class="book-cover-wrap">
          ${b.cover_url
            ? `<img src="${escapeHtml(b.cover_url)}" alt="${escapeHtml(b.title)}" loading="lazy">`
            : `<div class="book-cover-placeholder">📖</div>`
          }
        </div>
        <div class="book-info">
          <div class="book-title">${escapeHtml(b.title)}</div>
          <div class="book-author">${escapeHtml(b.author)}</div>
          ${b.genre ? `<div class="book-genre">${escapeHtml(b.genre)}</div>` : ''}
        </div>
      </a>
    `}).join('');

  } catch (err) {
    console.error('Failed to load books:', err);
    container.innerHTML = '<p class="links-empty">Could not load reading list.</p>';
  }
}

// ── QR Code Modal ─────────────────────────────────────────────────────────────

function initQR() {
  const btn     = document.getElementById('qrBtn');
  const overlay = document.getElementById('qrOverlay');
  const closeBtn = document.getElementById('qrClose');
  const canvas  = document.getElementById('qrCanvas');
  if (!btn || !overlay || !canvas) return;

  let generated = false;

  function openQR() {
    overlay.hidden = false;
    if (!generated) {
      new QRCode(canvas, {
        text:         'https://patrickbarry.netlify.app',
        width:        200,
        height:       200,
        colorDark:    '#2a5298',
        colorLight:   '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
      });
      generated = true;
    }
  }

  function closeQR() { overlay.hidden = true; }

  btn.addEventListener('click', openQR);
  closeBtn.addEventListener('click', closeQR);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeQR(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeQR(); });
}

// ── Init ─────────────────────────────────────────────────────────────────────

function init() {
  loadLinks();
  loadSpotify();
  loadBooks();
  initQR();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
