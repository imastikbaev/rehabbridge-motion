// New implementation for Orbita. Upstream asset, never sourced from RehabBridge.
import {
  mkdir,
  readdir,
  copyFile,
  readFile,
  writeFile,
  rename,
} from "node:fs/promises";
import { createHash } from "node:crypto";
const destination = new URL("../public/", import.meta.url);
await mkdir(new URL("vision/", destination), { recursive: true });
await mkdir(new URL("models/", destination), { recursive: true });
const origin = new URL(
  "../node_modules/@mediapipe/tasks-vision/wasm/",
  import.meta.url,
);
for (const file of await readdir(origin)) {
  if (/\.(wasm|js)$/.test(file))
    await copyFile(
      new URL(file, origin),
      new URL(`vision/${file}`, destination),
    );
}
const target = new URL("models/pose_landmarker_lite.task", destination);
const digest = (data) => createHash("sha256").update(data).digest("hex");
// Official version 1, also independently identified during the reference review.
const expected =
  "59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a";
let existing;
try {
  existing = await readFile(target);
} catch {}
if (!existing || digest(existing) !== expected) {
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
    { signal: AbortSignal.timeout(120000) },
  );
  if (!response.ok)
    throw new Error(`Model download failed: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (digest(data) !== expected) throw new Error("Model SHA-256 mismatch");
  const part = new URL("models/pose.part", destination);
  await writeFile(part, data);
  await rename(part, target);
}
console.log("Local MediaPipe assets ready; model SHA-256 verified.");
const handTarget = new URL("models/hand_landmarker.task", destination);
const handSha =
  "fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1";
let handExisting;
try {
  handExisting = await readFile(handTarget);
} catch {}
if (!handExisting || digest(handExisting) !== handSha) {
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
    { signal: AbortSignal.timeout(120000) },
  );
  if (!response.ok) throw Error("Hand model download failed");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== handSha) throw Error("Hand model integrity mismatch");
  await writeFile(handTarget, bytes);
}
console.log("Local hand model SHA-256 verified.");
