import { readdir, readFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const workflowsDirectory = new URL("../.github/workflows/", import.meta.url);
const workflowFiles = (await readdir(workflowsDirectory))
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
  .sort();
if (workflowFiles.length === 0) {
  throw new Error("No GitHub Actions workflows found.");
}
const workflows = await Promise.all(
  workflowFiles.map(async (file) => ({
    file,
    text: await readFile(new URL(file, workflowsDirectory), "utf8"),
  })),
);
const workflow = workflows.map(({ text }) => text).join("\n");
const ciWorkflow = workflows.find(({ file }) => file === "ci.yml")?.text;
if (ciWorkflow === undefined) {
  throw new Error("The required ci.yml workflow is missing.");
}

if (!/^permissions:\n {2}contents: read$/mu.test(ciWorkflow)) {
  throw new Error("CI must default GITHUB_TOKEN permissions to contents: read.");
}
if (/pull_request_target:|workflow_run:/u.test(workflow)) {
  throw new Error("CI must not execute untrusted code in a privileged trigger.");
}

const actionUses = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gmu)].map(
  (match) => match[1],
);
if (actionUses.length === 0) {
  throw new Error("CI does not declare any Actions.");
}
for (const action of actionUses) {
  if (!/@[0-9a-f]{40}$/u.test(action)) {
    throw new Error(`Action is not pinned to a full commit SHA: ${action}`);
  }
}

const attestJob = ciWorkflow.match(
  /attest-release-candidate:[\s\S]*?permissions:\n([\s\S]*?)\n {4}steps:/u,
);
if (
  attestJob === null ||
  !attestJob[1].includes("attestations: write") ||
  !attestJob[1].includes("contents: read") ||
  !attestJob[1].includes("id-token: write")
) {
  throw new Error("The main-only attestation job has incomplete explicit permissions.");
}
if (!/if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/u.test(ciWorkflow)) {
  throw new Error("The privileged attestation job must be restricted to main pushes.");
}

const publishWorkflow = workflows.find(({ file }) => file === "publish.yml")?.text;
if (publishWorkflow === undefined) {
  throw new Error("The Trusted Publisher workflow publish.yml is missing.");
}
if (!/^on:\n {2}release:\n {4}types:\n {6}- published$/mu.test(publishWorkflow)) {
  throw new Error("npm publishing must be restricted to published GitHub Releases.");
}
if (/pull_request_target:|workflow_run:|^ {2}push:|^ {2}pull_request:/mu.test(publishWorkflow)) {
  throw new Error("npm publishing must not run for privileged branch or untrusted-code triggers.");
}
const publishPermissions = publishWorkflow.match(
  /permissions:\n {6}contents: read\n {6}id-token: write\n {4}steps:/u,
);
if (publishPermissions === null) {
  throw new Error("npm publishing must grant only contents: read and id-token: write.");
}
if (!/npm publish [^\n]*--provenance/u.test(publishWorkflow)) {
  throw new Error("npm publishing must use npm provenance.");
}
if (!/registry-url: https:\/\/registry\.npmjs\.org/u.test(publishWorkflow)) {
  throw new Error("npm publishing must target the npm registry explicitly.");
}

process.stdout.write(
  `Workflow security verified (${actionUses.length} SHA-pinned Actions across ${workflowFiles.length} workflows).\n`,
);
