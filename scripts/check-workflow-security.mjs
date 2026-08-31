import { readFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";

const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");

if (!/^permissions:\n {2}contents: read$/mu.test(workflow)) {
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

const attestJob = workflow.match(
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
if (!/if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/u.test(workflow)) {
  throw new Error("The privileged attestation job must be restricted to main pushes.");
}

process.stdout.write(`Workflow security verified (${actionUses.length} SHA-pinned Actions).\n`);
