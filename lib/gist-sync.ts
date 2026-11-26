import {
  fromBase64Url,
  isSavedAgreement,
  toBase64Url,
  type SavedAgreement,
} from "@/lib/agreement";

export const GIST_SYNC_STORAGE_KEY = "perjanjiankita:gist-sync:v1";
const GIST_FILENAME = "perjanjian-kita.json";
const GITHUB_API_BASE = "https://api.github.com/gists";

export type GistSyncConfig = {
  gistId: string;
  token: string;
  version: string | null;
};

type GistApiFile = {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
};

type GistApiResponse = {
  id?: string;
  updated_at?: string;
  history?: Array<{ version?: string }>;
  files?: Record<string, GistApiFile | undefined>;
  message?: string;
};

function getGistHeaders(token?: string, withJsonBody = false): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  if (withJsonBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

function extractGistVersion(gist: GistApiResponse): string {
  return gist.history?.[0]?.version || gist.updated_at || "";
}

async function parseGitHubError(
  response: Response,
  fallbackMessage: string,
): Promise<string> {
  if (response.status === 401) {
    return "Token GitHub tidak valid atau sudah kedaluwarsa.";
  }
  if (response.status === 403) {
    return "Token tidak memiliki izin 'gist' atau terkena batas akses GitHub.";
  }
  if (response.status === 404) {
    return "Data Gist tidak ditemukan. Periksa kembali ID atau link pasangan.";
  }
  try {
    const data = (await response.json()) as { message?: string };
    if (data?.message) return `${fallbackMessage} (${data.message})`;
  } catch {
    // Ignore non-JSON error responses.
  }
  return fallbackMessage;
}

export function loadGistSyncConfig(): GistSyncConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GIST_SYNC_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      typeof candidate.gistId !== "string" ||
      !candidate.gistId.trim() ||
      typeof candidate.token !== "string" ||
      !candidate.token.trim()
    ) {
      return null;
    }
    return {
      gistId: candidate.gistId.trim(),
      token: candidate.token.trim(),
      version: typeof candidate.version === "string" ? candidate.version : null,
    };
  } catch {
    return null;
  }
}

export function saveGistSyncConfig(config: GistSyncConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GIST_SYNC_STORAGE_KEY, JSON.stringify(config));
}

export function clearGistSyncConfig(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(GIST_SYNC_STORAGE_KEY);
}

export function encodePairingToken(gistId: string, token: string): string {
  const payload = JSON.stringify({
    v: 1,
    gistId: gistId.trim(),
    token: token.trim(),
  });
  return toBase64Url(new TextEncoder().encode(payload));
}

export function decodePairingToken(input: string): {
  gistId: string;
  token: string;
} {
  let rawToken = input.trim();
  if (!rawToken) {
    throw new Error("Link atau kode pasangan masih kosong.");
  }

  if (rawToken.includes("#sync=")) {
    const hashPart = rawToken.split("#")[1] || "";
    const params = new URLSearchParams(hashPart);
    rawToken = params.get("sync") || "";
  } else if (rawToken.includes("sync=")) {
    const queryPart = rawToken.includes("?") ? rawToken.split("?")[1] : rawToken;
    const params = new URLSearchParams(queryPart);
    rawToken = params.get("sync") || "";
  }

  const decoded = new TextDecoder().decode(fromBase64Url(rawToken.trim()));
  const parsed: unknown = JSON.parse(decoded);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Format link pasangan tidak valid.");
  }
  const data = parsed as Record<string, unknown>;
  if (
    typeof data.gistId !== "string" ||
    !/^[a-zA-Z0-9]+$/.test(data.gistId.trim()) ||
    typeof data.token !== "string" ||
    !data.token.trim()
  ) {
    throw new Error("Isi link pasangan tidak lengkap.");
  }
  return {
    gistId: data.gistId.trim(),
    token: data.token.trim(),
  };
}

export function extractGistId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Gist ID tidak boleh kosong.");
  const urlMatch = trimmed.match(/gist\.github\.com\/(?:[^/]+\/)?([a-zA-Z0-9]+)/);
  const gistId = urlMatch ? urlMatch[1] : trimmed;
  if (!/^[a-zA-Z0-9]+$/.test(gistId)) {
    throw new Error("Format Gist ID tidak valid.");
  }
  return gistId;
}

export async function createSharedGist(
  token: string,
  agreement: SavedAgreement,
): Promise<{ gistId: string; version: string }> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error("Masukkan GitHub Token terlebih dahulu.");
  }

  const response = await fetch(GITHUB_API_BASE, {
    method: "POST",
    headers: getGistHeaders(cleanToken, true),
    body: JSON.stringify({
      description: "Perjanjian Kita — Data Perjanjian Bersama",
      public: false,
      files: {
        [GIST_FILENAME]: {
          content: JSON.stringify(agreement, null, 2),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      await parseGitHubError(response, "Gagal membuat penyimpanan Gist bersama."),
    );
  }

  const gist = (await response.json()) as GistApiResponse;
  if (!gist.id) {
    throw new Error("GitHub tidak mengembalikan ID Gist.");
  }
  return {
    gistId: gist.id,
    version: extractGistVersion(gist),
  };
}

export async function fetchSharedGist(
  gistId: string,
  token: string,
): Promise<{ agreement: SavedAgreement | null; version: string }> {
  const response = await fetch(
    `${GITHUB_API_BASE}/${encodeURIComponent(gistId.trim())}?_t=${Date.now()}`,
    {
      method: "GET",
      headers: getGistHeaders(token),
    },
  );

  if (!response.ok) {
    throw new Error(
      await parseGitHubError(response, "Gagal memuat data dari GitHub Gist."),
    );
  }

  const gist = (await response.json()) as GistApiResponse;
  const version = extractGistVersion(gist);
  const file = gist.files?.[GIST_FILENAME];
  if (!file) {
    return { agreement: null, version };
  }

  let rawContent = file.content ?? "";
  if (file.truncated && file.raw_url) {
    const rawResponse = await fetch(`${file.raw_url}?_t=${Date.now()}`);
    if (!rawResponse.ok) {
      throw new Error("Gagal mengunduh file perjanjian dari GitHub Gist.");
    }
    rawContent = await rawResponse.text();
  }

  if (!rawContent.trim()) {
    return { agreement: null, version };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error("Isi JSON di Gist tidak valid.");
  }

  if (!isSavedAgreement(parsed)) {
    throw new Error("Format data perjanjian di Gist tidak dikenali.");
  }

  return { agreement: parsed, version };
}

export async function updateSharedGist(
  gistId: string,
  token: string,
  agreement: SavedAgreement,
): Promise<{ version: string }> {
  const response = await fetch(
    `${GITHUB_API_BASE}/${encodeURIComponent(gistId.trim())}`,
    {
      method: "PATCH",
      headers: getGistHeaders(token, true),
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(agreement, null, 2),
          },
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await parseGitHubError(response, "Gagal menyimpan perubahan ke GitHub Gist."),
    );
  }

  const gist = (await response.json()) as GistApiResponse;
  return { version: extractGistVersion(gist) };
}
