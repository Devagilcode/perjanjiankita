"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  AGREEMENT_STORAGE_KEY,
  createDefaultAgreement,
  initialPoints,
  isSavedAgreement,
  type SavedAgreement,
} from "@/lib/agreement";

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

export default function Home() {
  const [points, setPoints] = useState(initialPoints);
  const [newPoint, setNewPoint] = useState("");
  const [date, setDate] = useState("");
  const [place, setPlace] = useState("");
  const [signatures, setSignatures] = useState(["", ""]);
  const [isRemoteReady, setIsRemoteReady] = useState(false);

  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [syncStatus, setSyncStatus] = useState("Memuat perjanjian...");
  const [syncError, setSyncError] = useState("");
  const [hasConflict, setHasConflict] = useState(false);
  const [hasStoredRemote, setHasStoredRemote] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveRetry, setSaveRetry] = useState(0);

  const revisionRef = useRef<string | null>(null);
  const savedSnapshotRef = useRef("");
  const currentSnapshotRef = useRef("");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const agreement: SavedAgreement = { points, date, place, signatures };
  const agreementSnapshot = JSON.stringify(agreement);
  currentSnapshotRef.current = agreementSnapshot;

  const persistLocalBackup = useCallback((snapshot: string) => {
    try {
      window.localStorage.setItem(AGREEMENT_STORAGE_KEY, snapshot);
    } catch {
      // Ignore non-fatal localStorage backup errors.
    }
  }, []);

  const applyAgreement = useCallback(
    (saved: SavedAgreement, markAsSaved = true) => {
      const snapshot = JSON.stringify(saved);
      setPoints(saved.points);
      setDate(saved.date);
      setPlace(saved.place);
      setSignatures(saved.signatures);
      currentSnapshotRef.current = snapshot;
      if (markAsSaved) {
        savedSnapshotRef.current = snapshot;
      }
      persistLocalBackup(snapshot);
    },
    [persistLocalBackup],
  );

  const fetchRemoteAgreement = useCallback(async () => {
    const response = await fetch("/api/agreement", { cache: "no-store" });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      throw new Error(result.error || "Gagal memuat perjanjian bersama.");
    }
    return (await response.json()) as {
      agreement: SavedAgreement | null;
      etag: string | null;
    };
  }, []);

  // Load saved agreement immediately on page open (no login required).
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let localBackup: SavedAgreement | null = null;
      try {
        const localRaw = window.localStorage.getItem(AGREEMENT_STORAGE_KEY);
        if (localRaw) {
          const parsed: unknown = JSON.parse(localRaw);
          if (isSavedAgreement(parsed)) {
            localBackup = parsed;
          }
        }
      } catch {
        localBackup = null;
      }

      if (localBackup) {
        applyAgreement(localBackup, false);
      }

      try {
        const remote = await fetchRemoteAgreement();
        if (cancelled) return;
        revisionRef.current = remote.etag;
        setHasStoredRemote(Boolean(remote.etag));

        if (remote.agreement) {
          applyAgreement(remote.agreement, true);
          setSyncStatus("Tersimpan otomatis & sinkron");
        } else if (localBackup) {
          applyAgreement(localBackup, false);
          savedSnapshotRef.current = "";
          setSyncStatus("Menyimpan data ke penyimpanan bersama...");
        } else {
          applyAgreement(createDefaultAgreement(), true);
          setSyncStatus("Siap ditulis — otomatis tersimpan");
        }
        setSyncError("");
        setHasConflict(false);
        setIsRemoteReady(true);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load remote agreement.", error);
        setSyncError(
          error instanceof Error ? error.message : "Gagal menghubungkan ke server.",
        );
        setSyncStatus("Tersimpan di perangkat (offline)");
        setIsRemoteReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyAgreement, fetchRemoteAgreement]);

  // Immediate local backup on every edit.
  useEffect(() => {
    if (!isRemoteReady) return;
    persistLocalBackup(agreementSnapshot);
  }, [agreementSnapshot, isRemoteReady, persistLocalBackup]);

  // Automatic debounced save to JSON file / Vercel Blob.
  useEffect(() => {
    if (!isRemoteReady || hasConflict) return;
    const retryDelay = Math.min(
      2500 * 2 ** Math.min(Math.max(saveRetry - 1, 0), 4),
      30_000,
    );

    const timeout = window.setTimeout(() => {
      const snapshot = currentSnapshotRef.current;
      if (snapshot === savedSnapshotRef.current) return;

      const save = async () => {
        if (hasConflict || snapshot === savedSnapshotRef.current) return;
        setIsSyncing(true);
        setSyncStatus("Menyimpan otomatis...");
        setSyncError("");
        try {
          const response = await fetch("/api/agreement", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agreement: JSON.parse(snapshot) as SavedAgreement,
              etag: revisionRef.current,
            }),
          });
          if (response.status === 409) {
            setHasConflict(true);
            setSyncStatus("Ada perubahan baru dari perangkat lain.");
            setSyncError(
              "Perubahan lokal ditahan agar tidak menimpa editan pasanganmu.",
            );
            return;
          }
          if (!response.ok) {
            const result = (await response.json()) as { error?: string };
            throw new Error(result.error || "Gagal menyimpan perubahan.");
          }
          const result = (await response.json()) as { etag: string };
          revisionRef.current = result.etag;
          setHasStoredRemote(true);
          savedSnapshotRef.current = snapshot;
          setSaveRetry(0);
          setSyncStatus("Tersimpan otomatis & sinkron");
        } catch (error) {
          console.error("Failed to auto-save agreement.", error);
          setSyncError(
            error instanceof Error ? error.message : "Gagal menyimpan data.",
          );
          setSyncStatus("Menunggu koneksi untuk menyimpan...");
          setSaveRetry((attempt) => attempt + 1);
        } finally {
          setIsSyncing(false);
        }
      };

      saveQueueRef.current = saveQueueRef.current.then(save, save);
    }, saveRetry ? retryDelay : 600);

    return () => window.clearTimeout(timeout);
  }, [agreementSnapshot, hasConflict, isRemoteReady, saveRetry]);

  // Background polling & tab-focus sync so partner edits appear automatically.
  useEffect(() => {
    if (!isRemoteReady) return;

    const refreshWhenIdle = () => {
      if (
        document.hidden ||
        hasConflict ||
        currentSnapshotRef.current !== savedSnapshotRef.current
      ) {
        return;
      }
      void fetchRemoteAgreement()
        .then((remote) => {
          if (remote.etag === revisionRef.current) return;
          if (currentSnapshotRef.current !== savedSnapshotRef.current) {
            setHasConflict(true);
            setSyncStatus("Ada perubahan baru dari perangkat lain.");
            setSyncError(
              "Perjanjian berubah di perangkat lain. Pilih versi yang ingin dipakai.",
            );
            return;
          }
          revisionRef.current = remote.etag;
          setHasStoredRemote(Boolean(remote.etag));
          if (remote.agreement) {
            applyAgreement(remote.agreement, true);
            setSyncStatus("Perubahan dari perangkat lain dimuat.");
          } else {
            applyAgreement(createDefaultAgreement(), true);
            setSyncStatus("Surat dikembalikan ke template awal.");
          }
        })
        .catch(() => {
          // Silent retry on next interval.
        });
    };

    const handleOnline = () => {
      if (currentSnapshotRef.current !== savedSnapshotRef.current) {
        setSaveRetry((attempt) => (attempt === 0 ? 1 : attempt));
      } else {
        refreshWhenIdle();
      }
    };

    const interval = window.setInterval(refreshWhenIdle, 5_000);
    window.addEventListener("focus", refreshWhenIdle);
    document.addEventListener("visibilitychange", refreshWhenIdle);
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenIdle);
      document.removeEventListener("visibilitychange", refreshWhenIdle);
      window.removeEventListener("online", handleOnline);
    };
  }, [applyAgreement, fetchRemoteAgreement, hasConflict, isRemoteReady]);

  const loadLatestAgreement = async () => {
    setIsSyncing(true);
    setSyncError("");
    try {
      const remote = await fetchRemoteAgreement();
      revisionRef.current = remote.etag;
      setHasStoredRemote(Boolean(remote.etag));
      applyAgreement(remote.agreement || createDefaultAgreement(), true);
      setHasConflict(false);
      setSyncStatus(
        remote.agreement
          ? "Versi terbaru berhasil dimuat."
          : "Siap ditulis — otomatis tersimpan",
      );
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Gagal memuat versi terbaru.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const forceSaveLocalAgreement = async () => {
    setIsSyncing(true);
    setSyncError("");
    try {
      const snapshot = currentSnapshotRef.current;
      const response = await fetch("/api/agreement", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreement: JSON.parse(snapshot) as SavedAgreement,
          etag: revisionRef.current,
          force: true,
        }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "Gagal menimpa data.");
      }
      const result = (await response.json()) as { etag: string };
      revisionRef.current = result.etag;
      setHasStoredRemote(true);
      savedSnapshotRef.current = snapshot;
      setHasConflict(false);
      setSaveRetry(0);
      setSyncStatus("Tersimpan otomatis & sinkron");
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Gagal menyimpan versi ini.",
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const resetSharedAgreement = async () => {
    if (
      !window.confirm(
        "Hapus isi & tanda tangan lalu kembalikan ke template awal untuk kalian berdua?",
      )
    ) {
      return;
    }

    if (revisionRef.current) {
      try {
        const response = await fetch("/api/agreement", {
          method: "DELETE",
          headers: { "If-Match": revisionRef.current },
        });
        if (response.status === 409) {
          setHasConflict(true);
          setSyncStatus("Ada perubahan baru dari perangkat lain.");
          setSyncError("Muat versi terbaru dahulu sebelum mereset surat.");
          return;
        }
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          throw new Error(result.error || "Gagal mereset surat.");
        }
      } catch (error) {
        setSyncError(
          error instanceof Error ? error.message : "Gagal mereset surat.",
        );
        return;
      }
    }

    revisionRef.current = null;
    setHasStoredRemote(false);
    setHasConflict(false);
    setSyncError("");
    applyAgreement(createDefaultAgreement(), true);
    setSyncStatus("Surat dikembalikan ke template awal.");
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
    : isSyncing || agreementSnapshot !== savedSnapshotRef.current
      ? "sync-status sync-pending"
      : "sync-status";

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
          </div>
          {pdfError && <p className="pdf-error" role="alert">{pdfError}</p>}

          <div className="sync-panel" aria-live="polite">
            <p className={syncStatusClass}>
              <span className="sync-indicator" />
              {syncStatus}
            </p>
            {syncError && <p className="sync-message" role="alert">{syncError}</p>}

            {hasConflict && (
              <div className="sync-actions-grid">
                <button
                  className="sync-primary-button"
                  type="button"
                  disabled={isSyncing}
                  onClick={loadLatestAgreement}
                >
                  Muat versi terbaru
                </button>
                <button
                  className="sync-secondary-button"
                  type="button"
                  disabled={isSyncing}
                  onClick={forceSaveLocalAgreement}
                >
                  Timpa dengan versi ini
                </button>
              </div>
            )}

            {hasStoredRemote && (
              <div className="sync-actions-grid">
                <button
                  className="sync-danger-button"
                  type="button"
                  disabled={agreementSnapshot !== savedSnapshotRef.current || isSyncing}
                  onClick={resetSharedAgreement}
                >
                  Reset surat bersama
                </button>
              </div>
            )}
          </div>

          <p className="privacy-note">
            <span>♧</span> Tersimpan otomatis tanpa database dan langsung sinkron.
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
