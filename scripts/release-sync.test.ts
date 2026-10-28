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
    writeFileSync(join(dir, "gh"), `#!/bin/bash\necho "gh $*" >> "${log}"\necho ${remote.open}\n`);
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
