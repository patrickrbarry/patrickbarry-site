const OWNER     = 'patrickrbarry';
const REPO      = 'patrickbarry-site';
const FILE_PATH = 'data/links.json';

// ── Setup screen (first-run token entry) ──────────────────────────────────

function showSetup() {
  document.getElementById('setup').hidden   = false;
  document.getElementById('form').hidden    = true;
  document.getElementById('success').hidden = true;
}

document.getElementById('saveTokenBtn').addEventListener('click', () => {
  const token = document.getElementById('tokenInput').value.trim();
  if (!token) return;
  chrome.storage.local.set({ githubToken: token }, () => {
    document.getElementById('setup').hidden = true;
    initForm();
  });
});

// ── Main save form ────────────────────────────────────────────────────────

function initForm() {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    document.getElementById('title').value = tab.title || '';
    document.getElementById('url').value   = tab.url   || '';
  });
  document.getElementById('form').hidden = false;
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
      const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
      const headers = {
        Authorization:  `token ${githubToken}`,
        Accept:         'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent':   'save-link-extension',
      };

      // 1. Fetch current file
      const getRes = await fetch(apiBase, { headers });
      if (!getRes.ok) throw new Error(`GitHub fetch failed: ${getRes.status}`);
      const fileData = await getRes.json();

      // 2. Decode (handle UTF-8 correctly), prepend new link
      const links = JSON.parse(decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, '')))));
      const newId  = Math.max(0, ...links.map((l) => l.id || 0)) + 1;
      links.unshift({
        id:          newId,
        title,
        url,
        description,
        date:        new Date().toISOString().split('T')[0],
        tag,
      });

      // 3. Commit updated file
      const updated = btoa(unescape(encodeURIComponent(JSON.stringify(links, null, 2) + '\n')));
      const putRes  = await fetch(apiBase, {
        method:  'PUT',
        headers,
        body:    JSON.stringify({
          message: `add link: ${title.slice(0, 72)}`,
          content: updated,
          sha:     fileData.sha,
        }),
      });

      const putData = await putRes.json();
      if (!putRes.ok || !putData.commit) {
        throw new Error(putData.message || `Commit failed: ${putRes.status}`);
      }

      document.getElementById('form').hidden    = true;
      document.getElementById('success').hidden = false;

    } catch (err) {
      errorEl.textContent = err.message || 'Something went wrong. Try again.';
      errorEl.hidden      = false;
      btn.disabled        = false;
      btn.textContent     = 'Save';
    }
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────

chrome.storage.local.get('githubToken', ({ githubToken }) => {
  if (!githubToken) {
    showSetup();
  } else {
    initForm();
  }
});
