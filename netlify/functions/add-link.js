const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const LINK_SECRET  = process.env.LINK_SECRET;
const OWNER        = 'patrickrbarry';
const REPO         = 'patrickbarry-site';
const FILE_PATH    = 'data/links.json';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function github(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        method,
        headers: {
          Authorization:  `token ${GITHUB_TOKEN}`,
          'User-Agent':   'netlify-add-link',
          Accept:         'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { title, url, description = '', tag = 'reading', secret } = body;

  if (!LINK_SECRET || secret !== LINK_SECRET) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  if (!title || !url) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'title and url are required' }) };
  }

  // Fetch current links.json from GitHub
  const file = await github('GET', `/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`);
  if (!file.content) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Could not fetch links.json' }) };
  }

  const links = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));

  const newId = Math.max(0, ...links.map((l) => l.id || 0)) + 1;
  const newLink = {
    id:          newId,
    title:       title.trim(),
    url:         url.trim(),
    description: description.trim(),
    date:        new Date().toISOString().split('T')[0],
    tag,
  };

  links.unshift(newLink);

  const updated = Buffer.from(JSON.stringify(links, null, 2) + '\n').toString('base64');
  const result = await github('PUT', `/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`, {
    message: `add link: ${title.trim().slice(0, 72)}`,
    content: updated,
    sha:     file.sha,
  });

  if (!result.commit) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'GitHub commit failed', detail: result }) };
  }

  return {
    statusCode: 200,
    headers: CORS,
    body: JSON.stringify({ message: 'Saved!', link: newLink }),
  };
};
