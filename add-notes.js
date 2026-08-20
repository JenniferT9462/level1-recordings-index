#!/usr/bin/env node
// Attaches a meeting notes link to a day's entry in recordings.json,
// then commits and pushes the change — so you never hand-edit the JSON
// (one typo there breaks the whole recordings feed, not just this link).
//
// Usage:
//   node add-notes.js
// Then follow the prompts: pick a recording, paste the notes link.

const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { execSync } = require("child_process");

const REPO_DIR = __dirname;
const JSON_PATH = path.join(REPO_DIR, "recordings.json");

function run(cmd) {
  return execSync(cmd, { cwd: REPO_DIR, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
}

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`Could not find ${JSON_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(JSON_PATH, "utf8");
  let recordings;
  try {
    recordings = JSON.parse(raw);
  } catch (err) {
    console.error("recordings.json is not valid JSON right now:", err.message);
    console.error("Fix that first — this script won't overwrite broken JSON.");
    process.exit(1);
  }

  if (!Array.isArray(recordings) || recordings.length === 0) {
    console.error("recordings.json has no entries yet — nothing to attach notes to.");
    process.exit(1);
  }

  // Most recent first, matching how the frontend sorts them.
  const sorted = [...recordings].sort((a, b) =>
    (b.start || "").localeCompare(a.start || "")
  );

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\nWhich recording should get a meeting notes link?\n");
  sorted.forEach((rec, i) => {
    const already = rec.notes ? "  [already has notes]" : "";
    console.log(`  ${i + 1}. ${rec.topic || rec.id}${already}`);
  });

  const choiceRaw = await rl.question(`\nEnter a number (1-${sorted.length}, default 1): `);
  const choice = parseInt(choiceRaw.trim(), 10) || 1;
  const target = sorted[choice - 1];

  if (!target) {
    console.error("That number isn't in the list.");
    rl.close();
    process.exit(1);
  }

  let notesUrl = (await rl.question("\nPaste the meeting notes link: ")).trim();
  rl.close();

  if (!/^https?:\/\//i.test(notesUrl)) {
    console.error("That doesn't look like a URL (should start with http:// or https://). Nothing changed.");
    process.exit(1);
  }

  // Mutate the original array (not the sorted copy) so we write back
  // in the same order the file was already in.
  const original = recordings.find((r) => r.id === target.id);
  original.notes = notesUrl;

  fs.writeFileSync(JSON_PATH, JSON.stringify(recordings, null, 2) + "\n", "utf8");
  console.log(`\nUpdated "${target.topic || target.id}" with the notes link.`);

  try {
    run("git add recordings.json");
    const label = target.topic || target.id;
    run(`git commit -m "Add meeting notes link for ${label.replace(/"/g, "'")}"`);
    run("git push");
    console.log("Committed and pushed. Students will see the notes link within a few minutes.");
  } catch (err) {
    console.error("\nCouldn't commit/push automatically:");
    console.error(err.stdout ? err.stdout.toString() : err.message);
    console.error("\nThe JSON file itself was still updated locally — you can commit and push it by hand.");
    process.exit(1);
  }
}

main();
