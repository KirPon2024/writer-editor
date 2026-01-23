#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const docsDir = path.join(repoRoot, "docs");
const contextPath = path.join(docsDir, "CONTEXT.md");
const worklogPath = path.join(docsDir, "WORKLOG.md");
const processPath = path.join(docsDir, "PROCESS.md");
const handoffPath = path.join(docsDir, "HANDOFF.md");

const tasksDir = path.join(docsDir, "tasks");
const featureTemplatePath = path.join(docsDir, "templates", "FEATURE_TZ.md");
const referencesDir = path.join(docsDir, "references");
const referenceProjectsDir = path.join(referencesDir, "projects");

const execFileAsync = promisify(execFile);

function formatDateYYYYMMDD(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, "\n");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function extractMdSection(markdown, heading) {
  const lines = normalizeNewlines(markdown).split("\n");
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex === -1) return null;

  let endIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("## ")) {
      endIndex = i;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join("\n").trim();
}

function stripFirstLineIfHeading(section, heading) {
  const lines = normalizeNewlines(section).split("\n");
  if (lines[0]?.trim() === heading) return lines.slice(1).join("\n").trim();
  return section.trim();
}

function extractLastDatedSection(markdown) {
  const text = normalizeNewlines(markdown);
  const matches = [...text.matchAll(/^## (\d{4}-\d{2}-\d{2})\s*$/gm)];
  if (matches.length === 0) return null;

  const last = matches[matches.length - 1];
  const startIndex = last.index ?? 0;
  const startLineEnd = text.indexOf("\n", startIndex);
  const contentStart = startLineEnd === -1 ? text.length : startLineEnd + 1;

  const nextMatch = text.slice(contentStart).match(/^## \d{4}-\d{2}-\d{2}\s*$/m);
  const contentEnd =
    nextMatch && nextMatch.index != null ? contentStart + nextMatch.index : text.length;

  return {
    date: last[1],
    body: text.slice(startIndex, contentEnd).trim(),
  };
}

async function listTaskFiles() {
  if (!(await fileExists(tasksDir))) return [];
  const entries = await fs.readdir(tasksDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .filter((entry) => entry.name.toLowerCase() !== "readme.md")
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function listReferenceFiles() {
  const files = [];

  if (await fileExists(referencesDir)) {
    const entries = await fs.readdir(referencesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(path.join(referencesDir, entry.name));
      }
    }
  }

  if (await fileExists(referenceProjectsDir)) {
    const entries = await fs.readdir(referenceProjectsDir, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      if (!entry.isFile() || !name.endsWith(".md")) continue;
      if (name === "_template.md") continue;
      files.push(path.join(referenceProjectsDir, entry.name));
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function extractTags(text) {
  const normalized = normalizeNewlines(text);
  const match = normalized.match(/^\s*-\s*Tags?:\s*(.+)\s*$/im)
    ?? normalized.match(/^\s*Tags?:\s*(.+)\s*$/im);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function buildTagTokenSet(tags) {
  const tokenSet = new Set();
  for (const tag of tags) {
    tokenSet.add(tag);
    for (const part of tag.split(/[-_\s/]+/g)) {
      const p = part.trim().toLowerCase();
      if (p.length >= 3) tokenSet.add(p);
    }
  }
  return tokenSet;
}

function extractSummaryBullets(text) {
  const normalized = normalizeNewlines(text);
  const match = normalized.match(/##\s+Summary[^\n]*\n([\s\S]*?)(\n##\s+|$)/i);
  if (!match) return [];
  return match[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .slice(0, 3);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeQuery(query) {
  const raw = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  if (!raw) return [];
  // Keep tokens >= 3 chars to avoid noise.
  return raw
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function printHelp() {
  // Keep output minimal so it stays readable in terminal logs.
  console.log(`craftsman brain

Usage:
  node scripts/brain.mjs status
  node scripts/brain.mjs handoff
  node scripts/brain.mjs log "<message>"
  node scripts/brain.mjs new-task [short-name] "<title>"
  node scripts/brain.mjs savepoint "<commit message>"
  node scripts/brain.mjs refs "<query>"

Notes:
  - status: prints a quick snapshot (CONTEXT + recent WORKLOG + tasks).
  - handoff: (re)generates docs/HANDOFF.md for onboarding a new agent.
  - log: appends a bullet under today's date in docs/WORKLOG.md.
  - new-task: creates docs/tasks/YYYY-MM-DD--short-name.md from FEATURE_TZ template.
  - savepoint: prints a safe git commit recipe for the current working tree.
  - refs: suggests relevant reference notes from docs/references based on keywords.
`);
}

async function gitIsAvailable() {
  try {
    await execFileAsync("git", ["--version"], { cwd: repoRoot });
    return true;
  } catch {
    return false;
  }
}

async function gitExec(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: repoRoot });
  return stdout;
}

function quoteForShell(message) {
  // Intentionally simple: good enough for typical commit messages.
  return `"${String(message).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function cmdStatus() {
  const today = formatDateYYYYMMDD();
  console.log(`Craftsman — status (${today})`);
  console.log("");
  console.log(`- CONTEXT: ${path.relative(repoRoot, contextPath)}`);
  console.log(`- WORKLOG: ${path.relative(repoRoot, worklogPath)}`);
  console.log(`- PROCESS: ${path.relative(repoRoot, processPath)}`);
  console.log(`- TASKS:   ${path.relative(repoRoot, tasksDir)}`);
  console.log("");

  const context = (await fileExists(contextPath)) ? await fs.readFile(contextPath, "utf8") : "";
  if (context) {
    const project = extractMdSection(context, "## Проект");
    const constraints = extractMdSection(context, "## Ключевые правила (MVP)");
    const perspective = extractMdSection(context, "## Перспектива (после MVP)");
    const nextSteps = extractMdSection(context, "## Следующие шаги (приоритет)");

    if (project) {
      console.log("== Проект ==");
      console.log(stripFirstLineIfHeading(project, "## Проект"));
      console.log("");
    }

    if (constraints) {
      console.log("== MVP правила ==");
      console.log(stripFirstLineIfHeading(constraints, "## Ключевые правила (MVP)"));
      console.log("");
    }

    if (nextSteps) {
      console.log("== Следующие шаги ==");
      console.log(stripFirstLineIfHeading(nextSteps, "## Следующие шаги (приоритет)"));
      console.log("");
    }

    if (perspective) {
      console.log("== Перспектива (после MVP) ==");
      console.log(stripFirstLineIfHeading(perspective, "## Перспектива (после MVP)"));
      console.log("");
    }
  } else {
    console.log("[WARN] docs/CONTEXT.md not found.");
    console.log("");
  }

  const worklog = (await fileExists(worklogPath)) ? await fs.readFile(worklogPath, "utf8") : "";
  const lastWorklog = worklog ? extractLastDatedSection(worklog) : null;
  if (lastWorklog) {
    console.log(`== WORKLOG: ${lastWorklog.date} ==`);
    console.log(stripFirstLineIfHeading(lastWorklog.body, `## ${lastWorklog.date}`));
    console.log("");
  } else {
    console.log("[WARN] docs/WORKLOG.md not found or has no date sections.");
    console.log("");
  }

  const tasks = await listTaskFiles();
  if (tasks.length === 0) {
    console.log("== Tasks ==");
    console.log("(no task files yet)");
    return;
  }

  console.log(`== Tasks (${tasks.length}) ==`);
  for (const filename of tasks.slice(-10)) {
    console.log(`- ${filename}`);
  }
  if (tasks.length > 10) {
    console.log(`(showing last 10; total: ${tasks.length})`);
  }
}

async function cmdHandoff() {
  const now = formatDateYYYYMMDD();
  const context = (await fileExists(contextPath)) ? await fs.readFile(contextPath, "utf8") : "";
  const worklog = (await fileExists(worklogPath)) ? await fs.readFile(worklogPath, "utf8") : "";
  const lastWorklog = worklog ? extractLastDatedSection(worklog) : null;
  const tasks = await listTaskFiles();

  const contextProject = context ? extractMdSection(context, "## Проект") : null;
  const contextConstraints = context ? extractMdSection(context, "## Ключевые правила (MVP)") : null;
  const contextPerspective = context ? extractMdSection(context, "## Перспектива (после MVP)") : null;
  const contextNextSteps = context ? extractMdSection(context, "## Следующие шаги (приоритет)") : null;

  const lines = [];
  lines.push("# HANDOFF (Craftsman)");
  lines.push("");
  lines.push(`_Generated: ${now}_`);
  lines.push("");
  lines.push("## Start Here");
  lines.push(`- Read: \`${path.relative(repoRoot, contextPath)}\``);
  lines.push(`- Process: \`${path.relative(repoRoot, processPath)}\``);
  lines.push(`- Recent changes: \`${path.relative(repoRoot, worklogPath)}\``);
  lines.push("");

  if (contextProject) {
    lines.push("## Snapshot: Проект");
    lines.push(stripFirstLineIfHeading(contextProject, "## Проект"));
    lines.push("");
  }
  if (contextConstraints) {
    lines.push("## Snapshot: MVP правила");
    lines.push(stripFirstLineIfHeading(contextConstraints, "## Ключевые правила (MVP)"));
    lines.push("");
  }
  if (contextNextSteps) {
    lines.push("## Snapshot: Следующие шаги");
    lines.push(stripFirstLineIfHeading(contextNextSteps, "## Следующие шаги (приоритет)"));
    lines.push("");
  }

  if (contextPerspective) {
    lines.push("## Snapshot: Перспектива (после MVP)");
    lines.push(stripFirstLineIfHeading(contextPerspective, "## Перспектива (после MVP)"));
    lines.push("");
  }

  if (lastWorklog) {
    lines.push(`## Recent WORKLOG (${lastWorklog.date})`);
    lines.push(stripFirstLineIfHeading(lastWorklog.body, `## ${lastWorklog.date}`));
    lines.push("");
  }

  lines.push("## Tasks");
  if (tasks.length === 0) {
    lines.push("- (no task files yet)");
  } else {
    for (const filename of tasks) {
      lines.push(`- \`docs/tasks/${filename}\``);
    }
  }
  lines.push("");

  lines.push("## Brain Commands");
  lines.push("- `npm run brain:status`");
  lines.push("- `npm run brain:handoff`");
  lines.push("- `npm run brain:log -- \"...\"`");
  lines.push("- `npm run brain:new-task -- \"...\"`");
  lines.push("- `npm run brain:savepoint -- \"...\"`");
  lines.push("- `npm run brain:refs -- \"...\"`");
  lines.push("");

  await ensureDir(docsDir);
  await fs.writeFile(handoffPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${path.relative(repoRoot, handoffPath)}`);
}

async function cmdLog(messageArgs) {
  const message = messageArgs.join(" ").trim();
  if (!message) {
    console.error("Missing message. Usage: node scripts/brain.mjs log \"<message>\"");
    process.exit(1);
  }

  const today = formatDateYYYYMMDD();
  const bullet = `- ${message}`;

  const existing = (await fileExists(worklogPath)) ? await fs.readFile(worklogPath, "utf8") : "";
  const text = normalizeNewlines(existing || "# WORKLOG (Craftsman)\n");
  const lines = text.endsWith("\n") ? text.split("\n").slice(0, -1) : text.split("\n");

  const headerLine = `## ${today}`;
  const startIndex = lines.findIndex((l) => l.trim() === headerLine);

  if (startIndex === -1) {
    lines.push("");
    lines.push(headerLine);
    lines.push(bullet);
    lines.push("");
    await fs.writeFile(worklogPath, lines.join("\n"), "utf8");
    console.log(`Appended to ${path.relative(repoRoot, worklogPath)} under ${today}`);
    return;
  }

  let insertIndex = lines.length;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith("## ")) {
      insertIndex = i;
      break;
    }
  }

  // Insert before the next date heading (or at EOF). Keep a blank line between sections.
  lines.splice(insertIndex, 0, bullet);
  await fs.writeFile(worklogPath, lines.join("\n") + "\n", "utf8");
  console.log(`Appended to ${path.relative(repoRoot, worklogPath)} under ${today}`);
}

function translitRuToLatin(input) {
  const map = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return [...input].map((ch) => {
    const lower = ch.toLowerCase();
    if (map[lower] != null) return map[lower];
    return ch;
  }).join("");
}

function slugify(input) {
  const ascii = translitRuToLatin(input);
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

async function cmdNewTask(args) {
  if (args.length === 0) {
    console.error("Usage: node scripts/brain.mjs new-task [short-name] \"<title>\"");
    process.exit(1);
  }

  let shortName = "";
  let title = "";

  if (args.length === 1) {
    title = args[0].trim();
    shortName = slugify(title);
  } else {
    shortName = slugify(args[0]);
    title = args.slice(1).join(" ").trim();
    if (!title) title = args[0].trim();
  }

  if (!shortName) shortName = "task";
  const date = formatDateYYYYMMDD();

  await ensureDir(tasksDir);
  const filename = `${date}--${shortName}.md`;
  const taskPath = path.join(tasksDir, filename);

  if (await fileExists(taskPath)) {
    console.error(`Task already exists: ${path.relative(repoRoot, taskPath)}`);
    process.exit(1);
  }

  const template = (await fileExists(featureTemplatePath))
    ? await fs.readFile(featureTemplatePath, "utf8")
    : "";
  if (!template) {
    console.error(`Missing template: ${path.relative(repoRoot, featureTemplatePath)}`);
    process.exit(1);
  }

  const headerLine = `# ТЗ для Codex: ${title || shortName}`;
  const createdLine = `<!-- created: ${date} -->`;

  const templateLines = normalizeNewlines(template).split("\n");
  if (templateLines[0]?.startsWith("# ТЗ для Codex:")) {
    templateLines[0] = headerLine;
    templateLines.splice(1, 0, "", createdLine);
  }

  await fs.writeFile(taskPath, templateLines.join("\n"), "utf8");
  console.log(`Created ${path.relative(repoRoot, taskPath)}`);
}

async function cmdSavepoint(args) {
  const message = args.join(" ").trim();
  if (!message) {
    console.error('Usage: node scripts/brain.mjs savepoint "<commit message>"');
    process.exit(1);
  }

  if (!(await gitIsAvailable())) {
    console.log("[WARN] git not found in PATH.");
    console.log("Suggested commands:");
    console.log(`- git status`);
    console.log(`- git add -p`);
    console.log(`- git commit -m ${quoteForShell(message)}`);
    return;
  }

  let isRepo = false;
  try {
    const out = await gitExec(["rev-parse", "--is-inside-work-tree"]);
    isRepo = out.trim() === "true";
  } catch {
    isRepo = false;
  }

  if (!isRepo) {
    console.log("[WARN] Not a git repository (or git cannot read repo).");
    console.log("Suggested commands:");
    console.log(`- git status`);
    console.log(`- git add -p`);
    console.log(`- git commit -m ${quoteForShell(message)}`);
    return;
  }

  const status = (await gitExec(["status", "--porcelain"])).trimEnd();
  const hasChanges = status.length > 0;

  console.log("Git savepoint checklist:");
  console.log(`- Commit message: ${message}`);
  console.log("");

  if (!hasChanges) {
    console.log("Working tree is clean. Nothing to commit.");
    return;
  }

  const diffStat = (await gitExec(["diff", "--stat"])).trimEnd();
  if (diffStat) {
    console.log("Diff summary:");
    console.log(diffStat);
    console.log("");
  }

  console.log("Suggested commands (safe default):");
  console.log(`- git status`);
  console.log(`- git add -p`);
  console.log(`- git commit -m ${quoteForShell(message)}`);
  console.log("");
  console.log("Tip: keep commits small and stage-by-stage; run quick checks before committing.");
}

async function cmdRefs(args) {
  const query = args.join(" ").trim();
  if (!query) {
    console.error('Usage: node scripts/brain.mjs refs "<query>"');
    process.exit(1);
  }

  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    console.log("No useful keywords found in query.");
    return;
  }

  const files = await listReferenceFiles();
  if (files.length === 0) {
    console.log("No reference files found under docs/references.");
    return;
  }

  const results = [];
  for (const filePath of files) {
    const text = await fs.readFile(filePath, "utf8");
    const lower = text.toLowerCase();
    const tags = extractTags(text);
    const tagTokens = buildTagTokenSet(tags);
    const summary = extractSummaryBullets(text);

    let score = 0;
    for (const token of tokens) {
      if (tags.includes(token)) score += 10;
      else if (tagTokens.has(token)) score += 6;
      const re = new RegExp(escapeRegExp(token), "g");
      const matches = lower.match(re);
      score += matches ? matches.length : 0;
    }

    if (score > 0) {
      results.push({ filePath, score, tags, summary });
    }
  }

  results.sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath));

  console.log(`Reference suggestions for: "${query}"`);
  console.log("");

  const top = results.slice(0, 8);
  if (top.length === 0) {
    console.log("(no matches)");
    console.log("");
    console.log("Tip: try keywords like \"search\", \"history\", \"export\", \"outline\", \"toolbar\".");
    return;
  }

  for (const item of top) {
    const rel = path.relative(repoRoot, item.filePath);
    const tagsLine = item.tags.length ? `tags: ${item.tags.slice(0, 10).join(", ")}` : "tags: (none)";
    console.log(`- ${rel} (score: ${item.score}, ${tagsLine})`);
    for (const b of item.summary) console.log(`  ${b}`);
  }

  console.log("");
  console.log("Next: open the most relevant note(s) and link them in your task TЗ.");
}

async function main() {
  const [, , cmd, ...args] = process.argv;

  if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
    printHelp();
    return;
  }

  if (cmd === "status") {
    await cmdStatus();
    return;
  }

  if (cmd === "handoff") {
    await cmdHandoff();
    return;
  }

  if (cmd === "log") {
    await cmdLog(args);
    return;
  }

  if (cmd === "new-task") {
    await cmdNewTask(args);
    return;
  }

  if (cmd === "savepoint") {
    await cmdSavepoint(args);
    return;
  }

  if (cmd === "refs") {
    await cmdRefs(args);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printHelp();
  process.exit(1);
}

await main();
