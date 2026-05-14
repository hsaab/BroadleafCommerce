#!/usr/bin/env node

"use strict";

const fs = require("node:fs");

const ASK_RESPONSE = {
  permission: "ask",
  user_message:
    "This prompt appears to contain a private key, API token, or credential assignment. Do you want to send it anyway?",
  agent_message:
    "A hook detected possible credentials in the prompt. Do not quote or repeat the secret unless the user explicitly approves.",
};

const ALLOW_RESPONSE = { permission: "allow" };

const SECRET_PATTERNS = [
  {
    category: "private_key",
    regex: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/i,
  },
  {
    category: "github_token",
    regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{30,255}\b/,
  },
  {
    category: "github_token",
    regex: /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/,
  },
  {
    category: "slack_token",
    regex: /\bxox[abprs]-[A-Za-z0-9-]{20,}\b/,
  },
  {
    category: "api_token",
    regex: /\bsk-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    category: "cloud_access_key",
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
];

try {
  const input = fs.readFileSync(0, "utf8");
  const payload = parseJson(input);
  const promptText = collectPromptText(payload);
  const detection = detectSecret(promptText);

  if (detection) {
    writeJson(ASK_RESPONSE);
    process.exit(0);
  }

  writeJson(ALLOW_RESPONSE);
} catch {
  // This hook is fail-open by design so it never blocks prompt submission on parser bugs.
  writeJson(ALLOW_RESPONSE);
}

function parseJson(input) {
  if (input.trim().length === 0) {
    return {};
  }

  return JSON.parse(input);
}

function collectPromptText(payload) {
  const candidates = [];
  const likelyPromptKeys = new Set([
    "prompt",
    "message",
    "text",
    "input",
    "content",
    "userPrompt",
    "user_prompt",
  ]);

  collectLikelyStrings(payload, likelyPromptKeys, candidates, 0);

  if (candidates.length > 0) {
    return candidates.join("\n");
  }

  return typeof payload === "string" ? payload : "";
}

function collectLikelyStrings(value, likelyPromptKeys, candidates, depth) {
  if (value === null || value === undefined || depth > 5) {
    return;
  }

  if (typeof value === "string") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectLikelyStrings(item, likelyPromptKeys, candidates, depth + 1);
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && likelyPromptKeys.has(key)) {
      candidates.push(child);
      continue;
    }

    collectLikelyStrings(child, likelyPromptKeys, candidates, depth + 1);
  }
}

function detectSecret(promptText) {
  if (promptText.trim().length === 0) {
    return null;
  }

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(promptText)) {
      return pattern.category;
    }
  }

  return detectSecretAssignment(promptText) ?? detectCredentialedDatabaseUrl(promptText);
}

function detectSecretAssignment(promptText) {
  const assignmentPattern =
    /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API_KEY|ACCESS_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*[:=]\s*(.+?)\s*$/gim;

  for (const match of promptText.matchAll(assignmentPattern)) {
    const value = stripInlineComment(unquote(match[2].trim()));

    if (value.length > 0 && !isRedactedValue(value)) {
      return "env_secret_assignment";
    }
  }

  return null;
}

function detectCredentialedDatabaseUrl(promptText) {
  const databaseUrlPattern =
    /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?):\/\/([^:\s/@]+):([^@\s]+)@[^/\s]+/gi;

  for (const match of promptText.matchAll(databaseUrlPattern)) {
    const password = decodeURIComponent(match[2]);

    if (password.length > 0 && !isRedactedValue(password)) {
      return "database_url";
    }
  }

  return null;
}

function stripInlineComment(value) {
  return value.replace(/\s+#.*$/, "").trim();
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function isRedactedValue(value) {
  const normalized = value.trim().toLowerCase();

  if (normalized.length === 0) {
    return true;
  }

  if (/^(?:x+|\*+|_+|-+|\.{3,})$/.test(normalized)) {
    return true;
  }

  if (/\b(?:redacted|placeholder)\b/.test(normalized)) {
    return true;
  }

  if (/^(?:your|example|dummy|sample|test)[-_ ]?(?:api[-_ ]?key|token|secret|password)(?:[-_ ]?here)?$/.test(normalized)) {
    return true;
  }

  return [
    "<token>",
    "<secret>",
    "<password>",
    "<api-key>",
    "redacted",
    "xxxx",
    "xxxxx",
    "your-api-key-here",
    "your-token-here",
    "your-secret-here",
    "placeholder",
  ].includes(normalized);
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
