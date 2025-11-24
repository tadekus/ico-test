export interface ExtractionResult {
  ico: string | null;
  companyName?: string | null;
  bankAccount?: string | null;
  iban?: string | null;
  amountWithVat?: number | null;
  amountWithoutVat?: number | null;
  currency?: string | null;
  confidence: number;
  rawText?: string;
}

export interface FileData {
  file: File;
  preview?: string;
  base64?: string;
  textContent?: string; // For Excel parsed content
  type: 'pdf' | 'excel' | 'image';
}