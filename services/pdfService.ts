import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { InvoiceAllocation, Project, SavedInvoice } from '../types';

export const stampInvoicePdf = async (
  originalPdfBase64: string,
  invoice: SavedInvoice,
  project: Project,
  allocations: InvoiceAllocation[]
): Promise<Uint8Array> => {
  try {
    // 1. Load the PDF
    const pdfDoc = await PDFDocument.load(originalPdfBase64);
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // 2. Prepare Fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // 3. Prepare Text Content
    const projectText = `Project: ${project.name} (#${project.id})`;
    const invoiceText = `Internal Invoice ID: #${invoice.internal_id}`;
    
    // Summarize allocations (e.g., "1001: 5000 | 2005: 1200")
    const allocationSummary = allocations.map(a => 
      `${a.budget_line?.account_number || '?'}: ${new Intl.NumberFormat('cs-CZ').format(a.amount)}`
    ).join(' | ');
    
    const allocationText = `Allocations: ${allocationSummary}`;

    // 4. Draw Background Rectangle (Footer)
    // Draw a white box at the bottom to ensure text is readable
    const footerHeight = 50;
    firstPage.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: footerHeight,
      color: rgb(1, 1, 1), // White
      opacity: 0.9,
    });

    // 5. Draw Text
    const fontSize = 10;
    const textColor = rgb(0, 0, 0);
    const yPosition = 30;
    const yPosition2 = 15;

    // Line 1: Project & Invoice ID
    firstPage.drawText(`${projectText}  |  ${invoiceText}`, {
      x: 20,
      y: yPosition,
      size: fontSize,
      font: fontBold,
      color: textColor,
    });

    // Line 2: Allocations
    firstPage.drawText(allocationText, {
      x: 20,
      y: yPosition2,
      size: fontSize - 1,
      font: font,
      color: rgb(0.2, 0.2, 0.2),
    });

    // 6. Save
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;

  } catch (error) {
    console.error("Error stamping PDF:", error);
    throw new Error("Failed to generate PDF stamp.");
  }
};