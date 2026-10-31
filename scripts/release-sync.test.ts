// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Tests for the shell of .github/workflows/release-sync.yml's "Check the hand-off and take the
// branch" step. The step runs as GitHub runs it (bash -e, no pipefail), with git and gh replaced
// by stubs that log their arguments and answer as the remote would.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const WORKFLOW = ".github/workflows/release-sync.yml";

/** The `run: |` block of the step with this name, unindented. */
function stepScript(name: string): string {
  const lines = readFileSync(WORKFLOW, "utf8").split("\n");
  const at = lines.findIndex((l) => l.trim() === `- name: ${name}`);
  assert.notEqual(at, -1, `no step named ${name}`);
  const run = lines.findIndex((l, i) => i > at && l.trim() === "run: |");
  const indent = (lines[run + 1] ?? "").search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() !== "" && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

interface Remote {
  /** The branch's commit on the remote, or undefined when it has no such branch. */
  head?: string;
  /** ls-remote fails to reach the remote (exit 128). */
  unreachable?: boolean;
  /** Open pull requests from the branch. */
  open: number;
  /** Merged pull requests from the branch whose head was the branch's current commit. */
  merged?: number;
}

interface Result {
  status: number | null;
  output: string;
  calls: string[];
  env: string;
}

function takeBranch(remote: Remote, reuse = "false"): Result {
  const dir = mkdtempSync(join(tmpdir(), "release-sync-"));
  try {
    const log = join(dir, "calls.log");
    // `git ls-remote --exit-code` exits 2 when no ref matches.
    const lsRemote = remote.unreachable
      ? "exit 128"
      : remote.head === undefined
        ? "exit 2"
        : `printf '%s\\trefs/heads/%s\\n' ${remote.head} "$BRANCH"`;
    writeFileSync(
      join(dir, "git"),
      `#!/bin/bash\necho "git $*" >> "${log}"\nif [[ "$1" == ls-remote ]]; then ${lsRemote}; fi\n`,
    );
    writeFileSync(
      join(dir, "gh"),
      `#!/bin/bash\necho "gh $*" >> "${log}"\nif [[ "$*" == *"--state merged"* ]]; then echo ${remote.merged ?? 0}; else echo ${remote.open}; fi\n`,
    );
    chmodSync(join(dir, "git"), 0o755);
    chmodSync(join(dir, "gh"), 0o755);
    writeFileSync(join(dir, "env"), "");
    writeFileSync(log, "");
    const script = stepScript("Check the hand-off and take the branch");
    const run = spawnSync("bash", ["--noprofile", "--norc", "-e", "-c", script], {
      encoding: "utf8",
      env: {
        PATH: `${dir}:${process.env["PATH"] ?? ""}`,
        REPO: "vimma-browser/vimma-site",
        TAG: "v0.1.10",
        BRANCH: "release-sync/v0.1.10",
        REUSE: reuse,
        GITHUB_ENV: join(dir, "env"),
      },
    });
    return {
      status: run.status,
      output: run.stdout + run.stderr,
      calls: readFileSync(log, "utf8").split("\n").filter(Boolean),
      env: readFileSync(join(dir, "env"), "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const HEAD = "0123456789abcdef0123456789abcdef01234567";

test("take the branch: a release with no branch yet gets a new one", () => {
  const r = takeBranch({ open: 0 });
  assert.equal(r.status, 0, r.output);
  assert.doesNotMatch(r.output, /::error::/);
  assert.ok(r.calls.includes("git switch --quiet -c release-sync/v0.1.10"), r.calls.join("\n"));
  assert.equal(r.env, "");
});

test("take the branch: a remote that cannot be read stops the run", () => {
  const r = takeBranch({ unreachable: true, open: 0 });
  assert.equal(r.status, 1);
  assert.match(r.output, /::error::could not read release-sync\/v0\.1\.10 from the remote/);
  assert.ok(!r.calls.some((c) => c.startsWith("git switch")), r.calls.join("\n"));
});

test("take the branch: a branch left from a closed pull request stops the run", () => {
  const r = takeBranch({ head: HEAD, open: 0 });
  assert.equal(r.status, 1);
  assert.match(r.output, /::error::release-sync\/v0\.1\.10 exists without an open pull request/);
});

test("take the branch: a branch left from a merged pull request, at the commit it merged, is replaced under a lease", () => {
  const r = takeBranch({ head: HEAD, open: 0, merged: 1 });
  assert.equal(r.status, 0, r.output);
  assert.doesNotMatch(r.output, /::error::/);
  assert.equal(r.env, `LEASE=${HEAD}\n`);
  assert.ok(r.calls.includes("git switch --quiet -c release-sync/v0.1.10"), r.calls.join("\n"));
  assert.ok(r.calls.some((c) => c.includes("--state merged") && c.includes(HEAD)), r.calls.join("\n"));
});

test("take the branch: an open pull request's branch rebuilt on main is replaced under a lease", () => {
  const r = takeBranch({ head: HEAD, open: 1 });
  assert.equal(r.status, 0, r.output);
  assert.equal(r.env, `LEASE=${HEAD}\n`);
  assert.ok(r.calls.includes("git switch --quiet -c release-sync/v0.1.10"), r.calls.join("\n"));
});

test("take the branch: a reused branch is fetched", () => {
  const r = takeBranch({ head: HEAD, open: 1 }, "true");
  assert.equal(r.status, 0, r.output);
  assert.ok(r.calls.includes("git switch --quiet -c release-sync/v0.1.10 FETCH_HEAD"), r.calls.join("\n"));
  assert.equal(r.env, "");
});

// --- the `report` job: a stuck sync opens or updates an issue -----------------------------------

const ALERT = "release-sync: the site is not following Vimma's releases";
const RUN_URL = "https://github.com/vimma-browser/vimma-site/actions/runs/123";

interface Pr {
  number: number;
  headRefName: string;
  url: string;
  createdAt: string;
  isCrossRepository?: boolean;
  statusCheckRollup: { name?: string; context?: string; conclusion?: string | null; state?: string | null }[];
}

interface ReportRun {
  sync?: string;
  publish?: string;
  buildOk?: string;
  prs?: Pr[];
  issues?: { number: number; title: string }[];
}

interface ReportResult extends Result {
  summary: string;
  body: string;
}

function report(run: ReportRun): ReportResult {
  const dir = mkdtempSync(join(tmpdir(), "release-sync-"));
  try {
    const log = join(dir, "calls.log");
    // gh applies --jq itself; the stub runs the same expression with jq over the fixture.
    writeFileSync(join(dir, "prs.json"), JSON.stringify(run.prs ?? []));
    writeFileSync(join(dir, "issues.json"), JSON.stringify(run.issues ?? []));
    writeFileSync(
      join(dir, "gh"),
      [
        "#!/bin/bash",
        `echo "gh $*" >> "${log}"`,
        'q=""; prev=""',
        'for a in "$@"; do',
        '  [[ "$prev" == --jq ]] && q="$a"',
        `  [[ "$prev" == --body-file ]] && cp "$a" "${dir}/body.md"`,
        `  [[ "$prev" == --comment ]] && printf '%s' "$a" > "${dir}/body.md"`,
        '  prev="$a"',
        "done",
        'case "$1 $2" in',
        `  "pr list") jq -r "$q" "${dir}/prs.json" ;;`,
        `  "issue list") jq -r "$q" "${dir}/issues.json" ;;`,
        '  "issue create") echo "https://github.com/vimma-browser/vimma-site/issues/99" ;;',
        "esac",
        "",
      ].join("\n"),
    );
    chmodSync(join(dir, "gh"), 0o755);
    for (const f of ["summary.md", "body.md", "env"]) writeFileSync(join(dir, f), "");
    writeFileSync(log, "");
    const r = spawnSync("bash", ["--noprofile", "--norc", "-e", "-c", stepScript("Report a stuck sync")], {
      encoding: "utf8",
      env: {
        PATH: `${dir}:${process.env["PATH"] ?? ""}`,
        REPO: "vimma-browser/vimma-site",
        EVENT: "schedule",
        RUN_URL,
        SYNC_RESULT: run.sync ?? "success",
        PUBLISH_RESULT: run.publish ?? "skipped",
        BUILD_OK: run.buildOk ?? "",
        TAG: run.buildOk ? "v0.1.12" : "",
        GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
      },
    });
    return {
      status: r.status,
      output: r.stdout + r.stderr,
      calls: readFileSync(log, "utf8").split("\n").filter(Boolean),
      env: "",
      summary: readFileSync(join(dir, "summary.md"), "utf8"),
      body: readFileSync(join(dir, "body.md"), "utf8"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// GitHub gives times to the second
const hoursAgo = (h: number): string => new Date(Date.now() - h * 3600_000).toISOString().replace(/\.\d+Z$/, "Z");
const syncPr = (checks: Pr["statusCheckRollup"], createdAt = hoursAgo(0.2)): Pr => ({
  number: 48,
  headRefName: "release-sync/v0.1.12",
  url: "https://github.com/vimma-browser/vimma-site/pull/48",
  createdAt,
  statusCheckRollup: checks,
});
const issueCalls = (r: Result): string[] => r.calls.filter((c) => /^gh issue (create|edit|close|comment)/.test(c));

test("report: a good run with nothing stuck touches no issue", () => {
  const r = report({ prs: [syncPr([{ name: "build", conclusion: null, state: null }])], issues: [{ number: 3, title: "something else" }] });
  assert.equal(r.status, 0, r.output);
  assert.deepEqual(issueCalls(r), []);
});

test("report: a failed sync job opens an issue and links it from the run summary", () => {
  const r = report({ sync: "failure" });
  assert.equal(r.status, 1, r.output);
  assert.ok(r.calls.some((c) => c.startsWith("gh issue create") && c.includes(ALERT)), r.calls.join("\n"));
  assert.match(r.body, /`sync` job.*failure/);
  assert.ok(r.body.includes(RUN_URL), r.body);
  assert.match(r.summary, /issues\/99/);
  // an issue someone else opened with the same title is not the alert
  assert.ok(r.calls.some((c) => c.startsWith("gh issue list") && c.includes("--author app/github-actions")), r.calls.join("\n"));
  assert.match(r.output, /::error::.*issues\/99/);
});

test("report: a failed publish job updates the open issue instead of opening another", () => {
  const r = report({ publish: "failure", issues: [{ number: 3, title: "something else" }, { number: 7, title: ALERT }] });
  assert.equal(r.status, 1, r.output);
  assert.deepEqual(issueCalls(r).map((c) => c.split(" ").slice(0, 4).join(" ")), ["gh issue edit 7"]);
  assert.match(r.body, /`publish` job.*failure/);
  assert.match(r.summary, /issues\/7/);
});

test("report: a release the site does not build with is reported", () => {
  const r = report({ publish: "success", buildOk: "false" });
  assert.equal(r.status, 1, r.output);
  assert.match(r.body, /does not build with v0\.1\.12/);
});

test("report: a sync pull request with a failed check is reported", () => {
  const r = report({ prs: [syncPr([{ name: "build", conclusion: "FAILURE" }, { context: "Workers Builds", state: "SUCCESS" }])] });
  assert.equal(r.status, 1, r.output);
  assert.ok(r.body.includes("https://github.com/vimma-browser/vimma-site/pull/48"), r.body);
  assert.match(r.body, /build/);
});

test("report: a sync pull request still open after two hours is reported", () => {
  const r = report({ prs: [syncPr([{ name: "build", conclusion: "SUCCESS" }], hoursAgo(3))] });
  assert.equal(r.status, 1, r.output);
  assert.ok(r.body.includes("pull/48"), r.body);
});

test("report: other pull requests, and sync-named ones from forks, are not the sync's", () => {
  const other = { ...syncPr([{ name: "build", conclusion: "FAILURE" }], hoursAgo(30)), headRefName: "fix/something" };
  const fork = { ...syncPr([{ name: "build", conclusion: "ACTION_REQUIRED" }], hoursAgo(30)), isCrossRepository: true };
  const r = report({ prs: [other, fork] });
  assert.equal(r.status, 0, r.output);
  assert.deepEqual(issueCalls(r), []);
});

test("report: a good run closes the open issue", () => {
  const r = report({ publish: "success", buildOk: "true", issues: [{ number: 7, title: ALERT }] });
  assert.equal(r.status, 0, r.output);
  assert.deepEqual(issueCalls(r).map((c) => c.split(" ").slice(0, 4).join(" ")), ["gh issue close 7"]);
  assert.ok(r.body.includes(RUN_URL), r.body);
});
