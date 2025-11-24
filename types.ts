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

export interface SavedInvoice {
  id: number;
  created_at: string;
  ico: string | null;
  company_name: string | null;
  bank_account: string | null;
  iban: string | null;
  amount_with_vat: number | null;
  amount_without_vat: number | null;
  currency: string | null;
  confidence: number;
  raw_text: string | null;
}

export interface FileData {
  file: File;
  preview?: string;
  base64?: string;
  textContent?: string; // For Excel parsed content
  type: 'pdf' | 'excel' | 'image';
}