const SCRIPT_STYLE_RE = /<(script|style)[^>]*>[\s\S]*?<\/(script|style)>/gi;
const TAG_RE = /<[^>]*>/g;

function stripTags(value) {
  return String(value)
    .replace(SCRIPT_STYLE_RE, '')
    .replace(TAG_RE, '');
}

// Single-line fields: names, labels, room names
function shortText(value, maxLen = 200) {
  if (value === undefined || value === null) return null;
  const s = stripTags(value).trim();
  if (!s) return null;
  return s.length > maxLen ? null : s;
}

// Multi-line fields: descriptions, notes (reserved for future use)
function longText(value, maxLen = 2000) {
  if (value === undefined || value === null) return null;
  const s = stripTags(value).trim();
  if (!s) return null;
  return s.length > maxLen ? null : s;
}

module.exports = { shortText, longText };
