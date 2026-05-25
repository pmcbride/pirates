/**
 * AI art generation pipeline for Sea of Codes (Phase B2).
 *
 * Usage:
 *   node --import tsx scripts/generate-art.ts \
 *     --prompt "Top-down 2D pirate ship sprite..." \
 *     --out art/generated/ship-v1.png \
 *     --size 1024x1024 \
 *     --quality high
 *
 * Reads OPENAI_API_KEY from .env (this worktree, the repo root, or the parent
 * Pirates checkout — searched in that order). Tries `gpt-image-1` first; on
 * any model-level error, retries once with `dall-e-3`. Saves the PNG to the
 * requested path and a sibling `<name>.log.txt` with the prompt + metadata.
 *
 * IMPORTANT: never logs the API key.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import OpenAI from "openai";

// ---------- env loading ------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

const envCandidates = [
  resolve(process.cwd(), ".env"),
  resolve(__dirname, "..", ".env"),
  // Fall back to the main checkout when running from a worktree.
  resolve(__dirname, "..", "..", "..", "..", ".env"),
];

for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error(
    "[generate-art] OPENAI_API_KEY not set. Tried:\n  " +
      envCandidates.join("\n  "),
  );
  process.exit(1);
}

// ---------- CLI parsing ------------------------------------------------------

interface Args {
  prompt: string;
  out: string;
  size: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality: "low" | "medium" | "high" | "auto";
  model?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { size: "1024x1024", quality: "high" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case "--prompt":
        args.prompt = value;
        i++;
        break;
      case "--out":
        args.out = value;
        i++;
        break;
      case "--size":
        args.size = value as Args["size"];
        i++;
        break;
      case "--quality":
        args.quality = value as Args["quality"];
        i++;
        break;
      case "--model":
        args.model = value;
        i++;
        break;
      case "--prompt-file": {
        args.prompt = readFileSync(value, "utf8").trim();
        i++;
        break;
      }
    }
  }
  if (!args.prompt) throw new Error("--prompt (or --prompt-file) is required");
  if (!args.out) throw new Error("--out is required");
  return args as Args;
}

// ---------- generation -------------------------------------------------------

async function tryGenerate(
  client: OpenAI,
  model: string,
  args: Args,
): Promise<{ b64: string; rawMeta: unknown }> {
  // gpt-image-1 supports quality {low,medium,high,auto} and sizes
  // {1024x1024, 1024x1536, 1536x1024, auto}. dall-e-3 wants quality
  // {standard, hd} and sizes {1024x1024, 1792x1024, 1024x1792}. We map.
  const isGpt = model === "gpt-image-1";
  const size = isGpt
    ? args.size
    : args.size === "1536x1024"
      ? "1792x1024"
      : args.size === "1024x1536"
        ? "1024x1792"
        : "1024x1024";
  const quality = isGpt
    ? args.quality
    : args.quality === "high"
      ? "hd"
      : "standard";

  const response = await client.images.generate({
    model,
    prompt: args.prompt,
    size: size as never,
    quality: quality as never,
    n: 1,
    ...(isGpt ? {} : { response_format: "b64_json" as const }),
  });

  const data = response.data?.[0];
  if (!data?.b64_json) {
    throw new Error(`Model ${model} returned no image data`);
  }
  return { b64: data.b64_json, rawMeta: { model, size, quality, created: response.created } };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = new OpenAI({ apiKey });

  mkdirSync(dirname(resolve(args.out)), { recursive: true });

  const models = args.model ? [args.model] : ["gpt-image-1", "dall-e-3"];
  let lastError: unknown;
  for (const model of models) {
    try {
      console.log(`[generate-art] Generating via ${model} → ${args.out}`);
      const start = Date.now();
      const { b64, rawMeta } = await tryGenerate(client, model, args);
      const buffer = Buffer.from(b64, "base64");
      writeFileSync(args.out, buffer);
      const elapsedMs = Date.now() - start;

      const logPath = join(
        dirname(args.out),
        basename(args.out, extname(args.out)) + ".log.txt",
      );
      writeFileSync(
        logPath,
        [
          `[Sea of Codes art generation log]`,
          `timestamp: ${new Date().toISOString()}`,
          `model: ${model}`,
          `requested_size: ${args.size}`,
          `requested_quality: ${args.quality}`,
          `output: ${args.out}`,
          `bytes: ${buffer.byteLength}`,
          `elapsed_ms: ${elapsedMs}`,
          `meta: ${JSON.stringify(rawMeta)}`,
          ``,
          `--- PROMPT ---`,
          args.prompt,
          ``,
        ].join("\n"),
      );
      console.log(
        `[generate-art] Saved ${buffer.byteLength} bytes in ${elapsedMs} ms; log → ${logPath}`,
      );
      return;
    } catch (err) {
      console.warn(
        `[generate-art] ${model} failed: ${(err as Error).message ?? err}`,
      );
      lastError = err;
    }
  }
  throw lastError ?? new Error("All models failed");
}

main().catch((err) => {
  console.error("[generate-art] FATAL:", err);
  process.exit(1);
});
