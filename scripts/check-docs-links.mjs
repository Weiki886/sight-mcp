import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const documentationDirectory = "docs";
const rootDocuments = ["README.md", "README.en.md"];
const englishSuffix = ".en.md";
const switchMarker = "语言 / Language";
const skippedLinkPrefixes = ["http://", "https://", "mailto:", "#"];

/**
 * Collects every reviewed Markdown document: both READMEs plus the docs tree.
 * Paths stay repository-relative so findings are stable across machines.
 */
async function collectDocuments() {
  const documents = [];

  for (const candidate of rootDocuments) {
    const absolute = path.join(repositoryRoot, candidate);
    const found = await stat(absolute).then(
      (entry) => entry.isFile(),
      () => false,
    );
    if (!found) {
      throw new Error(`Expected root document is missing: ${candidate}`);
    }
    documents.push(candidate);
  }

  const pending = [documentationDirectory];
  while (pending.length > 0) {
    const relativeDirectory = pending.pop();
    const entries = await readdir(path.join(repositoryRoot, relativeDirectory), {
      withFileTypes: true,
    }).catch((error) => {
      if (error.code === "ENOENT" && relativeDirectory === documentationDirectory) {
        return [];
      }
      throw error;
    });
    for (const entry of entries) {
      const relative = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) {
        pending.push(relative);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        documents.push(relative);
      }
    }
  }

  return documents.sort();
}

function isEnglishDocument(relativePath) {
  return relativePath.endsWith(englishSuffix);
}

/** Maps a document to its counterpart in the other language. */
function counterpartOf(relativePath) {
  return isEnglishDocument(relativePath)
    ? `${relativePath.slice(0, -englishSuffix.length)}.md`
    : `${relativePath.slice(0, -".md".length)}${englishSuffix}`;
}

/** Extracts inline Markdown links while ignoring fenced code blocks. */
function readLinks(contents) {
  const links = [];
  let insideFence = false;

  contents.split("\n").forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      insideFence = !insideFence;
      return;
    }
    if (insideFence) {
      return;
    }
    for (const match of line.matchAll(/\[(?<label>[^\]]*)\]\((?<target>[^)\s]+)\)/g)) {
      links.push({
        label: match.groups.label,
        target: match.groups.target,
        line: index + 1,
        isSwitchLine: line.includes(switchMarker),
      });
    }
  });

  return links;
}

const documents = await collectDocuments();
const knownDocuments = new Set(documents);
const findings = [];
let checkedLinks = 0;
let switchLines = 0;

for (const relativePath of documents) {
  const contents = await readFile(path.join(repositoryRoot, relativePath), "utf8");
  const english = isEnglishDocument(relativePath);
  const counterpart = counterpartOf(relativePath);
  const links = readLinks(contents);
  const switchLinks = links.filter((link) => link.isSwitchLine);

  // Every document must offer exactly one crossing link to its counterpart.
  if (switchLinks.length === 0) {
    findings.push(`${relativePath}: missing a "${switchMarker}" switch line`);
  } else if (switchLinks.length > 1) {
    findings.push(`${relativePath}: expected one switch link, found ${switchLinks.length}`);
  }
  if (!knownDocuments.has(counterpart)) {
    findings.push(`${relativePath}: missing its counterpart ${counterpart}`);
  }
  switchLines += switchLinks.length > 0 ? 1 : 0;

  for (const link of links) {
    if (skippedLinkPrefixes.some((prefix) => link.target.startsWith(prefix))) {
      continue;
    }

    const location = `${relativePath}:${link.line}`;
    const [targetPath] = link.target.split("#");
    if (targetPath === "") {
      continue;
    }
    if (path.posix.isAbsolute(targetPath) || /^[a-z][a-z0-9+.-]*:/i.test(targetPath)) {
      findings.push(`${location}: relative link expected, found "${link.target}"`);
      continue;
    }

    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(relativePath), targetPath),
    );
    checkedLinks += 1;

    const exists = await stat(path.join(repositoryRoot, resolved)).then(
      () => true,
      () => false,
    );
    if (!exists) {
      findings.push(`${location}: dead link "${link.target}"`);
      continue;
    }
    if (!resolved.endsWith(".md")) {
      continue;
    }

    // A switch line crosses languages; body links stay inside one language.
    if (link.isSwitchLine) {
      if (resolved !== counterpart) {
        findings.push(
          `${location}: switch link must target ${counterpart}, found "${link.target}"`,
        );
      }
      continue;
    }
    if (isEnglishDocument(resolved) !== english) {
      const expected = english ? "English" : "Chinese";
      findings.push(`${location}: ${expected} document links across languages: "${link.target}"`);
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`${findings.join("\n")}\n`);
  throw new Error(`Documentation link check failed with ${findings.length} finding(s)`);
}

process.stdout.write(
  `Documentation links verified (${documents.length} documents, ${switchLines} switch lines, ${checkedLinks} relative links).\n`,
);
