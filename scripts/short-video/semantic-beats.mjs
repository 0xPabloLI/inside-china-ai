#!/usr/bin/env node
/**
 * semantic-beats CLI — validate the News SHOTBOOK beats in Scene Data (#733 S2).
 *
 * Usage:
 *   node scripts/short-video/semantic-beats.mjs --content <slug> [--json]
 *   node scripts/short-video/semantic-beats.mjs --check [--root <short-video dir>] [--json]
 *   node scripts/short-video/semantic-beats.mjs --highlight --content <slug> | --check [--json]
 *   node scripts/short-video/semantic-beats.mjs --highlight --write --content <slug>
 *   node scripts/short-video/semantic-beats.mjs --roles [--topic <id>]
 *   node scripts/short-video/semantic-beats.mjs --topics
 *
 * `--content` validates one pack and prints its beats; `--check` walks every
 * shipped pack (packs without beats are skipped, not failed); `--highlight`
 * reports the dry-run main-beat → texts.highlight decision; `--write` (with
 * `--content`) inserts the derived line into scene-data.mjs;
 * `--roles` prints the closed 26-role vocabulary; `--topic <id>` adds the
 * six news-topic profiles (#733 S3) as an authoring recommendation, never as
 * a validation failure.
 *
 * Exit codes: 0 valid; 1 a pack violates the contract or cannot be imported.
 * This is an authoring gate — it is not wired into render or preflight yet.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BEAT_SCHEMA_VERSION,
  NEWS_BEAT_ROLES,
  NEWS_BEAT_TOPIC_IDS,
  NEWS_BEAT_TOPIC_PROFILES,
  beatTopicProfile,
  deriveHighlight,
  NEWS_BEAT_ROLE_IDS,
  roleFitForTopic,
  validatePackBeats,
  writeHighlightToSource,
} from "./lib/semantic-beats.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

function parseArgs(args) {
  const value = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && index + 1 < args.length && !args[index + 1].startsWith("--")
      ? args[index + 1]
      : null;
  };
  return {
    content: value("content"),
    check: args.includes("--check"),
    highlight: args.includes("--highlight"),
    write: args.includes("--write"),
    roles: args.includes("--roles"),
    topics: args.includes("--topics"),
    topic: value("topic"),
    root: value("root") ?? SCRIPT_DIR,
    json: args.includes("--json"),
  };
}

function sceneFileFor(root, slug) {
  return join(root, "content", slug, "scene-data.mjs");
}

async function loadScenes(root, slug) {
  const sceneFile = sceneFileFor(root, slug);
  if (!existsSync(sceneFile)) throw new Error(`no scene-data.mjs for content "${slug}"`);
  const mod = await import(pathToFileURL(sceneFile).href);
  if (!Array.isArray(mod.scenes)) throw new Error(`content "${slug}" exports no scenes array`);
  return mod.scenes;
}

function shippedSlugs(root) {
  const contentRoot = join(root, "content");
  if (!existsSync(contentRoot)) throw new Error(`no content directory at ${contentRoot}`);
  return readdirSync(contentRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .filter((slug) => existsSync(join(contentRoot, slug, "scene-data.mjs")));
}

function formatErrors(slug, result) {
  return result.errors.map(
    (error) =>
      `${slug}${error.sceneId === null ? "" : ` scene ${error.sceneId}`}: ${error.code} — ${error.message}`,
  );
}

function offProfileRoles(profile) {
  const selected = new Set([...profile.main, ...profile.support]);
  return NEWS_BEAT_ROLE_IDS.filter((role) => !selected.has(role));
}

function printTopicProfile(topic, profile) {
  console.log(`${topic} — ${profile.label}`);
  console.log(`  main:    ${profile.main.join(", ")}`);
  console.log(`  support: ${profile.support.join(", ")}`);
  const other = offProfileRoles(profile);
  if (other.length > 0) console.log(`  other (legal, not a default): ${other.join(", ")}`);
}

/**
 * Advisory only: a beat role outside the topic's expected main/support set.
 * Returns `{sceneId, beatId, role, weight, fit, message}`.
 */
function topicAdvisories(scenes, topic) {
  const out = [];
  for (const scene of scenes) {
    for (const beat of scene?.beats ?? []) {
      const fit = roleFitForTopic(topic, beat.role);
      const mainMismatch = beat.weight === "main" && fit !== "main";
      const offProfile = fit === "off-profile";
      if (!mainMismatch && !offProfile) continue;
      out.push({
        sceneId: scene.id ?? null,
        beatId: beat.id,
        role: beat.role,
        weight: beat.weight,
        fit,
        message: mainMismatch
          ? `main beat "${beat.id}" uses "${beat.role}", not a main role for ${topic}`
          : `beat "${beat.id}" uses "${beat.role}", off-profile for ${topic}`,
      });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (
    args.topic &&
    !args.topics &&
    !args.roles &&
    !args.content &&
    !args.check &&
    !args.highlight
  ) {
    const profile = beatTopicProfile(args.topic);
    if (!profile) {
      console.error(`unknown topic "${args.topic}" (allowed: ${NEWS_BEAT_TOPIC_IDS.join(", ")})`);
      process.exitCode = 1;
      return;
    }
    if (args.json) {
      console.log(
        JSON.stringify({ schemaVersion: BEAT_SCHEMA_VERSION, topic: args.topic, profile }, null, 2),
      );
    } else {
      printTopicProfile(args.topic, profile);
    }
    return;
  }
  if (args.topics) {
    if (args.topic) {
      const profile = beatTopicProfile(args.topic);
      if (!profile) {
        console.error(`unknown topic "${args.topic}" (allowed: ${NEWS_BEAT_TOPIC_IDS.join(", ")})`);
        process.exitCode = 1;
        return;
      }
      if (args.json) {
        console.log(
          JSON.stringify(
            { schemaVersion: BEAT_SCHEMA_VERSION, topic: args.topic, profile },
            null,
            2,
          ),
        );
      } else {
        printTopicProfile(args.topic, profile);
      }
      return;
    }
    if (args.json) {
      console.log(
        JSON.stringify(
          { schemaVersion: BEAT_SCHEMA_VERSION, topics: NEWS_BEAT_TOPIC_PROFILES },
          null,
          2,
        ),
      );
    } else {
      console.log(
        `News SHOTBOOK topic profiles (${NEWS_BEAT_TOPIC_IDS.length}, schema v${BEAT_SCHEMA_VERSION}):`,
      );
      for (const id of NEWS_BEAT_TOPIC_IDS) printTopicProfile(id, NEWS_BEAT_TOPIC_PROFILES[id]);
    }
    return;
  }
  if (args.roles) {
    const profile = args.topic ? beatTopicProfile(args.topic) : null;
    if (args.topic && !profile) {
      console.error(`unknown topic "${args.topic}" (allowed: ${NEWS_BEAT_TOPIC_IDS.join(", ")})`);
      process.exitCode = 1;
      return;
    }
    if (args.json) {
      console.log(
        JSON.stringify(
          {
            schemaVersion: BEAT_SCHEMA_VERSION,
            roles: NEWS_BEAT_ROLES,
            ...(args.topic ? { topic: args.topic, profile } : {}),
          },
          null,
          2,
        ),
      );
    } else if (profile) {
      console.log(
        `News SHOTBOOK roles for ${args.topic} (${profile.label}, schema v${BEAT_SCHEMA_VERSION}):`,
      );
      for (const weight of ["main", "support"]) {
        console.log(`  ${weight}:`);
        for (const id of profile[weight]) {
          console.log(
            `    ${id.padEnd(12)} ${NEWS_BEAT_ROLES[id].label.padEnd(12)} ${NEWS_BEAT_ROLES[id].use}`,
          );
        }
      }
      const other = offProfileRoles(profile);
      if (other.length > 0) {
        console.log(`  other roles (legal, not a default): ${other.join(", ")}`);
      }
    } else {
      console.log(
        `News SHOTBOOK roles (${NEWS_BEAT_ROLE_IDS.length}, schema v${BEAT_SCHEMA_VERSION}):`,
      );
      for (const id of NEWS_BEAT_ROLE_IDS) {
        console.log(
          `  ${id.padEnd(12)} ${NEWS_BEAT_ROLES[id].label.padEnd(12)} ${NEWS_BEAT_ROLES[id].use}`,
        );
      }
      console.log(`\nTopic profiles: ${NEWS_BEAT_TOPIC_IDS.join(", ")}; see --topics.`);
    }
    return;
  }
  if (args.topic && !beatTopicProfile(args.topic)) {
    console.error(`unknown topic "${args.topic}" (allowed: ${NEWS_BEAT_TOPIC_IDS.join(", ")})`);
    process.exitCode = 1;
    return;
  }
  if (args.write && !args.highlight) {
    console.error("--write requires --highlight --content <slug>");
    process.exitCode = 1;
    return;
  }
  if (args.highlight) {
    if (!args.content && !args.check) {
      console.error(
        "usage: semantic-beats --highlight --content <slug> | --highlight --check [--json]",
      );
      process.exitCode = 1;
      return;
    }
    if (args.write && (!args.content || args.check)) {
      console.error(
        "--write requires --highlight --content <slug> and cannot be combined with --check",
      );
      process.exitCode = 1;
      return;
    }
    const targets = args.content ? [args.content] : shippedSlugs(args.root);
    const reports = [];
    for (const slug of targets) {
      let scenes;
      try {
        scenes = await loadScenes(args.root, slug);
      } catch (error) {
        reports.push({ slug, error: error.message });
        continue;
      }
      const scenesReport = scenes.map((scene) => ({
        sceneId: scene?.id ?? null,
        ...deriveHighlight(scene),
      }));
      reports.push({
        slug,
        scenes: scenesReport,
        ...(args.topic
          ? { topic: args.topic, advisories: topicAdvisories(scenes, args.topic) }
          : {}),
      });
    }
    if (args.write) {
      const report = reports.find((item) => item.scenes);
      if (report) {
        try {
          if (report.scenes.some((scene) => scene.status === "invalid-beats")) {
            throw Object.assign(new Error("invalid beats present; refusing to write"), {
              code: "highlight-write-refused",
            });
          }
          const file = sceneFileFor(args.root, report.slug);
          let source = readFileSync(file, "utf8");
          const pending = [];
          for (const scene of report.scenes) {
            if (scene.status !== "derived") continue;
            const updated = writeHighlightToSource(source, scene.sceneId, {
              field: scene.field,
              text: scene.text,
            });
            source = updated.source;
            pending.push(scene);
          }
          if (pending.length > 0) writeFileSync(file, source);
          for (const scene of pending) scene.written = true;
          report.written = pending.length;
        } catch (error) {
          report.writeError = error.message;
          process.exitCode = 1;
        }
      }
    }
    if (args.json) {
      console.log(JSON.stringify({ schemaVersion: BEAT_SCHEMA_VERSION, reports }, null, 2));
    } else {
      for (const report of reports) {
        if (report.error) {
          console.log(`✗ ${report.slug}: ${report.error}`);
          continue;
        }
        const lines = [];
        for (const scene of report.scenes) {
          if (scene.status === "no-main") continue;
          const where = `  scene ${scene.sceneId}`;
          if (scene.status === "derived")
            lines.push(
              `${where}: derived ${scene.field} ← ${JSON.stringify(scene.text)}` +
                `${scene.via === "screenAt" ? " (screenAt)" : ""}`,
            );
          else if (scene.status === "already-set")
            lines.push(`${where}: already-set ${scene.field ?? "?"} same=${scene.same}`);
          else if (scene.status === "missing")
            lines.push(
              `${where}: missing (no rendered field contains ${JSON.stringify(scene.text)})`,
            );
          else if (scene.status === "ambiguous-field")
            lines.push(`${where}: ambiguous-field (${scene.fields.join(", ")})`);
          else if (scene.status === "ambiguous-occurrence")
            lines.push(`${where}: ambiguous-occurrence in ${scene.field} (${scene.occurrences}×)`);
          else if (scene.status === "unsupported-field")
            lines.push(`${where}: unsupported-field ${scene.field} (renderer never annotates it)`);
          else if (scene.status === "invalid-beats")
            lines.push(`${where}: invalid-beats (${scene.errors.map((e) => e.code).join(", ")})`);
        }
        for (const advisory of report.advisories ?? []) {
          lines.push(
            `  scene ${advisory.sceneId} beat ${advisory.beatId}: ${advisory.message} (advisory)`,
          );
        }
        if (lines.length === 0 && !report.writeError && !(report.written > 0)) continue;
        console.log(`${report.slug}:`);
        for (const line of lines) console.log(line);
        if (report.writeError) console.log(`  write failed: ${report.writeError}`);
        else if (report.written > 0) console.log(`  wrote ${report.written} highlight(s)`);
      }
    }
    if (
      reports.some(
        (report) =>
          report.error ||
          report.writeError ||
          report.scenes?.some((scene) => scene.status === "invalid-beats"),
      )
    ) {
      process.exitCode = 1;
    }
    return;
  }

  if (!args.content && !args.check) {
    console.error("usage: semantic-beats --content <slug> | --check | --roles [--json]");
    process.exitCode = 1;
    return;
  }

  const targets = args.content ? [args.content] : shippedSlugs(args.root);
  const reports = [];
  for (const slug of targets) {
    let scenes;
    try {
      scenes = await loadScenes(args.root, slug);
    } catch (error) {
      reports.push({ slug, ok: false, error: error.message });
      continue;
    }
    const result = validatePackBeats(scenes);
    reports.push({
      slug,
      ...result,
      ...(args.topic ? { topic: args.topic, advisories: topicAdvisories(scenes, args.topic) } : {}),
    });
  }

  const failed = reports.filter((report) => !report.ok);
  if (args.json) {
    console.log(JSON.stringify({ schemaVersion: BEAT_SCHEMA_VERSION, reports }, null, 2));
  } else {
    for (const report of reports) {
      if (report.error) {
        console.log(`✗ ${report.slug}: ${report.error}`);
        continue;
      }
      const status = report.ok ? "✓" : "✗";
      const scope =
        report.beatCount === 0
          ? "no beats (opt-in, skipped)"
          : `${report.beatCount} beats across ${report.scenesWithBeats} scenes`;
      console.log(`${status} ${report.slug}: ${scope}`);
      if (!report.ok) {
        for (const line of formatErrors(report.slug, report)) console.log(`    ${line}`);
      }
      for (const advisory of report.advisories ?? []) {
        console.log(
          `    advisory: scene ${advisory.sceneId} beat ${advisory.beatId}: ${advisory.message}`,
        );
      }
    }
    if (failed.length > 0) console.log(`\n${failed.length}/${reports.length} pack(s) invalid`);
  }
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`semantic-beats failed: ${error.message}`);
  process.exitCode = 1;
});
