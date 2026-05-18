#!/usr/bin/env node
/**
 * Converts a Playwright JSON report to SonarQube Generic Test Execution XML.
 *
 * Usage: node convert-to-sonar.mjs <input.json> <output.xml> [path-prefix]
 *
 * path-prefix is prepended to each file path so paths are relative to the
 * project root rather than the Playwright config directory. Defaults to ''.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [,, inputPath, outputPath, filePrefix = ''] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: convert-to-sonar.mjs <input.json> <output.xml> [path-prefix]');
  process.exit(1);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function collectSpecs(suite, parentTitles = [], inheritedFile = undefined) {
  const file = inheritedFile ?? suite.file;
  const titles = suite.title ? [...parentTitles, suite.title] : parentTitles;
  const specs = [];

  for (const spec of (suite.specs ?? [])) {
    const run = spec.tests?.[0] ?? {};
    const errors = run.errors ?? [];
    specs.push({
      file: filePrefix + (file ?? 'unknown'),
      name: [...titles, spec.title].filter(Boolean).join(' > '),
      duration: Math.round(run.duration ?? 0),
      status: run.status ?? 'failed',
      message: errors.map(e => e.message ?? '').join(' ').split('\n')[0] || '',
    });
  }

  for (const child of (suite.suites ?? [])) {
    specs.push(...collectSpecs(child, titles, file));
  }

  return specs;
}

const data = JSON.parse(readFileSync(inputPath, 'utf-8'));
const allSpecs = (data.suites ?? []).flatMap(s => collectSpecs(s));

const byFile = new Map();
for (const spec of allSpecs) {
  if (!byFile.has(spec.file)) byFile.set(spec.file, []);
  byFile.get(spec.file).push(spec);
}

let xml = '<testExecutions version="1">\n';
for (const [file, specs] of byFile) {
  xml += `  <file path="${escapeXml(file)}">\n`;
  for (const { name, duration, status, message } of specs) {
    xml += `    <testCase name="${escapeXml(name)}" duration="${duration}"`;
    if (status === 'passed') {
      xml += '/>\n';
    } else if (status === 'skipped') {
      xml += '>\n      <skipped/>\n    </testCase>\n';
    } else {
      xml += `>\n      <failure message="${escapeXml(message || status)}"/>\n    </testCase>\n`;
    }
  }
  xml += '  </file>\n';
}
xml += '</testExecutions>\n';

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, xml, 'utf-8');
console.log(`Wrote ${allSpecs.length} test case(s) to ${outputPath}`);
