"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

const STORAGE_KEY = "perjanjiankita:agreement:v1";
const MAX_SHARE_TOKEN_LENGTH = 100_000;
const initialPoints = [
  "Kami sepakat untuk saling menghargai, menjaga kepercayaan, dan berkomunikasi dengan jujur dalam keadaan apa pun.",
  "Kami akan meluangkan waktu untuk satu sama lain dan menyelesaikan setiap perbedaan dengan kepala dingin.",
  "Kami berkomitmen untuk saling mendukung dalam bertumbuh, meraih cita-cita, dan menjaga kebahagiaan bersama.",
];

type SavedAgreement = {
  points: string[];
  date: string;
  place: string;
  signatures: string[];
};

function isSavedAgreement(value: unknown): value is SavedAgreement {
  if (typeof value !== "object" || value === null) return false;
  const saved = value as Record<string, unknown>;
  return (
    Array.isArray(saved.points) &&
    saved.points.every((point) => typeof point === "string") &&
    typeof saved.date === "string" &&
    typeof saved.place === "string" &&
    Array.isArray(saved.signatures) &&
    saved.signatures.length === 2 &&
    saved.signatures.every(
      (signature) =>
        typeof signature === "string" &&
        (!signature || /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(signature)),
    )
  );
}

function encodeSharedAgreement(agreement: SavedAgreement) {
  const bytes = new TextEncoder().encode(JSON.stringify(agreement));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSharedAgreement(token: string): SavedAgreement {
  if (!token || token.length > MAX_SHARE_TOKEN_LENGTH) {
    throw new Error("Tautan berbagi tidak valid atau terlalu panjang.");
  }
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(paddedBase64), (character) =>
    character.charCodeAt(0),
  );
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!isSavedAgreement(value)) {
    throw new Error("Isi tautan berbagi tidak valid.");
  }
  return value;
}

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
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!signature) return;

    const image = new Image();
    image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.src = signature;
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
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
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
  const [isSavingPdf, setIsSavingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    const sharedToken = new URLSearchParams(window.location.hash.slice(1)).get(
      "agreement",
    );
    if (sharedToken) {
      try {
        const sharedAgreement = decodeSharedAgreement(sharedToken);
        setPoints(sharedAgreement.points);
        setDate(sharedAgreement.date);
        setPlace(sharedAgreement.place);
        setSignatures(sharedAgreement.signatures);
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
        setShareMessage(
          "Perjanjian dari tautan dimuat dan tersimpan di perangkat ini.",
        );
      } catch (error) {
        console.error("Failed to load the shared agreement.", error);
        setShareError(
          "Tautan berbagi tidak valid atau terlalu panjang. Minta tautan baru.",
        );
      }
    } else {
      try {
        const savedValue = window.localStorage.getItem(STORAGE_KEY);
        if (savedValue) {
          const parsedValue: unknown = JSON.parse(savedValue);
          if (!isSavedAgreement(parsedValue)) {
            throw new Error("Data perjanjian tersimpan tidak valid.");
          }
          setPoints(parsedValue.points);
          setDate(parsedValue.date);
          setPlace(parsedValue.place);
          setSignatures(parsedValue.signatures);
        }
      } catch (error) {
        console.error("Failed to load the saved agreement.", error);
        setStorageError(
          "Data tersimpan tidak dapat dibaca. Perubahan baru mungkin tidak tersimpan.",
        );
      }
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;

    try {
      const savedAgreement: SavedAgreement = { points, date, place, signatures };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedAgreement));
      setStorageError("");
    } catch (error) {
      console.error("Failed to save the agreement on this device.", error);
      setStorageError(
        "Perubahan gagal disimpan di perangkat ini. Periksa ruang penyimpanan browser.",
      );
    }
  }, [date, isHydrated, place, points, signatures]);

  const addPoint = () => {
    const trimmedPoint = newPoint.trim();
    if (!trimmedPoint) return;
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

  const shareAgreement = async () => {
    setShareError("");
    setShareMessage("");
    try {
      const agreement: SavedAgreement = { points, date, place, signatures };
      const shareUrl = new URL(window.location.href);
      shareUrl.hash = `agreement=${encodeSharedAgreement(agreement)}`;

      if (navigator.share) {
        await navigator.share({
          title: "Perjanjian Kita",
          text: "Buka perjanjian kita",
          url: shareUrl.toString(),
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl.toString());
      } else {
        window.prompt("Salin tautan berbagi ini:", shareUrl.toString());
      }
      setShareMessage(
        "Tautan berisi salinan perjanjian saat ini. Bagikan tautan baru jika ada perubahan.",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Failed to share the agreement.", error);
      setShareError(
        "Tautan gagal dibagikan. Coba lagi atau gunakan browser yang mendukung berbagi.",
      );
    }
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

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Perjanjian Kita, beranda">
          <span className="brand-icon"><HeartMark /></span>
          <span>perjanjian<span className="brand-light">kita</span></span>
        </a>
        <span className="topbar-note">Dibuat dengan sepenuh hati <span>♡</span></span>
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
            <button
              type="button"
              className="share-button"
              onClick={shareAgreement}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M7.5 10.5 12.5 7m-5 6 5 3M5.5 12a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm9-6a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Zm0 11a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Bagikan perjanjian
            </button>
          </div>
          {pdfError && <p className="pdf-error" role="alert">{pdfError}</p>}
          {shareError && <p className="pdf-error" role="alert">{shareError}</p>}
          {shareMessage && <p className="share-status" role="status">{shareMessage}</p>}
          {storageError && <p className="pdf-error" role="alert">{storageError}</p>}
          <p className="privacy-note"><span>♧</span> Perjanjian tersimpan otomatis di perangkat ini.</p>
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
