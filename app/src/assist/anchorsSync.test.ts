import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ANCHORS, type AnchorId } from "./anchors";
import { GUIDES } from "./guides";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Collects anchors actually placed in the UI source: `assist("...")` /
 * `assist(\`...\`)` calls and raw `data-assist="..."` attributes. Template
 * literals like `tools.${id}` become prefix patterns ("tools.").
 */
function collectPlacedAnchors(): { exact: Set<string>; prefixes: string[] } {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  for (const file of walk(SRC_DIR)) {
    // The registry itself must not count as a placement.
    if (file.endsWith(join("assist", "anchors.ts"))) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/assist\(\s*"([^"]+)"/g)) {
      exact.add(match[1]);
    }
    for (const match of text.matchAll(/assist\(\s*`([^`]+)`/g)) {
      const value = match[1];
      const dynamicAt = value.indexOf("${");
      if (dynamicAt === -1) exact.add(value);
      else prefixes.push(value.slice(0, dynamicAt));
    }
    // Ternary second branch of assist(cond ? "a" : "b") and raw attributes.
    for (const match of text.matchAll(/data-assist=\{?"([^"]+)"/g)) {
      exact.add(match[1]);
    }
    for (const match of text.matchAll(
      /assist\([^)]*?"([^"]+)"\s*:\s*"([^"]+)"/g,
    )) {
      exact.add(match[1]);
      exact.add(match[2]);
    }
  }
  return { exact, prefixes };
}

const placed = collectPlacedAnchors();
const isPlaced = (anchor: string): boolean =>
  placed.exact.has(anchor) ||
  placed.prefixes.some((prefix) => anchor.startsWith(prefix));

describe("assist anchors ↔ guides sync", () => {
  it("every anchor referenced by a guide step is placed in the UI source", () => {
    const missing: string[] = [];
    for (const guide of GUIDES) {
      for (const step of guide.steps) {
        if (step.anchor && !isPlaced(step.anchor)) {
          missing.push(`${guide.id}/${step.id} → ${step.anchor}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("every anchor referenced by a guide step exists in the registry", () => {
    const unknown: string[] = [];
    for (const guide of GUIDES) {
      for (const step of guide.steps) {
        if (step.anchor && !(step.anchor in ANCHORS)) {
          unknown.push(`${guide.id}/${step.id} → ${step.anchor}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("every registry anchor is placed somewhere in the UI source", () => {
    const orphans = (Object.keys(ANCHORS) as AnchorId[]).filter(
      (anchor) => !isPlaced(anchor),
    );
    expect(orphans).toEqual([]);
  });
});
