export type SavedAgreement = {
  points: string[];
  date: string;
  place: string;
  signatures: string[];
};

export const AGREEMENT_STORAGE_KEY = "perjanjiankita:agreement:v1";
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
