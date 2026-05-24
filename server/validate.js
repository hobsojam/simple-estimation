function stripTags(value) {
  return String(value)
    .slice(0, 50_000)
    .split('<')
    .map((chunk, i) => {
      if (i === 0) return chunk;
      const end = chunk.indexOf('>');
      return end === -1 ? chunk : chunk.slice(end + 1);
    })
    .join('');
}

function shortText(value, maxLen = 200) {
  if (value === undefined || value === null) return null;
  const s = stripTags(value).trim();
  if (!s) return null;
  return s.length > maxLen ? null : s;
}

module.exports = { shortText };
