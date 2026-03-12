const OWNER     = 'patrickrbarry';
const REPO      = 'patrickbarry-site';
const FILE_PATH = 'data/links.json';

// ── Helpers ───────────────────────────────────────────────────────────────

function githubHeaders(token) {
  return {
    Authorization:  `token ${token}`,
    Accept:         'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent':   'save-link-extension',
  };
}

function apiBase() {
  return `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
}

async function fetchLinks(token) {
  const res = await fetch(apiBase(), { headers: githubHeaders(token) });
  if (!res.ok) throw new Error(`GitHub fetch failed: ${res.status}`);
  const file  = await res.json();
  const links = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, '')))));
  return { links, sha: file.sha };
}

async function commitLinks(token, links, sha, message) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(links, null, 2) + '\n')));
  const res = await fetch(apiBase(), {
    method:  'PUT',
    headers: githubHeaders(token),
    body:    JSON.stringify({ message, content, sha }),
  });
  const data = await res.json();
  if (!res.ok || !data.commit) throw new Error(data.message || `Commit failed: ${res.status}`);
}

// ── View switching ────────────────────────────────────────────────────────

const VIEWS = ['setup', 'form', 'manage', 'success'];

function showView(id) {
  VIEWS.forEach((v) => {
    document.getElementById(v).hidden = (v !== id);
  });
  const isManage = id === 'manage';
  document.getElementById('manageBtn').textContent = isManage ? '← Save' : 'Manage';
  document.getElementById('error').hidden = true;
}

// ── Setup screen ──────────────────────────────────────────────────────────

function showSetup() { showView('setup'); }

document.getElementById('saveTokenBtn').addEventListener('click', () => {
  const token = document.getElementById('tokenInput').value.trim();
  if (!token) return;
  chrome.storage.local.set({ githubToken: token }, () => initSaveForm());
});

// ── Save form ─────────────────────────────────────────────────────────────

function initSaveForm() {
  showView('form');
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    document.getElementById('title').value = tab.title || '';
    document.getElementById('url').value   = tab.url   || '';
  });
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  const title       = document.getElementById('title').value.trim();
  const url         = document.getElementById('url').value.trim();
  const description = document.getElementById('description').value.trim();
  const tag         = document.getElementById('tag').value;
  const btn         = document.getElementById('saveBtn');
  const errorEl     = document.getElementById('error');

  errorEl.hidden = true;

  if (!title || !url) {
    errorEl.textContent = 'Title and URL are required.';
    errorEl.hidden = false;
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Saving…';

  chrome.storage.local.get('githubToken', async ({ githubToken }) => {
    if (!githubToken) { showSetup(); return; }

    try {
      const { links, sha } = await fetchLinks(githubToken);
      const newId = Math.max(0, ...links.map((l) => l.id || 0)) + 1;
      links.unshift({ id: newId, title, url, description, date: new Date().toISOString().split('T')[0], tag });
      await commitLinks(githubToken, links, sha, `add link: ${title.slice(0, 72)}`);
      showView('success');
    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong. Try again.';
      errorEl.hidden      = false;
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Save';
    }
  });
});

// ── Manage view ───────────────────────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadManageView() {
  const listEl  = document.getElementById('manageList');
  const errorEl = document.getElementById('error');
  listEl.innerHTML = '<p class="manage-loading">Loading…</p>';
  errorEl.hidden   = true;

  chrome.storage.local.get('githubToken', async ({ githubToken }) => {
    if (!githubToken) { showSetup(); return; }

    try {
      const { links } = await fetchLinks(githubToken);

      if (!links.length) {
        listEl.innerHTML = '<p class="manage-empty">No saved links yet.</p>';
        return;
      }

      listEl.innerHTML = links.map((l) => `
        <div class="manage-item" data-id="${l.id}">
          <div class="manage-item-title">${escapeHtml(l.title)}</div>
          <div class="manage-item-meta">
            <span class="manage-item-tag">${escapeHtml(l.tag || '')}</span>
            <span class="manage-item-date">${escapeHtml(l.date || '')}</span>
          </div>
          <button class="delete-btn" data-id="${l.id}" title="Remove this link">✕</button>
        </div>
      `).join('');

      listEl.querySelectorAll('.delete-btn').forEach((btn) => {
        btn.addEventListener('click', () => deleteLink(Number(btn.dataset.id)));
      });

    } catch (err) {
      errorEl.textContent = err.message || 'Could not load links.';
      errorEl.hidden = false;
    }
  });
}

async function deleteLink(id) {
  const errorEl = document.getElementById('error');
  errorEl.hidden = true;

  // Optimistically remove the row from the UI immediately
  const row = document.querySelector(`.manage-item[data-id="${id}"]`);
  if (row) {
    row.style.opacity = '0.4';
    row.style.pointerEvents = 'none';
  }

  chrome.storage.local.get('githubToken', async ({ githubToken }) => {
    try {
      const { links, sha } = await fetchLinks(githubToken);
      const removed = links.find((l) => l.id === id);
      const updated = links.filter((l) => l.id !== id);
      await commitLinks(githubToken, updated, sha, `remove link: ${(removed?.title || id).toString().slice(0, 72)}`);
      if (row) row.remove();
      if (!document.querySelectorAll('.manage-item').length) {
        document.getElementById('manageList').innerHTML = '<p class="manage-empty">No saved links yet.</p>';
      }
    } catch (err) {
      if (row) { row.style.opacity = ''; row.style.pointerEvents = ''; }
      errorEl.textContent = err.message || 'Delete failed. Try again.';
      errorEl.hidden = false;
    }
  });
}

document.getElementById('manageBtn').addEventListener('click', () => {
  const isManage = !document.getElementById('manage').hidden;
  if (isManage) {
    initSaveForm();
  } else {
    showView('manage');
    loadManageView();
  }
});

// ── Boot ──────────────────────────────────────────────────────────────────

chrome.storage.local.get('githubToken', ({ githubToken }) => {
  if (!githubToken) showSetup();
  else initSaveForm();
});
