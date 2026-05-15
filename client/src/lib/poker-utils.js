export function getMajorityVote(participants) {
  const counts = {};
  for (const p of participants) {
    if (p.vote) counts[p.vote] = (counts[p.vote] || 0) + 1;
  }
  let max = 0;
  let majority = null;
  for (const [vote, count] of Object.entries(counts)) {
    if (count > max) { max = count; majority = vote; }
  }
  return majority;
}

export function buildCSV(doneItems) {
  const rows = ['Item,Estimate'];
  for (const item of doneItems) {
    rows.push(`"${item.label.replace(/"/g, '""')}",${item.estimate}`);
  }
  return rows.join('\n');
}
