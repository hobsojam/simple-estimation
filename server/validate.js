const TAG_RE = /<[^>]*>/g;

function stripTags(value) {
  return String(value).slice(0, 50_000).replace(TAG_RE, '').replace(/</g, '');
}

function shortText(value, maxLen = 200) {
  if (value === undefined || value === null) return null;
  const s = stripTags(value).trim();
  if (!s) return null;
  return s.length > maxLen ? null : s;
}

module.exports = { shortText };
