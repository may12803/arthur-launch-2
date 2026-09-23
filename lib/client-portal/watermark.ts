import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Stamps every page of a shared PDF with who it was shared with and when, so a
// forwarded copy still names its source. Non-PDF files are returned unchanged;
// the recipient page says only PDFs carry the mark.
export async function watermarkPdf(bytes: Buffer, line: string): Promise<Buffer> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const page of pdf.getPages()) {
      const { width } = page.getSize();
      const size = 7.5;
      const w = font.widthOfTextAtSize(line, size);
      page.drawText(line, { x: Math.max(12, (width - w) / 2), y: 12, size, font, color: rgb(0.45, 0.45, 0.48), opacity: 0.85 });
    }
    return Buffer.from(await pdf.save());
  } catch {
    return bytes; // encrypted or malformed PDF: deliver as-is rather than fail
  }
}

export const isPdf = (name: string, type: string) => type === "application/pdf" || /\.pdf$/i.test(name);
