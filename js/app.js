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
      </div>
    </div>
  `;
}

function renderLinkHero(link) {
  const hero = document.getElementById('linkHero');
  if (!hero || !link) return;
  const dateStr = formatDate(link.date);

  // Always show something below the title: prefer the written description,
  // fall back to the article's domain so there's always a snippet.
  let snippet = link.description || '';
  if (!snippet) {
    try { snippet = new URL(link.url).hostname.replace(/^www\./, ''); } catch {}
  }

  hero.innerHTML = `
    <div class="link-hero">
      <p class="link-hero-kicker">Just shared</p>
      <h2 class="link-hero-title">
        <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(link.title)}
        </a>
      </h2>
      <p class="link-hero-desc">${escapeHtml(snippet)}</p>
      ${dateStr ? `<p class="link-hero-meta">${escapeHtml(dateStr)}</p>` : ''}
    </div>
  `;
}

/**
 * Load links: most recent becomes the editorial hero, rest go into the list.
 */
async function loadLinks() {
  const listContainer = document.getElementById('linksList');
  if (!listContainer) return;

  try {
    const res = await fetch('./data/links.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const links = await res.json();

    if (!links || links.length === 0) {
      listContainer.innerHTML = '<p class="links-empty">No links yet.</p>';
      return;
    }

    const sorted = [...links].sort((a, b) =>
      a.date && b.date ? b.date.localeCompare(a.date) : 0
    );

    // Hero = most recent
    renderLinkHero(sorted[0]);

    // List = everything after the hero
    const rest = sorted.slice(1);
    const showToggle = rest.length > 5;
    listContainer.innerHTML = `
      <div class="links-list${showToggle ? ' links-collapsed' : ''}" id="linksListInner">
        ${rest.map(renderLinkItem).join('')}
      </div>
      ${showToggle ? `<button class="links-toggle" id="linksToggle">Show all ${rest.length} links ↓</button>` : ''}
    `;

    if (showToggle) {
      document.getElementById('linksToggle').addEventListener('click', function () {
        const list = document.getElementById('linksListInner');
        const collapsed = list.classList.toggle('links-collapsed');
        this.textContent = collapsed ? `Show all ${rest.length} links ↓` : 'Show less ↑';
      });
    }
  } catch (err) {
    console.error('Failed to load links:', err);
    listContainer.innerHTML = '<p class="links-empty">Could not load links.</p>';
  }
}

// ── Spotify ───────────────────────────────────────────────────────────────────

const SPOTIFY_RANGES = [
  { key: 'recent',      label: 'Recently Played' },
  { key: 'medium_term', label: '6 Months'        },
  { key: 'long_term',   label: 'All Time'         },
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
 * Render a 2×3 album art grid into #albumGrid, with a text range-switcher below.
 */
function renderMusicColumn(data) {
  const container = document.getElementById('albumGrid');
  if (!container) return;

  const hasRanges = data.recent !== undefined || data.short_term !== undefined;
  if (!hasRanges && (!data.updated_at || !(data.top_tracks || []).length)) {
    container.innerHTML = '<p class="spotify-loading">Listening data coming soon.</p>';
    return;
  }

  let activeKey = SPOTIFY_RANGES[0].key;

  function getTracks(key) {
    const rangeData = data[key] || data;
    return (rangeData.top_tracks || []).slice(0, 6);
  }

  function buildGrid(tracks) {
    if (!tracks.length) return '<p class="spotify-loading">No tracks yet.</p>';
    return `
      <div class="album-art-grid">
        ${tracks.map(t => `
          <a class="album-art-cell" href="${escapeHtml(t.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(t.name)} — ${escapeHtml(t.artist)}">
            ${t.image
              ? `<img src="${escapeHtml(t.image)}" alt="${escapeHtml(t.name)}" loading="lazy">`
              : '<div class="album-art-placeholder">♫</div>'
            }
            <div class="album-art-hover">
              <span class="album-art-track">${escapeHtml(t.name)}</span>
              <span class="album-art-artist">${escapeHtml(t.artist)}</span>
            </div>
          </a>
        `).join('')}
      </div>
    `;
  }

  function render() {
    const rangeLinks = SPOTIFY_RANGES.map(r => `
      <button class="music-range-btn${r.key === activeKey ? ' active' : ''}" data-range="${r.key}">
        ${escapeHtml(r.label)}
      </button>
    `).join('<span class="music-range-sep">·</span>');

    container.innerHTML = `
      ${buildGrid(getTracks(activeKey))}
      <div class="music-range-switcher">${rangeLinks}</div>
    `;

    container.querySelectorAll('.music-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeKey = btn.dataset.range;
        render();
      });
    });
  }

  render();
}

/**
 * Load and render spotify.json into the music column.
 */
async function loadSpotify() {
  const container = document.getElementById('albumGrid');
  if (!container) return;

  try {
    const res = await fetch('./data/spotify.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderMusicColumn(data);
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
  const collapsed = timeline.classList.toggle('timeline-collapsed');
  btn.textContent = collapsed ? 'Show full career ↓' : 'Show less ↑';
}

function toggleTimelineItem(item) {
  item.classList.toggle('open');
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
        text:         'https://patrickrbarry.com',
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
