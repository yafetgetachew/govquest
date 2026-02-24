#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.join(rootDir, "surreal", "schema-and-seed.surql");

const input = fs.readFileSync(sourcePath, "utf8");
const blocks = findCreateBlocks(input);

let output = "";
let cursor = 0;
let taskOutputsAdded = 0;
let processMapLinksAdded = 0;
let taskMapLinksAdded = 0;

for (const block of blocks) {
  output += input.slice(cursor, block.bodyStart + 1);

  const before = block.body;
  const after = enrichBlock(block.kind, block.id, before);

  if (block.kind === "task") {
    if (!hasField(before, "output") && hasField(after, "output")) {
      taskOutputsAdded += 1;
    }
    if (!hasMapLink(before) && hasMapLink(after)) {
      taskMapLinksAdded += 1;
    }
  } else if (block.kind === "process") {
    if (!hasMapLink(before) && hasMapLink(after)) {
      processMapLinksAdded += 1;
    }
  }

  output += after;
  cursor = block.bodyEnd;
}

output += input.slice(cursor);
fs.writeFileSync(sourcePath, output, "utf8");

console.log(`Updated ${path.relative(process.cwd(), sourcePath)}`);
console.log(`Task output fields added: ${taskOutputsAdded}`);
console.log(`Task map links added: ${taskMapLinksAdded}`);
console.log(`Process map links added: ${processMapLinksAdded}`);

function enrichBlock(kind, id, body) {
  let enriched = body;
  const title = extractStringField(enriched, "title") ?? "";
  const description = extractStringField(enriched, "description") ?? "";
  const location = extractStringField(enriched, "location");

  if (kind === "task" && !hasField(enriched, "output")) {
    const taskOutput = inferTaskOutput({ id, title, description });
    enriched = insertFieldAfter(enriched, "description", `output: ${toQuoted(taskOutput)},`);
  }

  if (location && !hasMapLink(enriched)) {
    const mapUrl = buildGoogleMapSearchUrl(location);
    enriched = upsertMapLink(enriched, mapUrl);
  }

  return enriched;
}

function findCreateBlocks(text) {
  const blocks = [];
  const pattern = /CREATE\s+(process|task):([A-Za-z0-9_]+)\s+CONTENT\s*\{/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const kind = match[1];
    const id = match[2];
    const bodyStart = text.indexOf("{", match.index);
    if (bodyStart === -1) {
      continue;
    }

    const bodyEnd = findMatching(text, bodyStart, "{", "}");
    if (bodyEnd === -1) {
      continue;
    }

    blocks.push({
      kind,
      id,
      bodyStart,
      bodyEnd,
      body: text.slice(bodyStart + 1, bodyEnd),
    });
  }

  return blocks;
}

function findMatching(text, start, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = false;
      }

      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractStringField(body, fieldName) {
  const pattern = new RegExp(
    String.raw`(?:^|\n)\s*${escapeForRegex(fieldName)}\s*:\s*"((?:\\.|[^"\\])*)"`,
  );
  const match = body.match(pattern);
  if (!match) {
    return null;
  }

  return decodeQuotedValue(match[1]);
}

function decodeQuotedValue(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}

function hasField(body, fieldName) {
  const pattern = new RegExp(String.raw`(?:^|\n)\s*${escapeForRegex(fieldName)}\s*:`);
  return pattern.test(body);
}

function hasMapLink(body) {
  return /google\.com\/maps|maps\.app\.goo\.gl|openstreetmap\.org/i.test(body);
}

function insertFieldAfter(body, anchorField, fieldLine) {
  const anchorPattern = new RegExp(
    String.raw`(^|\n)([ \t]*)${escapeForRegex(anchorField)}\s*:\s*"((?:\\.|[^"\\])*)"\s*,?`,
    "m",
  );
  const anchorMatch = anchorPattern.exec(body);

  if (anchorMatch && anchorMatch.index !== undefined) {
    const leading = anchorMatch[1] ?? "";
    const indent = anchorMatch[2] ?? "  ";
    const lineStart = anchorMatch.index + (leading.length > 0 ? leading.length : 0);
    const lineEnd = body.indexOf("\n", lineStart);
    const safeLineEnd = lineEnd === -1 ? body.length : lineEnd;
    const originalLine = body.slice(lineStart, safeLineEnd);
    const normalizedLine = originalLine.trimEnd().endsWith(",") ? originalLine : `${originalLine},`;

    return `${body.slice(0, lineStart)}${normalizedLine}\n${indent}${fieldLine}${body.slice(safeLineEnd)}`;
  }

  const indent = detectObjectIndent(body);
  return `${body}\n${indent}${fieldLine}`;
}

function upsertMapLink(body, mapUrl) {
  const mapLink = `{ label: "Map (Google)", url: ${toQuoted(mapUrl)} }`;
  const linksMatch = body.match(/\n([ \t]*)links\s*:\s*\[/);

  if (linksMatch) {
    const linksMatchIndex = linksMatch.index ?? -1;
    const linksBracketOffset = linksMatch[0].lastIndexOf("[");
    const linksArrayStart = linksMatchIndex + linksBracketOffset;
    const linksArrayEnd = findMatching(body, linksArrayStart, "[", "]");

    if (linksArrayEnd === -1) {
      return body;
    }

    const linksIndent = linksMatch[1] ?? "  ";
    const itemIndent = `${linksIndent}  `;
    const arrayBody = body.slice(linksArrayStart + 1, linksArrayEnd);

    let updatedArrayBody;
    if (arrayBody.trim().length === 0) {
      updatedArrayBody = `\n${itemIndent}${mapLink}\n${linksIndent}`;
    } else {
      const trimmedRight = arrayBody.replace(/\s+$/u, "");
      const trailingWhitespace = arrayBody.slice(trimmedRight.length);
      const withComma = /,\s*$/u.test(trimmedRight) ? trimmedRight : `${trimmedRight},`;
      updatedArrayBody = `${withComma}\n${itemIndent}${mapLink}${trailingWhitespace}`;
    }

    return `${body.slice(0, linksArrayStart + 1)}${updatedArrayBody}${body.slice(linksArrayEnd)}`;
  }

  const locationLinePattern = /\n([ \t]*)location\s*:\s*"((?:\\.|[^"\\])*)"\s*,?/;
  const locationLineMatch = locationLinePattern.exec(body);
  if (!locationLineMatch || locationLineMatch.index === undefined) {
    return body;
  }

  const indent = locationLineMatch[1] ?? "  ";
  const insertion = [
    `\n${indent}links: [`,
    `\n${indent}  ${mapLink}`,
    `\n${indent}],`,
  ].join("");

  const locationLineStart = locationLineMatch.index + 1;
  const locationLineEnd = body.indexOf("\n", locationLineStart);
  const safeLocationLineEnd = locationLineEnd === -1 ? body.length : locationLineEnd;
  const locationLine = body.slice(locationLineStart, safeLocationLineEnd);
  const normalizedLocationLine = locationLine.trimEnd().endsWith(",")
    ? locationLine
    : `${locationLine},`;

  return `${body.slice(0, locationLineStart)}${normalizedLocationLine}${insertion}${body.slice(safeLocationLineEnd)}`;
}

function buildGoogleMapSearchUrl(location) {
  const query = `${location}, Ethiopia`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function inferTaskOutput({ id, title, description }) {
  const titleText = title.toLowerCase();
  const descriptionText = description.toLowerCase();
  const text = `${titleText} ${descriptionText}`;
  const lowerId = id.toLowerCase();

  if (/\b(pay|payment|fee|bank)\b/.test(text)) {
    return "Official payment receipt (bank slip or digital receipt).";
  }

  if (/\b(biometric|fingerprint|photo capture|iris)\b/.test(text)) {
    return "Biometric capture confirmation recorded by the service office.";
  }

  if (/\b(interview)\b/.test(text)) {
    return "Interview attendance record and officer note.";
  }

  if (/\b(inspect|inspection|site visit|survey)\b/.test(text)) {
    return "Inspection or site-visit report reference.";
  }

  if (/\b(verify|review|check|validate)\b/.test(text)) {
    return "Verified checklist entry or correction note.";
  }

  if (/\b(prepare|gather|obtain|bring)\b/.test(text)) {
    return "Prepared document package ready for the next submission step.";
  }

  if (/\b(track|follow[- ]?up)\b/.test(text) || /\b(application|approval)\s+status\b/.test(text)) {
    return "Status update reference from official tracking channels.";
  }

  if (/\b(submit|file|apply|application)\b/.test(text)) {
    return "Submission receipt or stamped application copy.";
  }

  if (/\b(book|appointment|schedule)\b/.test(text)) {
    return "Appointment confirmation with date, time, and reference number.";
  }

  if (/\b(collect|receive|pickup|issued?)\b/.test(text)) {
    if (/\b(passport)\b/.test(text) || lowerId.startsWith("passport_")) {
      return "Issued passport booklet and collection acknowledgment.";
    }
    if (/\b(license)\b/.test(text)) {
      return "Issued/renewed license document or card.";
    }
    if (/\b(permit)\b/.test(text)) {
      return "Approved permit document and decision reference.";
    }
    if (/\b(certificate|certified extract|extract)\b/.test(text)) {
      return "Issued certificate, certified extract, or official registry printout.";
    }
    if (/\b(card|id)\b/.test(text)) {
      return "Issued ID/card or verified identity credential.";
    }
    return "Issued document/card/certificate and collection acknowledgment.";
  }

  if (/\b(identity proof|address proof|supporting documents?|evidence)\b/.test(text)) {
    return "Accepted evidence package prepared and ready for verification.";
  }

  if (/\b(notar|affidavit|witness statement)\b/.test(text) || lowerId.startsWith("wan_")) {
    return "Signed and sealed notarized affidavit or witness statement.";
  }

  if (/\b(passport)\b/.test(titleText) || lowerId.startsWith("passport_")) {
    return "Passport process reference (application or issuance record).";
  }

  if (/\b(fayda|fin|national id)\b/.test(titleText) || lowerId.startsWith("fayda_")) {
    return "FIN/ID enrollment reference or credential activation confirmation.";
  }

  if (/\b(certificate|certified extract|extract)\b/.test(text)) {
    return "Issued certificate, certified extract, or official registry printout.";
  }

  if (/\b(card|id)\b/.test(text)) {
    return "Issued ID/card or verified identity credential.";
  }

  if (/\b(permit|license)\b/.test(text)) {
    return "Issued permit/license document or approval reference.";
  }

  return "Task completion acknowledgment (receipt, stamp, ticket, or reference).";
}

function detectObjectIndent(body) {
  const match = body.match(/\n([ \t]+)[A-Za-z0-9_]+\s*:/);
  return match?.[1] ?? "  ";
}

function toQuoted(value) {
  return JSON.stringify(value);
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
