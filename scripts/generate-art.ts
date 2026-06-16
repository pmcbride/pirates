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

/** The model accepted the request but returned no usable image. Distinct from
 * transport/auth errors so the caller can decide to try a different model. */
class ModelOutputError extends Error {}

/**
 * True only for errors that a *different model* might not hit: a bad request
 * (400 — e.g. a size/quality this model rejects), an unknown model (404), or an
 * empty result. Auth (401/403), quota/rate (429), server (5xx), and network
 * errors would fail identically on the fallback model, so they are NOT
 * model-level — surfacing them immediately avoids a second pointless paid call.
 */
function isModelLevelError(err: unknown): boolean {
  if (err instanceof ModelOutputError) return true;
  const status = (err as { status?: number })?.status;
  return status === 400 || status === 404;
}

function describeError(err: unknown): string {
  const status = (err as { status?: number })?.status;
  const message = (err as Error)?.message ?? String(err);
  return status ? `HTTP ${status}: ${message}` : message;
}

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
    throw new ModelOutputError(`Model ${model} returned no image data`);
  }
  return { b64: data.b64_json, rawMeta: { model, size, quality, created: response.created } };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = new OpenAI({ apiKey });

  mkdirSync(dirname(resolve(args.out)), { recursive: true });

  const models = args.model ? [args.model] : ["gpt-image-1", "dall-e-3"];

  // Phase 1 — generate. This is the ONLY step we retry across models, and only
  // when the failure is plausibly model-specific (see isModelLevelError). An
  // auth/quota/network failure is rethrown at once so we don't bill a second
  // doomed call against the fallback model.
  let generated: { b64: string; rawMeta: unknown } | undefined;
  let usedModel = "";
  let elapsedMs = 0;
  let firstError: unknown;
  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    const isLast = i === models.length - 1;
    try {
      console.log(`[generate-art] Generating via ${model} → ${args.out}`);
      const start = Date.now();
      generated = await tryGenerate(client, model, args);
      elapsedMs = Date.now() - start;
      usedModel = model;
      break;
    } catch (err) {
      firstError ??= err;
      if (isLast || !isModelLevelError(err)) {
        // Preserve the original error as the cause rather than flattening it to
        // a string, so the stack and OpenAI error body survive to the top.
        throw new Error(
          `[generate-art] ${model} failed: ${describeError(err)}`,
          { cause: firstError },
        );
      }
      console.warn(
        `[generate-art] ${model} failed (${describeError(err)}); falling back to ${models[i + 1]}`,
      );
    }
  }
  if (!generated) throw firstError ?? new Error("[generate-art] all models failed");

  // Phase 2 — persist. A filesystem error here is a real failure of THIS run
  // (bad --out path, permissions, disk) and must NOT trigger a model fallback,
  // so it lives outside the loop above.
  const buffer = Buffer.from(generated.b64, "base64");
  writeFileSync(args.out, buffer);

  const logPath = join(
    dirname(args.out),
    basename(args.out, extname(args.out)) + ".log.txt",
  );
  writeFileSync(
    logPath,
    [
      `[Sea of Codes art generation log]`,
      `timestamp: ${new Date().toISOString()}`,
      `model: ${usedModel}`,
      `requested_size: ${args.size}`,
      `requested_quality: ${args.quality}`,
      `output: ${args.out}`,
      `bytes: ${buffer.byteLength}`,
      `elapsed_ms: ${elapsedMs}`,
      `meta: ${JSON.stringify(generated.rawMeta)}`,
      ``,
      `--- PROMPT ---`,
      args.prompt,
      ``,
    ].join("\n"),
  );
  console.log(
    `[generate-art] Saved ${buffer.byteLength} bytes in ${elapsedMs} ms; log → ${logPath}`,
  );
}

main().catch((err) => {
  console.error("[generate-art] FATAL:", err);
  process.exit(1);
});
