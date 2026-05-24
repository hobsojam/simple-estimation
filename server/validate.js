const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script[^>]*>/gi;
const STYLE_RE = /<style\b[^>]*>[\s\S]*?<\/style[^>]*>/gi;
const TAG_RE = /<[^>]*>/g;

function stripTags(value) {
  let s = String(value).slice(0, 50_000);
  let prev;
  do {
    prev = s;
    s = s.replace(SCRIPT_RE, '').replace(STYLE_RE, '');
  } while (s !== prev);
  return s.replace(TAG_RE, '').replace(/</g, '');
}

function shortText(value, maxLen = 200) {
  if (value === undefined || value === null) return null;
  const s = stripTags(value).trim();
  if (!s) return null;
  return s.length > maxLen ? null : s;
}

module.exports = { shortText };
