"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import {
  AGREEMENT_STORAGE_KEY,
  createDefaultAgreement,
  decodeSharedAgreement,
  encodeSharedAgreement,
  initialPoints,
  isSavedAgreement,
  type SavedAgreement,
} from "@/lib/agreement";
import {
  clearGistSyncConfig,
  createSharedGist,
  decodePairingToken,
  encodePairingToken,
  fetchSharedGist,
  loadGistSyncConfig,
  saveGistSyncConfig,
  updateSharedGist,
  type GistSyncConfig,
} from "@/lib/gist-sync";

const LAST_SYNCED_SNAPSHOT_KEY = "perjanjiankita:synced-snapshot:v1";

function HeartMark() {
  return (
    <svg
      className="heart-mark"
      viewBox="0 0 96 88"
      role="img"
      aria-label="Ilustrasi hati"
    >
      <path
        d="M48 76 14.5 44.2C-2 27.5 9.4 7 27 7c9.1 0 16.3 5.2 21 13.2C52.7 12.2 59.9 7 69 7c17.6 0 29 20.5 12.5 37.2L48 76Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M4 42h20l8-13 12 30 10-19 7 10h31"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SignaturePad({
  label,
  signature,
  onChange,
}: {
  label: string;
  signature: string;
  onChange: (signature: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderedSignatureRef = useRef("");
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (signature === renderedSignatureRef.current) return;
    renderedSignatureRef.current = signature;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!signature) return;

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = signature;
    return () => {
      cancelled = true;
    };
  }, [signature]);

  const getPosition = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const { x, y } = getPosition(event);
    context.beginPath();
    context.moveTo(x, y);
    context.strokeStyle = "#342d31";
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    setIsDrawing(true);
  };

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const { x, y } = getPosition(event);
    context.lineTo(x, y);
    context.stroke();
  };

  const finishDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    renderedSignatureRef.current = dataUrl;
    onChange(dataUrl);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    renderedSignatureRef.current = "";
    onChange("");
  };

  return (
    <div className="signature-field">
      <div className="signature-field-heading">
        <span>{label}</span>
        <button type="button" className="clear-signature" onClick={clearSignature}>
          Hapus
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="signature-canvas"
        width={600}
        height={180}
        aria-label={`Area tanda tangan ${label}`}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
      />
      <span className="signature-hint">Gambar tanda tangan di area ini</span>
    </div>
  );
}

function getBaseAppUrl(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

export default function Home() {
  const [points, setPoints] = useState(initialPoints);
  const [newPoint, setNewPoint] = useState("");
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");
  const [signatures, setSignatures] = useState(["", ""]);
  const [isLocalReady, setIsLocalReady] = useState(false);

  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [storageError, setStorageError] = useState("");

  const [shareStatus, setShareStatus] = useState("");
  const [shareLink, setShareLink] = useState("");

  const [syncConfig, setSyncConfig] = useState<GistSyncConfig | null>(null);
  const [syncStatus, setSyncStatus] = useState("Memuat data tersimpan...");
  const [syncError, setSyncError] = useState("");
  const [syncSuccessMessage, setSyncSuccessMessage] = useState("");
  const [hasConflict, setHasConflict] = useState(false);
  const [isSyncBusy, setIsSyncBusy] = useState(false);
  const [saveRetry, setSaveRetry] = useState(0);

  const [showSyncSetup, setShowSyncSetup] = useState(false);
  const [setupMode, setSetupMode] = useState<"create" | "pair">("create");
  const [tokenInput, setTokenInput] = useState("");
  const [pairInput, setPairInput] = useState("");

  const currentSnapshotRef = useRef("");
  const lastRemoteSnapshotRef = useRef("");
  const remoteVersionRef = useRef<string | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const agreement: SavedAgreement = { points, date, place, signatures };
  const agreementSnapshot = JSON.stringify(agreement);
  currentSnapshotRef.current = agreementSnapshot;

  const applyAgreementState = useCallback((saved: SavedAgreement) => {
    setPoints(saved.points);
    setDate(saved.date);
    setPlace(saved.place);
    setSignatures(saved.signatures);
    currentSnapshotRef.current = JSON.stringify(saved);
  }, []);

  const persistLocalAgreement = useCallback((snapshot: string) => {
    try {
      window.localStorage.setItem(AGREEMENT_STORAGE_KEY, snapshot);
      setStorageError("");
    } catch (error) {
      console.error("Failed to save agreement to localStorage.", error);
      setStorageError("Penyimpanan browser penuh atau diblokir.");
    }
  }, []);

  const persistSyncedState = useCallback(
    (config: GistSyncConfig, snapshot: string) => {
      saveGistSyncConfig(config);
      setSyncConfig(config);
      remoteVersionRef.current = config.version;
      lastRemoteSnapshotRef.current = snapshot;
      try {
        window.localStorage.setItem(LAST_SYNCED_SNAPSHOT_KEY, snapshot);
      } catch {
        // Ignore non-fatal localStorage quota errors for mirror key.
      }
    },
    [],
  );

  const pullFromGist = useCallback(
    async (
      config: GistSyncConfig,
      options: { isInitialLoad?: boolean; forceAcceptRemote?: boolean } = {},
    ) => {
      const remote = await fetchSharedGist(config.gistId, config.token);
      if (!remote.agreement) {
        if (options.isInitialLoad) {
          const currentLocal = JSON.parse(
            currentSnapshotRef.current,
          ) as SavedAgreement;
          const updated = await updateSharedGist(
            config.gistId,
            config.token,
            currentLocal,
          );
          persistSyncedState(
            { ...config, version: updated.version },
            currentSnapshotRef.current,
          );
          setSyncStatus("Tersinkron otomatis lintas jaringan");
        }
        return;
      }

      const remoteSnapshot = JSON.stringify(remote.agreement);
      const localSnapshot = currentSnapshotRef.current;

      if (options.forceAcceptRemote) {
        applyAgreementState(remote.agreement);
        persistLocalAgreement(remoteSnapshot);
        persistSyncedState(
          { ...config, version: remote.version },
          remoteSnapshot,
        );
        setHasConflict(false);
        setSyncError("");
        setSyncStatus("Versi terbaru lintas jaringan dimuat.");
        return;
      }

      if (remoteSnapshot === localSnapshot) {
        persistSyncedState(
          { ...config, version: remote.version },
          remoteSnapshot,
        );
        setHasConflict(false);
        setSyncError("");
        setSyncStatus("Tersinkron otomatis lintas jaringan");
        return;
      }

      let lastSyncedSnapshot = "";
      try {
        lastSyncedSnapshot =
          window.localStorage.getItem(LAST_SYNCED_SNAPSHOT_KEY) || "";
      } catch {
        lastSyncedSnapshot = "";
      }

      const isFreshDeviceOrUnedited =
        config.version === null ||
        localSnapshot === lastSyncedSnapshot ||
        localSnapshot === lastRemoteSnapshotRef.current;

      if (isFreshDeviceOrUnedited) {
        applyAgreementState(remote.agreement);
        persistLocalAgreement(remoteSnapshot);
        persistSyncedState(
          { ...config, version: remote.version },
          remoteSnapshot,
        );
        setHasConflict(false);
        setSyncError("");
        setSyncStatus("Perubahan terbaru dari pasangan dimuat.");
        return;
      }

      if (config.version && remote.version === config.version) {
        // Remote hasn't changed; local has offline changes waiting to push.
        lastRemoteSnapshotRef.current = lastSyncedSnapshot || "";
        remoteVersionRef.current = remote.version;
        return;
      }

      setHasConflict(true);
      setSyncStatus("Ada perbedaan isi antara perangkat ini dan cloud.");
      setSyncError(
        "Perangkat lain juga mengubah perjanjian. Pilih versi mana yang ingin dipakai.",
      );
    },
    [applyAgreementState, persistLocalAgreement, persistSyncedState],
  );

  // Initial load: pairing link / share link / localStorage / Gist sync.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let activeConfig = loadGistSyncConfig();
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const queryParams = new URLSearchParams(window.location.search);

      const pairingParam = hashParams.get("sync") || queryParams.get("sync");
      const dataParam = hashParams.get("data") || queryParams.get("data");

      let initialAgreement = createDefaultAgreement();
      try {
        const storedLocal = window.localStorage.getItem(AGREEMENT_STORAGE_KEY);
        if (storedLocal) {
          const parsed: unknown = JSON.parse(storedLocal);
          if (isSavedAgreement(parsed)) {
            initialAgreement = parsed;
          }
        }
      } catch (error) {
        console.error("Failed to load local agreement.", error);
        setStorageError("Data lokal sebelumnya tidak dapat dibaca.");
      }

      if (dataParam) {
        try {
          initialAgreement = await decodeSharedAgreement(dataParam);
          persistLocalAgreement(JSON.stringify(initialAgreement));
          setSyncSuccessMessage("Isi surat dari link snapshot berhasil dimuat.");
        } catch (error) {
          setSyncError(
            error instanceof Error
              ? `Link snapshot tidak valid: ${error.message}`
              : "Link snapshot tidak dapat dibaca.",
          );
        }
      }

      if (pairingParam) {
        try {
          const paired = decodePairingToken(pairingParam);
          activeConfig = {
            gistId: paired.gistId,
            token: paired.token,
            version: null,
          };
          saveGistSyncConfig(activeConfig);
          setSyncSuccessMessage(
            "Perangkat berhasil terhubung! Perubahan kalian sekarang sinkron otomatis.",
          );
        } catch (error) {
          setSyncError(
            error instanceof Error
              ? error.message
              : "Link pasangan tidak valid.",
          );
        }
      }

      if (pairingParam || dataParam) {
        window.history.replaceState(null, "", getBaseAppUrl());
      }

      if (cancelled) return;
      applyAgreementState(initialAgreement);

      if (activeConfig) {
        setSyncConfig(activeConfig);
        remoteVersionRef.current = activeConfig.version;
        try {
          lastRemoteSnapshotRef.current =
            window.localStorage.getItem(LAST_SYNCED_SNAPSHOT_KEY) || "";
        } catch {
          lastRemoteSnapshotRef.current = "";
        }
        setSyncStatus("Menyelaraskan data bersama...");
        try {
          await pullFromGist(activeConfig, { isInitialLoad: true });
        } catch (error) {
          if (!cancelled) {
            setSyncError(
              error instanceof Error
                ? error.message
                : "Gagal menyinkronkan data dari jaringan.",
            );
            setSyncStatus("Tersimpan lokal (menunggu koneksi)");
          }
        }
      } else {
        setSyncStatus("Tersimpan otomatis di perangkat ini");
      }

      if (!cancelled) {
        setIsLocalReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyAgreementState, persistLocalAgreement, pullFromGist]);

  // Immediate localStorage auto-save whenever fields change.
  useEffect(() => {
    if (!isLocalReady) return;
    persistLocalAgreement(agreementSnapshot);
  }, [agreementSnapshot, isLocalReady, persistLocalAgreement]);

  // Debounced automatic sync to GitHub Gist when configured.
  useEffect(() => {
    if (!isLocalReady || !syncConfig || hasConflict) return;
    const retryDelay = Math.min(
      2500 * 2 ** Math.min(Math.max(saveRetry - 1, 0), 4),
      30_000,
    );

    const timeout = window.setTimeout(() => {
      const snapshot = currentSnapshotRef.current;
      if (snapshot === lastRemoteSnapshotRef.current) return;

      const pushUpdate = async () => {
        if (hasConflict || snapshot === lastRemoteSnapshotRef.current) return;
        setSyncStatus("Menyimpan lintas jaringan...");
        setSyncError("");
        try {
          // Check remote version first so we never silently overwrite partner edits.
          const latest = await fetchSharedGist(syncConfig.gistId, syncConfig.token);
          const remoteSnapshot = latest.agreement
            ? JSON.stringify(latest.agreement)
            : "";
          if (
            remoteVersionRef.current &&
            latest.version &&
            latest.version !== remoteVersionRef.current &&
            remoteSnapshot &&
            remoteSnapshot !== lastRemoteSnapshotRef.current &&
            remoteSnapshot !== snapshot
          ) {
            setHasConflict(true);
            setSyncStatus("Ada perubahan baru dari perangkat lain.");
            setSyncError(
              "Perubahan lokal ditahan agar tidak menimpa editan pasanganmu.",
            );
            return;
          }

          const payload = JSON.parse(snapshot) as SavedAgreement;
          const updated = await updateSharedGist(
            syncConfig.gistId,
            syncConfig.token,
            payload,
          );
          persistSyncedState(
            { ...syncConfig, version: updated.version },
            snapshot,
          );
          setSaveRetry(0);
          setSyncStatus("Tersinkron otomatis lintas jaringan");
        } catch (error) {
          console.error("Failed to sync agreement to GitHub Gist.", error);
          setSyncError(
            error instanceof Error
              ? error.message
              : "Gagal menyinkronkan ke jaringan. Akan dicoba lagi.",
          );
          setSyncStatus("Tersimpan lokal (menunggu sinkronisasi)");
          setSaveRetry((attempt) => attempt + 1);
        }
      };

      saveQueueRef.current = saveQueueRef.current.then(pushUpdate, pushUpdate);
    }, saveRetry ? retryDelay : 800);

    return () => window.clearTimeout(timeout);
  }, [
    agreementSnapshot,
    hasConflict,
    isLocalReady,
    persistSyncedState,
    saveRetry,
    syncConfig,
  ]);

  // Retry immediately when network returns, and poll for partner updates while visible.
  useEffect(() => {
    if (!isLocalReady || !syncConfig) return;

    const refreshWhenIdle = () => {
      if (
        document.hidden ||
        hasConflict ||
        currentSnapshotRef.current !== lastRemoteSnapshotRef.current
      ) {
        return;
      }
      void pullFromGist(syncConfig).catch((error: unknown) => {
        console.error("Background Gist sync check failed.", error);
      });
    };

    const handleOnline = () => {
      if (currentSnapshotRef.current !== lastRemoteSnapshotRef.current) {
        setSaveRetry((attempt) => (attempt === 0 ? 1 : attempt));
      } else {
        refreshWhenIdle();
      }
    };

    const interval = window.setInterval(refreshWhenIdle, 8_000);
    window.addEventListener("focus", refreshWhenIdle);
    document.addEventListener("visibilitychange", refreshWhenIdle);
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenIdle);
      document.removeEventListener("visibilitychange", refreshWhenIdle);
      window.removeEventListener("online", handleOnline);
    };
  }, [hasConflict, isLocalReady, pullFromGist, syncConfig]);

  const handleCreateSync = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSyncError("");
    setSyncSuccessMessage("");
    setIsSyncBusy(true);
    try {
      const currentAgreement = JSON.parse(
        currentSnapshotRef.current,
      ) as SavedAgreement;
      const created = await createSharedGist(tokenInput, currentAgreement);
      const nextConfig: GistSyncConfig = {
        gistId: created.gistId,
        token: tokenInput.trim(),
        version: created.version,
      };
      persistSyncedState(nextConfig, currentSnapshotRef.current);
      setTokenInput("");
      setShowSyncSetup(false);
      setHasConflict(false);
      setSyncStatus("Tersinkron otomatis lintas jaringan");
      setSyncSuccessMessage(
        "Sinkronisasi aktif! Sekarang klik 'Salin Link Pasangan' untuk dikirim ke pacar.",
      );
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "Gagal mengaktifkan sinkronisasi.",
      );
    } finally {
      setIsSyncBusy(false);
    }
  };

  const handlePairSync = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSyncError("");
    setSyncSuccessMessage("");
    setIsSyncBusy(true);
    try {
      const paired = decodePairingToken(pairInput);
      const nextConfig: GistSyncConfig = {
        gistId: paired.gistId,
        token: paired.token,
        version: null,
      };
      saveGistSyncConfig(nextConfig);
      setSyncConfig(nextConfig);
      await pullFromGist(nextConfig, { isInitialLoad: true });
      setPairInput("");
      setShowSyncSetup(false);
      setSyncSuccessMessage("Perangkat berhasil disambungkan dan disinkronkan!");
    } catch (error) {
      setSyncError(
        error instanceof Error
          ? error.message
          : "Link pasangan tidak valid.",
      );
    } finally {
      setIsSyncBusy(false);
    }
  };

  const copyPairingLink = async () => {
    if (!syncConfig) return;
    setSyncError("");
    setSyncSuccessMessage("");
    const pairingToken = encodePairingToken(syncConfig.gistId, syncConfig.token);
    const url = `${getBaseAppUrl()}#sync=${pairingToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setSyncSuccessMessage(
        "Link pasangan tersalin! Kirim ke pacar—cukup buka 1x di HP-nya untuk sinkron otomatis.",
      );
    } catch {
      setShareLink(url);
      setSyncSuccessMessage(
        "Salin link pasangan di kotak di bawah lalu kirim hanya ke pasanganmu.",
      );
    }
  };

  const manualRefresh = async () => {
    if (!syncConfig) return;
    setIsSyncBusy(true);
    setSyncError("");
    setSyncSuccessMessage("");
    try {
      await pullFromGist(syncConfig);
      setSyncSuccessMessage("Data sudah paling baru.");
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Gagal menyegarkan data.",
      );
    } finally {
      setIsSyncBusy(false);
    }
  };

  const resolveUseRemote = async () => {
    if (!syncConfig) return;
    setIsSyncBusy(true);
    setSyncError("");
    try {
      await pullFromGist(syncConfig, { forceAcceptRemote: true });
      setSyncSuccessMessage("Versi terbaru dari pasangan diterapkan.");
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Gagal memuat versi terbaru.",
      );
    } finally {
      setIsSyncBusy(false);
    }
  };

  const resolveKeepLocal = async () => {
    if (!syncConfig) return;
    setIsSyncBusy(true);
    setSyncError("");
    try {
      const snapshot = currentSnapshotRef.current;
      const updated = await updateSharedGist(
        syncConfig.gistId,
        syncConfig.token,
        JSON.parse(snapshot) as SavedAgreement,
      );
      persistSyncedState({ ...syncConfig, version: updated.version }, snapshot);
      setHasConflict(false);
      setSyncStatus("Tersinkron otomatis lintas jaringan");
      setSyncSuccessMessage("Versi perangkat ini berhasil disimpan ke semua perangkat.");
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Gagal menyimpan versi ini.",
      );
    } finally {
      setIsSyncBusy(false);
    }
  };

  const resetAgreement = () => {
    if (
      !window.confirm(
        "Kembalikan isi surat dan tanda tangan ke template awal?",
      )
    ) {
      return;
    }
    const fresh = createDefaultAgreement();
    applyAgreementState(fresh);
    persistLocalAgreement(JSON.stringify(fresh));
    setSyncSuccessMessage("Surat dikembalikan ke template awal.");
  };

  const disconnectSync = () => {
    if (
      !window.confirm(
        "Putuskan sinkronisasi Gist di perangkat ini? Data lokal tetap tersimpan di browser.",
      )
    ) {
      return;
    }
    clearGistSyncConfig();
    setSyncConfig(null);
    remoteVersionRef.current = null;
    lastRemoteSnapshotRef.current = "";
    setHasConflict(false);
    setSyncError("");
    setSyncSuccessMessage("");
    setSyncStatus("Tersimpan otomatis di perangkat ini");
  };

  const copyShareLink = async () => {
    setPdfError("");
    setShareStatus("");
    try {
      const token = await encodeSharedAgreement(agreement);
      const url = `${getBaseAppUrl()}#data=${token}`;
      setShareLink(url);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareStatus("Link snapshot tersalin ke clipboard.");
      } else {
        setShareStatus("Link snapshot siap disalin di bawah.");
      }
    } catch (error) {
      console.error("Failed to create share link.", error);
      setPdfError("Gagal membuat link snapshot.");
    }
  };

  const addPoint = () => {
    const trimmedPoint = newPoint.trim();
    if (!trimmedPoint) return;
    if (points.length >= 100) return;
    setPoints((currentPoints) => [...currentPoints, trimmedPoint]);
    setNewPoint("");
  };

  const updatePoint = (index: number, value: string) => {
    setPoints((currentPoints) =>
      currentPoints.map((point, pointIndex) =>
        pointIndex === index ? value : point,
      ),
    );
  };

  const removePoint = (index: number) => {
    setPoints((currentPoints) =>
      currentPoints.filter((_, pointIndex) => pointIndex !== index),
    );
  };

  const updateSignature = (index: number, signature: string) => {
    setSignatures((currentSignatures) =>
      currentSignatures.map((value, signatureIndex) =>
        signatureIndex === index ? signature : value,
      ),
    );
  };

  const formattedDate = date
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(`${date}T00:00:00`))
    : "________________________";

  const savePdf = async () => {
    setPdfError("");
    setIsSavingPdf(true);
    try {
      const { downloadAgreementPdf } = await import("@/lib/agreement-pdf");
      downloadAgreementPdf({
        place: place || "________________",
        formattedDate,
        points,
        signatures,
      });
    } catch (error) {
      console.error("Failed to generate the agreement PDF.", error);
      setPdfError(
        error instanceof Error
          ? `PDF gagal dibuat: ${error.message}`
          : "PDF gagal dibuat. Silakan coba lagi.",
      );
    } finally {
      setIsSavingPdf(false);
    }
  };

  const syncStatusClass = syncError || hasConflict
    ? "sync-status sync-error"
    : syncConfig
      ? "sync-status"
      : "sync-status sync-local";

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Perjanjian Kita, beranda">
          <span className="brand-icon"><HeartMark /></span>
          <span>perjanjian<span className="brand-light">kita</span></span>
        </a>
        <div className="topbar-actions">
          <span className="topbar-note">Dibuat dengan sepenuh hati <span>♡</span></span>
        </div>
      </header>

      <section className="intro">
        <div className="intro-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> CERITA KITA, JANJI KITA</p>
          <h1>Kesepakatan kecil,<br /><em>makna yang besar.</em></h1>
          <p className="intro-description">
            Tuangkan hal-hal yang ingin kalian jaga bersama. Tulis, tanda tangani,
            lalu simpan sebagai pengingat manis perjalanan kalian.
          </p>
        </div>
        <div className="intro-decoration" aria-hidden="true">
          <span className="decoration-sparkle">✳</span>
          <HeartMark />
          <span className="decoration-caption">always, in all ways</span>
        </div>
      </section>

      <div className="workspace">
        <aside className="editor-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RUANG MENYUSUN</p>
              <h2>Atur perjanjian</h2>
            </div>
            <span className="step-badge">01 — 03</span>
          </div>

          <label className="field-label" htmlFor="place">Tempat</label>
          <input
            id="place"
            className="text-input"
            placeholder="Contoh: Jakarta"
            maxLength={200}
            value={place}
            onChange={(event) => setPlace(event.target.value)}
          />

          <label className="field-label date-label" htmlFor="date">Tanggal perjanjian</label>
          <input
            id="date"
            className="text-input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />

          <div className="points-heading">
            <label className="field-label" htmlFor="new-point">Poin-poin kesepakatan</label>
            <span>{points.length} poin</span>
          </div>
          <div className="point-editor-list">
            {points.map((point, index) => (
              <div className="point-editor" key={index}>
                <span className="point-number">{String(index + 1).padStart(2, "0")}</span>
                <textarea
                  aria-label={`Isi poin ${index + 1}`}
                  value={point}
                  rows={2}
                  maxLength={4000}
                  onChange={(event) => updatePoint(index, event.target.value)}
                />
                <button
                  type="button"
                  className="remove-point"
                  aria-label={`Hapus poin ${index + 1}`}
                  onClick={() => removePoint(index)}
                >×</button>
              </div>
            ))}
          </div>
          <div className="add-point-row">
            <input
              id="new-point"
              className="text-input"
              placeholder="Tulis kesepakatan baru..."
              maxLength={4000}
              value={newPoint}
              onChange={(event) => setNewPoint(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addPoint();
                }
              }}
            />
            <button type="button" className="add-button" onClick={addPoint}>+</button>
          </div>
          {points.length >= 100 && (
            <p className="sync-message">Jumlah poin maksimal adalah 100.</p>
          )}

          <div className="editor-tip">
            <span className="tip-icon">✳</span>
            <p>Kesepakatan terbaik lahir dari obrolan yang jujur. Sesuaikan setiap poin dengan cerita kalian.</p>
          </div>

          <div className="export-actions">
            <button type="button" className="print-button" onClick={() => window.print()}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M5 7V2h10v5M5 14H3V8h14v6h-2M5 12h10v6H5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M14 10h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Cetak surat
            </button>
            <button
              type="button"
              className="pdf-button"
              onClick={savePdf}
              disabled={isSavingPdf}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 2v10m0 0 4-4m-4 4L6 8M3 14v3h14v-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isSavingPdf ? "Membuat PDF..." : "Simpan PDF"}
            </button>
            <button type="button" className="share-button" onClick={copyShareLink}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M8 12 12 8M10.5 5.5l1.8-1.8a3 3 0 1 1 4.2 4.2l-1.8 1.8M9.5 14.5l-1.8 1.8a3 3 0 1 1-4.2-4.2l1.8-1.8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Salin link snapshot
            </button>
          </div>

          {pdfError && <p className="pdf-error" role="alert">{pdfError}</p>}
          {storageError && <p className="pdf-error" role="alert">{storageError}</p>}
          {shareStatus && <p className="share-status">{shareStatus}</p>}
          {shareLink && (
            <textarea
              className="share-link"
              readOnly
              value={shareLink}
              aria-label="Tautan yang bisa disalin"
              onFocus={(event) => event.currentTarget.select()}
            />
          )}

          <div className="sync-panel" aria-live="polite">
            <p className={syncStatusClass}>
              <span className="sync-indicator" />
              {syncStatus}
            </p>
            {syncError && <p className="sync-message" role="alert">{syncError}</p>}
            {syncSuccessMessage && <p className="sync-success">{syncSuccessMessage}</p>}

            {hasConflict && (
              <div className="sync-actions-grid">
                <button
                  className="sync-primary-button"
                  type="button"
                  disabled={isSyncBusy}
                  onClick={resolveUseRemote}
                >
                  Muat versi terbaru dari pasangan
                </button>
                <button
                  className="sync-secondary-button"
                  type="button"
                  disabled={isSyncBusy}
                  onClick={resolveKeepLocal}
                >
                  Timpa dengan versi perangkat ini
                </button>
              </div>
            )}

            {syncConfig ? (
              <div className="sync-actions-grid">
                <button
                  className="sync-primary-button"
                  type="button"
                  onClick={copyPairingLink}
                >
                  Salin Link Pasangan (untuk Pacar)
                </button>
                <button
                  className="sync-secondary-button"
                  type="button"
                  disabled={isSyncBusy}
                  onClick={manualRefresh}
                >
                  {isSyncBusy ? "Menyegarkan..." : "Segarkan sekarang"}
                </button>
                <button
                  className="sync-danger-button"
                  type="button"
                  onClick={resetAgreement}
                >
                  Reset isi surat
                </button>
                <button
                  className="sync-text-button"
                  type="button"
                  onClick={disconnectSync}
                >
                  Putuskan sinkronisasi di perangkat ini
                </button>
              </div>
            ) : (
              <>
                <p className="sync-hint">
                  Aktifkan sinkronisasi GitHub Gist (tanpa database) supaya perubahanmu dan pacar otomatis tersimpan dari jaringan mana saja.
                </p>
                <div className="sync-actions-grid">
                  <button
                    className="sync-secondary-button"
                    type="button"
                    onClick={() => setShowSyncSetup((open) => !open)}
                  >
                    {showSyncSetup ? "Tutup pengaturan sinkronisasi" : "Aktifkan Sinkronisasi Lintas Jaringan"}
                  </button>
                  <button
                    className="sync-danger-button"
                    type="button"
                    onClick={resetAgreement}
                  >
                    Reset isi surat
                  </button>
                </div>

                {showSyncSetup && (
                  <div className="sync-setup">
                    <div className="sync-tabs">
                      <button
                        type="button"
                        className={`sync-tab ${setupMode === "create" ? "sync-tab-active" : ""}`}
                        onClick={() => setSetupMode("create")}
                      >
                        Buat Baru (HP 1)
                      </button>
                      <button
                        type="button"
                        className={`sync-tab ${setupMode === "pair" ? "sync-tab-active" : ""}`}
                        onClick={() => setSetupMode("pair")}
                      >
                        Link Pasangan (HP 2)
                      </button>
                    </div>

                    {setupMode === "create" ? (
                      <form onSubmit={handleCreateSync}>
                        <ol className="sync-steps">
                          <li>
                            Buat token GitHub (izin <strong>gist</strong>) di{" "}
                            <a
                              href="https://github.com/settings/tokens/new?scopes=gist&description=Perjanjian%20Kita"
                              target="_blank"
                              rel="noreferrer"
                            >
                              halaman Token GitHub
                            </a>.
                          </li>
                          <li>Tempel token di bawah lalu klik Hubungkan.</li>
                          <li>Kirim <strong>Link Pasangan</strong> ke pacarmu (cukup buka 1x).</li>
                        </ol>
                        <input
                          className="text-input"
                          type="password"
                          placeholder="Tempel GitHub Token (ghp_... / github_pat_...)"
                          value={tokenInput}
                          onChange={(event) => setTokenInput(event.target.value)}
                          required
                        />
                        <button
                          className="sync-primary-button"
                          type="submit"
                          disabled={isSyncBusy}
                        >
                          {isSyncBusy ? "Menghubungkan..." : "Buat & Hubungkan"}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handlePairSync}>
                        <p className="sync-hint">
                          Tempel Link Pasangan yang dikirim oleh pasanganmu jika tidak membukanya langsung.
                        </p>
                        <input
                          className="text-input"
                          type="text"
                          placeholder="Tempel Link Pasangan (#sync=...)"
                          value={pairInput}
                          onChange={(event) => setPairInput(event.target.value)}
                          required
                        />
                        <button
                          className="sync-primary-button"
                          type="submit"
                          disabled={isSyncBusy}
                        >
                          {isSyncBusy ? "Menyambungkan..." : "Sambungkan Perangkat"}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <p className="privacy-note">
            <span>♧</span> Otomatis tersimpan di perangkat &amp; siap disinkronkan tanpa database.
          </p>
        </aside>

        <section className="preview-section" aria-label="Pratinjau surat perjanjian">
          <div className="preview-topline">
            <div>
              <p className="eyebrow">PRATINJAU DOKUMEN</p>
              <span className="preview-subtitle">Begini tampilan perjanjian kalian</span>
            </div>
            <span className="paper-count">A4 <span>·</span> 1 halaman</span>
          </div>

          <article className="document">
            <div className="document-inner">
              <div className="document-heading">
                <div className="document-ornament">✳</div>
                <p className="document-kicker">DIBUAT DENGAN KASIH &amp; KEPERCAYAAN</p>
                <h2>Surat Perjanjian</h2>
                <div className="document-subtitle"><span /> Kesepakatan Bersama <span /></div>
              </div>

              <div className="document-body">
                <p className="opening">
                  Pada hari ini, {formattedDate}, bertempat di {place || "________________"}, kami yang
                  bertanda tangan di bawah ini:
                </p>
                <div className="party-list">
                  <p><span className="party-index">I.</span><strong>Agil Pamungkas, S.Kom.</strong>, selanjutnya disebut sebagai <em>Pihak Pertama</em>.</p>
                  <p><span className="party-index">II.</span><strong>Alia Pramesti, S.M.</strong>, selanjutnya disebut sebagai <em>Pihak Kedua</em>.</p>
                </div>
                <p className="preamble">
                  Dengan penuh kesadaran, ketulusan, dan rasa saling menyayangi, kedua belah
                  pihak sepakat untuk mengikatkan diri dalam perjanjian ini. Kesepakatan ini
                  dibuat sebagai pengingat atas niat baik dan komitmen kami untuk terus tumbuh
                  bersama, dengan ketentuan sebagai berikut:
                </p>

                <ol className="agreement-list">
                  {points.length === 0 ? (
                    <li className="empty-agreement">Poin kesepakatan kalian akan muncul di sini.</li>
                  ) : points.map((point, index) => (
                    <li key={index}><span className="agreement-number">{String(index + 1).padStart(2, "0")}</span><span>{point || "—"}</span></li>
                  ))}
                </ol>

                <p className="closing">
                  Demikian perjanjian ini kami buat dengan itikad baik, tanpa paksaan dari
                  pihak mana pun. Semoga setiap janji yang tertulis menjadi pengingat untuk
                  senantiasa saling menjaga dan menyayangi.
                </p>

                <div className="signature-date">{place || "________________"}, {formattedDate}</div>
                <div className="signature-area">
                  <div className="signature-column">
                    <p className="signature-role">Pihak Pertama</p>
                    <SignaturePad label="Tanda tangan Agil" signature={signatures[0]} onChange={(value) => updateSignature(0, value)} />
                    <div className="signature-printed-name">Agil Pamungkas, S.Kom.</div>
                  </div>
                  <div className="signature-column">
                    <p className="signature-role">Pihak Kedua</p>
                    <SignaturePad label="Tanda tangan Alia" signature={signatures[1]} onChange={(value) => updateSignature(1, value)} />
                    <div className="signature-printed-name">Alia Pramesti, S.M.</div>
                  </div>
                  <div className="heart-divider"><HeartMark /></div>
                </div>
                <div className="stamp" aria-label="Materai sepuluh ribu rupiah">
                  <span className="stamp-top">METERAI</span>
                  <strong>Rp10.000</strong>
                  <span className="stamp-bottom">TEMPEL DI SINI</span>
                </div>
                <p className="document-footnote">Dua hati, satu kesepakatan <span>♡</span></p>
              </div>
            </div>
          </article>
        </section>
      </div>
      <footer className="page-footer">Dibuat untuk dirayakan, bukan sekadar ditandatangani <span>♡</span></footer>
    </main>
  );
}
