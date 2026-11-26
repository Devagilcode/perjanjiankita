import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  BlobNotFoundError,
  BlobPathnameMismatchError,
  BlobPreconditionFailedError,
  del,
  get,
  put,
} from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import {
  isSavedAgreement,
  MAX_AGREEMENT_BYTES,
  type SavedAgreement,
} from "@/lib/agreement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BLOB_PATH = "private/perjanjiankita/agreement.json";
const LOCAL_DATA_DIR = path.join(process.cwd(), "data");
const LOCAL_FILE_PATH = path.join(LOCAL_DATA_DIR, "agreement.json");

function useVercelBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function computeFileEtag(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function readLocalAgreement(): Promise<{
  agreement: SavedAgreement | null;
  etag: string | null;
}> {
  try {
    const raw = await readFile(LOCAL_FILE_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isSavedAgreement(parsed)) {
      throw new Error("INVALID_STORED_AGREEMENT");
    }
    return { agreement: parsed, etag: computeFileEtag(raw) };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { agreement: null, etag: null };
    }
    throw error;
  }
}

async function writeLocalAgreement(
  agreement: SavedAgreement,
  expectedEtag: string | null,
  forceOverwrite: boolean,
): Promise<{ etag: string }> {
  const current = await readLocalAgreement();
  if (!forceOverwrite) {
    if (expectedEtag === null && current.etag !== null) {
      throw new Error("CONFLICT");
    }
    if (expectedEtag !== null && current.etag !== expectedEtag) {
      throw new Error("CONFLICT");
    }
  }

  await mkdir(LOCAL_DATA_DIR, { recursive: true });
  const serialized = JSON.stringify(agreement, null, 2);
  const tempPath = `${LOCAL_FILE_PATH}.${Date.now()}.tmp`;
  await writeFile(tempPath, serialized, "utf8");
  await rename(tempPath, LOCAL_FILE_PATH);
  return { etag: computeFileEtag(serialized) };
}

async function deleteLocalAgreement(expectedEtag: string): Promise<void> {
  const current = await readLocalAgreement();
  if (!current.etag || current.etag !== expectedEtag) {
    throw new Error("CONFLICT");
  }
  await unlink(LOCAL_FILE_PATH);
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_AGREEMENT_BYTES) {
    throw new Error("PAYLOAD_TOO_LARGE");
  }

  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_BODY");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_AGREEMENT_BYTES) {
      await reader.cancel();
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function GET() {
  if (!useVercelBlob()) {
    if (process.env.VERCEL) {
      return errorResponse(
        "Penyimpanan file Vercel Blob belum dihubungkan ke project Vercel.",
        503,
      );
    }
    try {
      const result = await readLocalAgreement();
      return NextResponse.json(
        { ...result, mode: "file" },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      console.error("Failed to read local agreement JSON.", error);
      return errorResponse("Gagal membaca file perjanjian lokal.", 500);
    }
  }

  try {
    const blob = await get(BLOB_PATH, { access: "private", useCache: false });
    if (!blob) {
      return NextResponse.json(
        { agreement: null, etag: null, mode: "blob" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (blob.statusCode !== 200) {
      return errorResponse("Data perjanjian tidak dapat dibaca.", 502);
    }
    const agreement: unknown = JSON.parse(await new Response(blob.stream).text());
    if (!isSavedAgreement(agreement)) {
      return errorResponse("Data tersimpan tidak valid.", 500);
    }
    return NextResponse.json(
      { agreement, etag: blob.blob.etag, mode: "blob" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return NextResponse.json(
        { agreement: null, etag: null, mode: "blob" },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    console.error("Failed to load agreement from Vercel Blob.", error);
    return errorResponse("Gagal memuat perjanjian dari penyimpanan cloud.", 502);
  }
}

export async function PUT(request: NextRequest) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return errorResponse("Format permintaan tidak didukung.", 415);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") {
      return errorResponse("Ukuran data perjanjian terlalu besar.", 413);
    }
    return errorResponse("Isi perjanjian tidak valid.", 400);
  }

  if (typeof body !== "object" || body === null) {
    return errorResponse("Isi perjanjian tidak valid.", 400);
  }
  const payload = body as Record<string, unknown>;
  if (
    !isSavedAgreement(payload.agreement) ||
    !(payload.etag === null || typeof payload.etag === "string")
  ) {
    return errorResponse("Isi perjanjian tidak valid.", 400);
  }

  const force = payload.force === true;

  if (!useVercelBlob()) {
    if (process.env.VERCEL) {
      return errorResponse(
        "Penyimpanan file Vercel Blob belum dihubungkan ke project Vercel.",
        503,
      );
    }
    try {
      const result = await writeLocalAgreement(
        payload.agreement,
        payload.etag,
        force,
      );
      return NextResponse.json(
        { etag: result.etag },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof Error && error.message === "CONFLICT") {
        return errorResponse("CONFLICT", 409);
      }
      console.error("Failed to save local agreement JSON.", error);
      return errorResponse("Gagal menyimpan ke file perjanjian lokal.", 500);
    }
  }

  try {
    const result = await put(BLOB_PATH, JSON.stringify(payload.agreement), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: force || typeof payload.etag === "string",
      contentType: "application/json",
      cacheControlMaxAge: 0,
      ...(!force && typeof payload.etag === "string"
        ? { ifMatch: payload.etag }
        : {}),
    });
    return NextResponse.json(
      { etag: result.etag },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof BlobPreconditionFailedError ||
      error instanceof BlobPathnameMismatchError
    ) {
      return errorResponse("CONFLICT", 409);
    }
    console.error("Failed to save agreement to Vercel Blob.", error);
    return errorResponse("Gagal menyimpan ke penyimpanan cloud.", 502);
  }
}

export async function DELETE(request: NextRequest) {
  const etag = request.headers.get("if-match");
  if (!etag) return errorResponse("Versi perjanjian belum diketahui.", 428);

  if (!useVercelBlob()) {
    if (process.env.VERCEL) {
      return errorResponse(
        "Penyimpanan file Vercel Blob belum dihubungkan ke project Vercel.",
        503,
      );
    }
    try {
      await deleteLocalAgreement(etag);
      return NextResponse.json(
        { deleted: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      if (error instanceof Error && error.message === "CONFLICT") {
        return errorResponse("CONFLICT", 409);
      }
      console.error("Failed to delete local agreement JSON.", error);
      return errorResponse("Gagal menghapus file perjanjian lokal.", 500);
    }
  }

  try {
    await del(BLOB_PATH, { ifMatch: etag });
    return NextResponse.json(
      { deleted: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (
      error instanceof BlobPreconditionFailedError ||
      error instanceof BlobNotFoundError
    ) {
      return errorResponse("CONFLICT", 409);
    }
    console.error("Failed to delete agreement from Vercel Blob.", error);
    return errorResponse("Gagal menghapus perjanjian dari penyimpanan cloud.", 502);
  }
}
