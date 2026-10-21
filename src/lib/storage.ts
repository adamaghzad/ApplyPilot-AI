import fs from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";

const ROOT = path.isAbsolute(env.STORAGE_DIR) ? env.STORAGE_DIR : path.join(process.cwd(), env.STORAGE_DIR);

export type StoredFile = { storagePath: string; absolutePath: string; fileName: string; sizeBytes: number };

/**
 * Local (filesystem) document storage with per-user isolation.
 *
 * Swap this module for S3/R2/GCS in production — every caller only uses
 * `putFile` / `readFile` / `deleteFile` and never touches the filesystem directly.
 */
export async function putFile(params: {
  userId: string;
  folder: "cv" | "letters" | "exports";
  fileName: string;
  buffer: Buffer;
}): Promise<StoredFile> {
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const relativeDir = path.join(params.folder, params.userId);
  const absoluteDir = path.join(ROOT, relativeDir);
  await fs.mkdir(absoluteDir, { recursive: true });

  const absolutePath = path.join(absoluteDir, `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`);
  await fs.writeFile(absolutePath, params.buffer);

  return {
    storagePath: path.join(relativeDir, path.basename(absolutePath)),
    absolutePath,
    fileName: safeName,
    sizeBytes: params.buffer.byteLength,
  };
}

export async function readFile(storagePath: string): Promise<Buffer> {
  const absolutePath = path.isAbsolute(storagePath) ? storagePath : path.join(ROOT, storagePath);
  // Path traversal guard: the resolved path must stay inside the storage root.
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(path.resolve(ROOT))) throw new Error("Invalid storage path");
  return fs.readFile(resolved);
}

export async function deleteFile(storagePath: string): Promise<void> {
  try {
    const absolutePath = path.isAbsolute(storagePath) ? storagePath : path.join(ROOT, storagePath);
    const resolved = path.resolve(absolutePath);
    if (!resolved.startsWith(path.resolve(ROOT))) throw new Error("Invalid storage path");
    await fs.unlink(resolved);
  } catch (error) {
    console.warn("[storage] delete failed:", error);
  }
}

export function absoluteStoragePath(storagePath: string) {
  return path.isAbsolute(storagePath) ? storagePath : path.join(ROOT, storagePath);
}
