const ENDPOINT = 'https://patrickbarry.netlify.app/.netlify/functions/add-link';
const SECRET   = 'qy6uXe2mVjQhjQnwIFzohwiHo9wnRj6c';

// Pre-fill title and URL from the active tab
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  document.getElementById('title').value = tab.title || '';
  document.getElementById('url').value   = tab.url   || '';
});

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

  try {
    const res = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, url, description, tag, secret: SECRET }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Error ${res.status}`);
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
