export type SavedAgreement = {
  points: string[];
  date: string;
  place: string;
  signatures: string[];
};

export const AGREEMENT_STORAGE_KEY = "perjanjiankita:agreement:v1";
const MAX_SHARE_TOKEN_LENGTH = 100_000;
const MAX_DECOMPRESSED_SHARE_SIZE = 5 * 1024 * 1024;
export const MAX_AGREEMENT_BYTES = 1_600_000;

export const initialPoints = [
  "Kami sepakat untuk saling menghargai, menjaga kepercayaan, dan berkomunikasi dengan jujur dalam keadaan apa pun.",
  "Kami akan meluangkan waktu untuk satu sama lain dan menyelesaikan setiap perbedaan dengan kepala dingin.",
  "Kami berkomitmen untuk saling mendukung dalam bertumbuh, meraih cita-cita, dan menjaga kebahagiaan bersama.",
];

export function createDefaultAgreement(): SavedAgreement {
  return {
    points: [...initialPoints],
    date: "",
    place: "",
    signatures: ["", ""],
  };
}

export function isSavedAgreement(value: unknown): value is SavedAgreement {
  if (typeof value !== "object" || value === null) return false;
  const saved = value as Record<string, unknown>;
  return (
    Array.isArray(saved.points) &&
    saved.points.length <= 100 &&
    saved.points.every(
      (point) => typeof point === "string" && point.length <= 4000,
    ) &&
    typeof saved.date === "string" &&
    (!saved.date || /^\d{4}-\d{2}-\d{2}$/.test(saved.date)) &&
    typeof saved.place === "string" &&
    saved.place.length <= 200 &&
    Array.isArray(saved.signatures) &&
    saved.signatures.length === 2 &&
    saved.signatures.every(
      (signature) =>
        typeof signature === "string" &&
        signature.length <= 750_000 &&
        (!signature ||
          /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(signature)),
    )
  );
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toBase64(bytes: Uint8Array): string {
  const base64Url = toBase64Url(bytes).replace(/-/g, "+").replace(/_/g, "/");
  return base64Url.padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
}

export function fromBase64Url(token: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("Tautan berisi karakter yang tidak valid.");
  }
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(paddedBase64), (character) =>
    character.charCodeAt(0),
  );
}

async function decompressSharedData(compressed: Uint8Array): Promise<Uint8Array> {
  const compressedCopy = new Uint8Array(compressed);
  const reader = new Blob([compressedCopy.buffer as ArrayBuffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalSize += value.byteLength;
    if (totalSize > MAX_DECOMPRESSED_SHARE_SIZE) {
      await reader.cancel();
      throw new Error("Data perjanjian dalam tautan terlalu besar.");
    }
    chunks.push(value);
  }

  const result = new Uint8Array(totalSize);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return result;
}

export async function encodeSharedAgreement(
  agreement: SavedAgreement,
): Promise<string> {
  const metadata = new TextEncoder().encode(
    JSON.stringify({
      points: agreement.points,
      date: agreement.date,
      place: agreement.place,
    }),
  );
  const signatures = agreement.signatures.map((signature) => {
    if (!signature) return new Uint8Array();
    const data = signature.slice("data:image/png;base64,".length);
    const binary = atob(data);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  });
  const totalSize =
    12 + metadata.length + signatures.reduce((size, image) => size + image.length, 0);
  const bundle = new Uint8Array(totalSize);
  const header = new DataView(bundle.buffer);
  let offset = 0;
  header.setUint32(offset, metadata.length);
  offset += 4;
  bundle.set(metadata, offset);
  offset += metadata.length;
  signatures.forEach((image) => {
    header.setUint32(offset, image.length);
    offset += 4;
    bundle.set(image, offset);
    offset += image.length;
  });

  const compressed = await new Response(
    new Blob([bundle]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  return `v2-${toBase64Url(new Uint8Array(compressed))}`;
}

export async function decodeSharedAgreement(
  token: string,
): Promise<SavedAgreement> {
  if (!token || token.length > MAX_SHARE_TOKEN_LENGTH) {
    throw new Error("Tautan terpotong atau terlalu panjang.");
  }

  if (!token.startsWith("v2-")) {
    const bytes = fromBase64Url(token);
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isSavedAgreement(value)) {
      throw new Error("Format tautan lama tidak dikenali.");
    }
    return value;
  }

  const compressed = fromBase64Url(token.slice(3));
  const bytes = await decompressSharedData(compressed);
  if (bytes.length < 12) throw new Error("Tautan tidak lengkap.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const metadataLength = view.getUint32(offset);
  offset += 4;
  if (metadataLength > bytes.length - offset) {
    throw new Error("Data perjanjian dalam tautan terpotong.");
  }
  const metadata: unknown = JSON.parse(
    new TextDecoder().decode(bytes.subarray(offset, offset + metadataLength)),
  );
  offset += metadataLength;
  const signatures = [0, 1].map(() => {
    if (offset + 4 > bytes.length) throw new Error("Data tanda tangan terpotong.");
    const imageLength = view.getUint32(offset);
    offset += 4;
    if (imageLength > bytes.length - offset) {
      throw new Error("Data tanda tangan terpotong.");
    }
    const image = bytes.subarray(offset, offset + imageLength);
    offset += imageLength;
    if (
      image.length &&
      ![137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, index) => image[index] === byte,
      )
    ) {
      throw new Error("Data gambar tanda tangan tidak valid.");
    }
    return image.length ? `data:image/png;base64,${toBase64(image)}` : "";
  });
  if (offset !== bytes.length) {
    throw new Error("Tautan berisi data tambahan yang tidak valid.");
  }

  const value: unknown =
    typeof metadata === "object" && metadata !== null
      ? { ...metadata, signatures }
      : metadata;
  if (!isSavedAgreement(value)) {
    throw new Error("Format data perjanjian dalam tautan tidak dikenali.");
  }
  return value;
}
