
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
  user_id: string; // The uploader
  project_id?: number | null; // Linked project
}

export interface FileData {
  file: File;
  preview?: string;
  base64?: string;
  textContent?: string;
  type: 'pdf' | 'excel' | 'image';
}

// --- NEW TYPES FOR USER MANAGEMENT ---

export interface Profile {
  id: string;
  email: string;
  is_superuser: boolean;
  is_disabled?: boolean;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  created_at: string;
}

export type ProjectRole = 'lineproducer' | 'producer' | 'accountant';

export interface ProjectAssignment {
  id: number;
  project_id: number;
  user_id: string;
  role: ProjectRole;
  profile?: Profile; // Joined data
}
