import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import QRCode from 'qrcode';

export interface VerificationReportData {
  docId: string;
  docTitle: string;
  docType: string;
  caseId: string;
  caseNumber?: string;
  versionNumber: number;
  storagePath: string;
  status: 'VERIFIED' | 'TAMPERED';
  hashesMatch: boolean;
  registeredHash: string;
  computedHash: string;
  blockchainEventsCount: number;
  auditEventsCount: number;
  systemSignature: string;
  verifiedAt: string;
  checkedBy: string;
}

/**
 * Generates a court-ready tamper verification report in PDF format
 * Compliant with workflow-tamper-verification-report and Section 65B Indian Evidence Act standards.
 */
export async function generateVerificationReportPdf(data: VerificationReportData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 format
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const isTampered = data.status === 'TAMPERED' || !data.hashesMatch;

  // Colors
  const colorPrimary = rgb(0.12, 0.23, 0.45); // Deep Navy
  const colorSuccess = rgb(0.13, 0.65, 0.35); // Emerald Green
  const colorDanger = rgb(0.85, 0.15, 0.15); // Crimson Red
  const colorGray = rgb(0.4, 0.43, 0.48);
  const colorDark = rgb(0.1, 0.12, 0.15);
  const colorLightBg = rgb(0.96, 0.97, 0.98);

  // 1. Header Banner
  page.drawRectangle({
    x: 0,
    y: height - 80,
    width,
    height: 80,
    color: colorPrimary,
  });

  page.drawText('INTEGRATED CRIMINAL JUSTICE SYSTEM (ICJS)', {
    x: 40,
    y: height - 35,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page.drawText('SDIIL EVIDENCE VAULT — STATUTORY TAMPER VERIFICATION REPORT', {
    x: 40,
    y: height - 52,
    size: 10,
    font: fontRegular,
    color: rgb(0.85, 0.9, 1),
  });

  page.drawText('CERTIFICATE OF CRYPTOGRAPHIC EVIDENCE INTEGRITY (SEC. 65B IEA)', {
    x: 40,
    y: height - 66,
    size: 8,
    font: fontBold,
    color: rgb(0.7, 0.8, 0.95),
  });

  // 2. Large Status Banner
  const bannerY = height - 150;
  const bannerColor = isTampered ? colorDanger : colorSuccess;

  page.drawRectangle({
    x: 40,
    y: bannerY,
    width: width - 80,
    height: 54,
    color: bannerColor,
  });

  const statusText = isTampered
    ? 'STATUS: TAMPER DETECTED / INTEGRITY BREACH'
    : 'STATUS: VERIFIED (AUTHENTIC & UNALTERED)';

  page.drawText(statusText, {
    x: 55,
    y: bannerY + 30,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  const statusSubtext = isTampered
    ? 'CRITICAL WARNING: Storage raw bytes do not match immutable blockchain anchor registration.'
    : 'CONFIRMED: Decrypted storage bytes match registered raw ingest buffer hash byte-for-byte.';

  page.drawText(statusSubtext, {
    x: 55,
    y: bannerY + 14,
    size: 8.5,
    font: fontRegular,
    color: rgb(1, 1, 1),
  });

  // 3. Document Provenance Section
  let y = bannerY - 30;
  page.drawText('1. EVIDENCE IDENTIFICATION & PROVENANCE', {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: colorPrimary,
  });

  y -= 8;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1,
    color: rgb(0.85, 0.87, 0.9),
  });

  y -= 18;
  const drawMetaRow = (label: string, value: string, currentY: number) => {
    page.drawText(label, { x: 45, y: currentY, size: 9, font: fontBold, color: colorDark });
    page.drawText(value, { x: 170, y: currentY, size: 9, font: fontRegular, color: colorDark });
  };

  drawMetaRow('Document Title:', data.docTitle, y);
  y -= 16;
  drawMetaRow('Document ID:', data.docId, y);
  y -= 16;
  drawMetaRow('Document Type:', data.docType, y);
  y -= 16;
  drawMetaRow('Parent Case Ref:', data.caseNumber ? `${data.caseNumber} (${data.caseId})` : data.caseId, y);
  y -= 16;
  drawMetaRow('Version Number:', `v${data.versionNumber}`, y);
  y -= 16;
  drawMetaRow('Storage Object Path:', data.storagePath, y);
  y -= 16;
  drawMetaRow('Verified At (UTC):', data.verifiedAt, y);
  y -= 16;
  drawMetaRow('Verified By Official:', data.checkedBy, y);

  // 4. Cryptographic Hash Comparison Grid
  y -= 30;
  page.drawText('2. CRYPTOGRAPHIC INTEGRITY AUDIT (SHA-256 HASH COMPARISON)', {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: colorPrimary,
  });

  y -= 8;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1,
    color: rgb(0.85, 0.87, 0.9),
  });

  y -= 18;

  // Box 1: Registered Original Hash
  page.drawRectangle({
    x: 40,
    y: y - 38,
    width: width - 80,
    height: 48,
    color: colorLightBg,
    borderColor: rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  page.drawText('REGISTERED ORIGINAL HASH (Raw Ingest Buffer, Blockchain Anchored):', {
    x: 50,
    y: y - 2,
    size: 8,
    font: fontBold,
    color: colorPrimary,
  });

  page.drawText(data.registeredHash, {
    x: 50,
    y: y - 22,
    size: 8.5,
    font: fontMonoBold,
    color: colorDark,
  });

  y -= 50;

  // Box 2: Recomputed Hash Now
  page.drawRectangle({
    x: 40,
    y: y - 38,
    width: width - 80,
    height: 48,
    color: colorLightBg,
    borderColor: isTampered ? colorDanger : rgb(0.8, 0.85, 0.9),
    borderWidth: 1,
  });

  page.drawText('RECOMPUTED HASH NOW (Current Live Storage Decrypted Bytes):', {
    x: 50,
    y: y - 2,
    size: 8,
    font: fontBold,
    color: isTampered ? colorDanger : colorPrimary,
  });

  page.drawText(data.computedHash, {
    x: 50,
    y: y - 22,
    size: 8.5,
    font: fontMonoBold,
    color: isTampered ? colorDanger : colorSuccess,
  });

  y -= 54;
  const matchResultText = isTampered
    ? '[X] INTEGRITY COMPARISON FAILED: Hashes do not match. Tampering or data corruption detected.'
    : '[OK] INTEGRITY COMPARISON PASSED: Hashes match identically. 100% byte-level authenticity confirmed.';

  page.drawText(matchResultText, {
    x: 45,
    y,
    size: 8.5,
    font: fontBold,
    color: isTampered ? colorDanger : colorSuccess,
  });

  // 5. Blockchain & Audit Proofs + QR Code
  y -= 30;
  page.drawText('3. BLOCKCHAIN AUDIT TRAIL & INDEPENDENT VERIFICATION', {
    x: 40,
    y,
    size: 11,
    font: fontBold,
    color: colorPrimary,
  });

  y -= 8;
  page.drawLine({
    start: { x: 40, y },
    end: { x: width - 40, y },
    thickness: 1,
    color: rgb(0.85, 0.87, 0.9),
  });

  y -= 22;
  page.drawText(`Total Blockchain Integrity Events Anchored:  ${data.blockchainEventsCount}`, {
    x: 45,
    y,
    size: 9,
    font: fontRegular,
    color: colorDark,
  });

  y -= 16;
  page.drawText(`Total Immutable Audit Trail Rows Recorded:      ${data.auditEventsCount}`, {
    x: 45,
    y,
    size: 9,
    font: fontRegular,
    color: colorDark,
  });

  y -= 16;
  page.drawText(`System RSA-2048 Anchor Signature:              ${data.systemSignature}`, {
    x: 45,
    y,
    size: 9,
    font: fontMono,
    color: colorDark,
  });

  // Generate and embed QR code
  const publicVerifyUrl = `https://icjs.delhi.gov.in/verify/${data.docId}/${data.computedHash.slice(0, 16)}`;
  try {
    const qrPngBuffer = await QRCode.toBuffer(publicVerifyUrl, {
      type: 'png',
      width: 100,
      margin: 1,
    });
    const qrImage = await pdfDoc.embedPng(qrPngBuffer);

    page.drawImage(qrImage, {
      x: width - 150,
      y: y - 45,
      width: 80,
      height: 80,
    });

    page.drawText('Scan to Verify on Court Terminal', {
      x: width - 170,
      y: y - 56,
      size: 7,
      font: fontRegular,
      color: colorGray,
    });
  } catch (qrErr) {
    console.warn('[PDF] QR code generation notice:', qrErr);
  }

  // 6. Section 65B Statutory Certification & Disclaimer
  const footerY = 85;
  page.drawRectangle({
    x: 40,
    y: footerY - 45,
    width: width - 80,
    height: 60,
    color: rgb(0.97, 0.97, 0.97),
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 1,
  });

  page.drawText('STATUTORY CERTIFICATE UNDER SECTION 65B, INDIAN EVIDENCE ACT, 1872:', {
    x: 48,
    y: footerY + 3,
    size: 7.5,
    font: fontBold,
    color: colorDark,
  });

  const disclaimer1 =
    'This electronic record has been produced by the Secure Document Intelligence & Integrity Layer (SDIIL) operating under regular';
  const disclaimer2 =
    'ICJS custody. The cryptographic SHA-256 hash was generated automatically from unmodified electronic source material.';
  const disclaimer3 =
    'NOTICE: This output requires human verification by the presiding judicial officer before admission into criminal court proceedings.';

  page.drawText(disclaimer1, { x: 48, y: footerY - 9, size: 7, font: fontRegular, color: colorGray });
  page.drawText(disclaimer2, { x: 48, y: footerY - 19, size: 7, font: fontRegular, color: colorGray });
  page.drawText(disclaimer3, { x: 48, y: footerY - 30, size: 7, font: fontBold, color: isTampered ? colorDanger : colorDark });

  // Seal
  page.drawText('SEAL OF EVIDENTIARY INTEGRITY — ICJS EVIDENCE REPOSITORY', {
    x: width / 2 - 130,
    y: 20,
    size: 8,
    font: fontMonoBold,
    color: colorPrimary,
  });

  return await pdfDoc.save();
}
