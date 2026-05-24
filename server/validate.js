const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const STYLE_RE = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
const TAG_RE = /<[^>]*>/g;

function stripTags(value) {
  const s = String(value).slice(0, 50_000);
  return s
    .replace(SCRIPT_RE, '')
    .replace(STYLE_RE, '')
    .replace(TAG_RE, '')
    .replace(/</g, '');
}

function shortText(value, maxLen = 200) {
  if (value === undefined || value === null) return null;
  const s = stripTags(value).trim();
  if (!s) return null;
  return s.length > maxLen ? null : s;
}

module.exports = { shortText };
