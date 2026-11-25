import { jsPDF } from "jspdf";

export type AgreementPdfData = {
  place: string;
  formattedDate: string;
  points: string[];
  signatures: string[];
};

type ParagraphOptions = {
  align?: "left" | "center" | "right" | "justify";
  after?: number;
  fontSize?: number;
  fontStyle?: "normal" | "bold" | "italic";
  indent?: number;
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN_X = 20;
const PAGE_TOP = 19;
const PAGE_BOTTOM = 279;
const BODY_FONT_SIZE = 12;
const LINE_HEIGHT_FACTOR = 1.35;

function drawHeart(
  pdf: jsPDF,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
) {
  const rawPoints = Array.from({ length: 49 }, (_, index) => {
    const angle = (index / 48) * Math.PI * 2;
    return {
      x: 16 * Math.sin(angle) ** 3,
      y:
        13 * Math.cos(angle) -
        5 * Math.cos(2 * angle) -
        2 * Math.cos(3 * angle) -
        Math.cos(4 * angle),
    };
  });
  const xValues = rawPoints.map((point) => point.x);
  const yValues = rawPoints.map((point) => point.y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const points = rawPoints.map((point) => ({
    x: ((point.x - minX) / (maxX - minX)) * width,
    y: ((maxY - point.y) / (maxY - minY)) * height,
  }));
  const firstPoint = points[0];
  const segments = points.slice(1).map((point, index) => [
    point.x - points[index].x,
    point.y - points[index].y,
  ]);

  pdf.setDrawColor(190, 124, 134);
  pdf.setLineWidth(0.35);
  pdf.lines(
    segments,
    centerX - width / 2 + firstPoint.x,
    centerY - height / 2 + firstPoint.y,
    [1, 1],
    "S",
    true,
  );
}

export function downloadAgreementPdf({
  place,
  formattedDate,
  points,
  signatures,
}: AgreementPdfData) {
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const contentWidth = PAGE_WIDTH - MARGIN_X * 2;
  let y = PAGE_TOP;

  pdf.setProperties({
    title: "Surat Perjanjian Agil Pamungkas dan Alia Pramesti",
    subject: "Kesepakatan bersama",
  });
  pdf.setLineHeightFactor(LINE_HEIGHT_FACTOR);

  const addPage = () => {
    pdf.addPage("a4", "portrait");
    y = PAGE_TOP;
  };

  const addParagraph = (text: string, options: ParagraphOptions = {}) => {
    const {
      align = "justify",
      after = 4,
      fontSize = BODY_FONT_SIZE,
      fontStyle = "normal",
      indent = 0,
    } = options;
    const lineHeight = (fontSize * 0.3528) * LINE_HEIGHT_FACTOR;
    const lines = pdf.splitTextToSize(text, contentWidth - indent) as string[];
    let lineIndex = 0;

    pdf.setFont("times", fontStyle);
    pdf.setFontSize(fontSize);

    while (lineIndex < lines.length) {
      if (y + lineHeight > PAGE_BOTTOM) addPage();
      const availableLines = Math.max(
        1,
        Math.floor((PAGE_BOTTOM - y) / lineHeight),
      );
      const pageLines = lines.slice(lineIndex, lineIndex + availableLines);
      const x = align === "center" ? PAGE_WIDTH / 2 : MARGIN_X + indent;
      pdf.text(pageLines, x, y, {
        align,
        lineHeightFactor: LINE_HEIGHT_FACTOR,
        maxWidth: contentWidth - indent,
      });
      y += pageLines.length * lineHeight;
      lineIndex += pageLines.length;
      if (lineIndex < lines.length) addPage();
    }

    y += after;
    if (y > PAGE_BOTTOM) addPage();
  };

  pdf.setTextColor(153, 89, 102);
  pdf.setFont("times", "bold");
  pdf.setFontSize(9);
  pdf.text("DIBUAT DENGAN KASIH & KEPERCAYAAN", PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 12;

  pdf.setTextColor(55, 45, 49);
  pdf.setFont("times", "normal");
  pdf.setFontSize(20);
  pdf.text("SURAT PERJANJIAN", PAGE_WIDTH / 2, y, { align: "center" });
  y += 8;

  pdf.setFont("times", "italic");
  pdf.setFontSize(BODY_FONT_SIZE);
  pdf.setTextColor(135, 101, 106);
  pdf.text("Kesepakatan Bersama", PAGE_WIDTH / 2, y, { align: "center" });
  y += 5;

  pdf.setDrawColor(222, 201, 197);
  pdf.setLineWidth(0.3);
  pdf.line(PAGE_WIDTH / 2 - 18, y, PAGE_WIDTH / 2 + 18, y);
  y += 10;

  pdf.setTextColor(48, 43, 45);
  addParagraph(
    `Pada hari ini, ${formattedDate}, bertempat di ${place || "________________"}, kami yang bertanda tangan di bawah ini:`,
    { after: 5 },
  );
  addParagraph(
    "I. Agil Pamungkas, S.Kom., selanjutnya disebut sebagai Pihak Pertama.",
    { align: "left", after: 2, indent: 5 },
  );
  addParagraph(
    "II. Alia Pramesti, S.M., selanjutnya disebut sebagai Pihak Kedua.",
    { align: "left", after: 5, indent: 5 },
  );
  addParagraph(
    "Dengan penuh kesadaran, ketulusan, dan rasa saling menyayangi, kedua belah pihak sepakat untuk mengikatkan diri dalam perjanjian ini. Kesepakatan ini dibuat sebagai pengingat atas niat baik dan komitmen kami untuk terus tumbuh bersama, dengan ketentuan sebagai berikut:",
    { after: 5 },
  );

  if (points.length === 0) {
    addParagraph("Poin kesepakatan belum ditambahkan.", {
      align: "left",
      after: 5,
      indent: 12,
    });
  } else {
    points.forEach((point, index) => {
      const text = point.trim() || "—";
      const lineHeight = (BODY_FONT_SIZE * 0.3528) * LINE_HEIGHT_FACTOR;
      const number = String(index + 1).padStart(2, "0");
      const lines = pdf.splitTextToSize(text, contentWidth - 12) as string[];
      let lineIndex = 0;

      pdf.setFont("times", "normal");
      pdf.setFontSize(BODY_FONT_SIZE);

      while (lineIndex < lines.length) {
        if (y + lineHeight > PAGE_BOTTOM) addPage();
        const availableLines = Math.max(
          1,
          Math.floor((PAGE_BOTTOM - y) / lineHeight),
        );
        const pageLines = lines.slice(lineIndex, lineIndex + availableLines);
        if (lineIndex === 0) {
          pdf.setFont("times", "bold");
          pdf.text(number, MARGIN_X, y);
          pdf.setFont("times", "normal");
        }
        pdf.text(pageLines, MARGIN_X + 12, y, {
          align: "justify",
          lineHeightFactor: LINE_HEIGHT_FACTOR,
          maxWidth: contentWidth - 12,
        });
        y += pageLines.length * lineHeight;
        lineIndex += pageLines.length;
        if (lineIndex < lines.length) addPage();
      }

      y += 3;
    });
  }

  addParagraph(
    "Demikian perjanjian ini kami buat dengan itikad baik, tanpa paksaan dari pihak mana pun. Semoga setiap janji yang tertulis menjadi pengingat untuk senantiasa saling menjaga dan menyayangi.",
    { after: 4 },
  );

  const signatureLocation = `${place || "________________"}, ${formattedDate}`;
  const signatureLocationLines = pdf.splitTextToSize(
    signatureLocation,
    contentWidth,
  ) as string[];
  const signatureLocationLineHeight =
    (BODY_FONT_SIZE * 0.3528) * LINE_HEIGHT_FACTOR;
  const signatureLocationExtraHeight =
    (signatureLocationLines.length - 1) * signatureLocationLineHeight;

  if (y + 84 + signatureLocationExtraHeight > PAGE_BOTTOM) addPage();

  pdf.setFont("times", "normal");
  pdf.setFontSize(BODY_FONT_SIZE);
  pdf.text(signatureLocationLines, PAGE_WIDTH / 2, y, {
    align: "center",
    lineHeightFactor: LINE_HEIGHT_FACTOR,
    maxWidth: contentWidth,
  });
  y += 10 + signatureLocationExtraHeight;

  const columnWidth = 72;
  const leftX = MARGIN_X + 4;
  const rightX = PAGE_WIDTH - MARGIN_X - columnWidth - 4;
  const signatureTop = y + 4;
  const lineY = signatureTop + 26;
  const printedNameY = lineY + 6;

  pdf.setFont("times", "italic");
  pdf.setFontSize(BODY_FONT_SIZE);
  pdf.setTextColor(90, 78, 82);
  pdf.text("Pihak Pertama", leftX + columnWidth / 2, y, { align: "center" });
  pdf.text("Pihak Kedua", rightX + columnWidth / 2, y, { align: "center" });

  if (signatures[0]) {
    pdf.addImage(signatures[0], "PNG", leftX + 1, signatureTop, columnWidth - 2, 23);
  }
  if (signatures[1]) {
    pdf.addImage(signatures[1], "PNG", rightX + 1, signatureTop, columnWidth - 2, 23);
  }

  pdf.setDrawColor(130, 113, 116);
  pdf.setLineWidth(0.25);
  pdf.line(leftX, lineY, leftX + columnWidth, lineY);
  pdf.line(rightX, lineY, rightX + columnWidth, lineY);
  pdf.setFont("times", "bold");
  pdf.setFontSize(BODY_FONT_SIZE);
  pdf.text("Agil Pamungkas, S.Kom.", leftX + columnWidth / 2, printedNameY, {
    align: "center",
  });
  pdf.text("Alia Pramesti, S.M.", rightX + columnWidth / 2, printedNameY, {
    align: "center",
  });

  drawHeart(pdf, PAGE_WIDTH / 2, signatureTop + 11, 12, 11);

  const stampWidth = 34;
  const stampHeight = 22;
  const stampX = (PAGE_WIDTH - stampWidth) / 2;
  const stampY = printedNameY + 9;
  pdf.setDrawColor(180, 103, 107);
  pdf.setLineWidth(0.35);
  pdf.rect(stampX, stampY, stampWidth, stampHeight);
  pdf.setTextColor(165, 88, 94);
  pdf.setFont("times", "bold");
  pdf.setFontSize(7);
  pdf.text("METERAI", PAGE_WIDTH / 2, stampY + 5, { align: "center" });
  pdf.setFontSize(12);
  pdf.text("Rp10.000", PAGE_WIDTH / 2, stampY + 12, { align: "center" });
  pdf.setFont("times", "normal");
  pdf.setFontSize(6);
  pdf.text("TEMPEL DI SINI", PAGE_WIDTH / 2, stampY + 18, { align: "center" });

  pdf.setFont("times", "italic");
  pdf.setFontSize(9);
  pdf.setTextColor(150, 125, 128);
  pdf.text("Dua hati, satu kesepakatan", PAGE_WIDTH / 2, stampY + stampHeight + 7, {
    align: "center",
  });

  pdf.save("Surat-Perjanjian-Agil-dan-Alia-A4.pdf");
}
