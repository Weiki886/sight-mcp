import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const gateScript = path.join(repositoryRoot, "scripts", "check-docs-links.mjs");

const chineseReadme = [
  "# Sight MCP",
  "",
  "**语言 / Language：** 中文 · [English](README.en.md)",
  "",
];
const englishReadme = ["# Sight MCP", "", "**语言 / Language：** [中文](README.md) · English", ""];

interface GateResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

const temporaryRoots: string[] = [];

/** Builds a minimal repository shaped like ours so the gate can run against it. */
async function createFixture(
  documents: Readonly<Record<string, readonly string[]>>,
): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "sight-docs-gate-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await writeFile(path.join(root, "scripts", "check-docs-links.mjs"), await readFile(gateScript));

  for (const [relative, lines] of Object.entries(documents)) {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, `${lines.join("\n")}\n`);
  }

  return root;
}

async function runGate(root: string): Promise<GateResult> {
  try {
    const { stderr, stdout } = await execFileAsync(
      process.execPath,
      [path.join(root, "scripts", "check-docs-links.mjs")],
      { cwd: root },
    );
    return { code: 0, stderr, stdout };
  } catch (error) {
    const failure = error as { code?: number; stderr?: string; stdout?: string };
    return { code: failure.code ?? 1, stderr: failure.stderr ?? "", stdout: failure.stdout ?? "" };
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("documentation link gate", () => {
  it("accepts a consistent bilingual pair", async () => {
    const root = await createFixture({
      "README.md": chineseReadme,
      "README.en.md": englishReadme,
      "docs/specs/thing.md": [
        "# 规范",
        "",
        "**语言 / Language：** 中文 · [English](thing.en.md)",
        "",
        "见[配置](other.md)。",
      ],
      "docs/specs/thing.en.md": [
        "# Spec",
        "",
        "**语言 / Language：** [中文](thing.md) · English",
        "",
        "See [configuration](other.en.md).",
      ],
      "docs/specs/other.md": ["# 其他", "", "**语言 / Language：** 中文 · [English](other.en.md)"],
      "docs/specs/other.en.md": ["# Other", "", "**语言 / Language：** [中文](other.md) · English"],
    });

    const result = await runGate(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Documentation links verified (6 documents");
  });

  it("rejects a switch link that points at its own language", async () => {
    const root = await createFixture({
      "README.md": chineseReadme,
      "README.en.md": englishReadme,
      "docs/release/notes.md": [
        "# 说明",
        "",
        "**语言 / Language：** 中文 · [English](notes.en.md)",
      ],
      // Regression guard for the self-referencing switch link fixed in PR #29.
      "docs/release/notes.en.md": [
        "# Notes",
        "",
        "**语言 / Language：** [中文](notes.en.md) · English",
      ],
    });

    const result = await runGate(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("docs/release/notes.en.md:3");
    expect(result.stderr).toContain("switch link must target docs/release/notes.md");
  });

  it("rejects a body link that crosses languages", async () => {
    const root = await createFixture({
      "README.md": chineseReadme,
      "README.en.md": englishReadme,
      "docs/adr/one.md": [
        "# 决策",
        "",
        "**语言 / Language：** 中文 · [English](one.en.md)",
        "",
        "见[威胁模型](two.en.md)。",
      ],
      "docs/adr/one.en.md": ["# ADR", "", "**语言 / Language：** [中文](one.md) · English"],
      "docs/adr/two.md": ["# 威胁", "", "**语言 / Language：** 中文 · [English](two.en.md)"],
      "docs/adr/two.en.md": ["# Threat", "", "**语言 / Language：** [中文](two.md) · English"],
    });

    const result = await runGate(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Chinese document links across languages");
  });

  it("rejects dead relative links and reports a missing switch line", async () => {
    const root = await createFixture({
      "README.md": chineseReadme,
      "README.en.md": englishReadme,
      "docs/specs/gone.md": ["# 规范", "", "见[缺失](missing.md)。"],
      "docs/specs/gone.en.md": ["# Spec", "", "**语言 / Language：** [中文](gone.md) · English"],
    });

    const result = await runGate(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('dead link "missing.md"');
    expect(result.stderr).toContain("missing a");
  });

  it("ignores links inside fenced code blocks and external URLs", async () => {
    const root = await createFixture({
      "README.md": [
        ...chineseReadme,
        "参考[官方文档](https://example.com/a.md)。",
        "",
        "```md",
        "[示例](does-not-exist.en.md)",
        "```",
      ],
      "README.en.md": englishReadme,
    });

    const result = await runGate(root);

    expect(result.code).toBe(0);
  });

  it("passes against the real repository documentation", async () => {
    const { stdout } = await execFileAsync(process.execPath, [gateScript], { cwd: repositoryRoot });

    expect(stdout).toContain("Documentation links verified");
  });
});
