import { execFile } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const allowedLicenses = new Set(["Apache-2.0", "ISC", "LGPL-3.0-or-later", "MIT"]);

const { stdout } = await execFileAsync(pnpmCommand, ["licenses", "list", "--prod", "--json"], {
  cwd: new URL("../", import.meta.url),
  maxBuffer: 10 * 1024 * 1024,
});
const report = JSON.parse(stdout);
const observedLicenses = Object.keys(report).sort();
const rejected = observedLicenses.filter((license) => !allowedLicenses.has(license));

if (rejected.length > 0) {
  throw new Error(`Unreviewed production licenses: ${rejected.join(", ")}`);
}

process.stdout.write(`Production licenses reviewed: ${observedLicenses.join(", ")}.\n`);
