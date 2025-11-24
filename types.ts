
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

// --- USER MANAGEMENT ---

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  is_superuser: boolean;
  is_disabled?: boolean;
  invited_by?: string;
  created_at: string;
}

export interface Budget {
  id: number;
  project_id: number;
  version_name: string;
  xml_content: string;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  currency: string;
  created_by?: string;
  created_at: string;
  budgets?: Budget[];
}

export type ProjectRole = 'lineproducer' | 'producer' | 'accountant';

export interface ProjectAssignment {
  id: number;
  project_id: number;
  user_id: string;
  role: ProjectRole;
  profile?: Profile; // Joined data
}

export interface UserInvitation {
  id: number;
  email: string;
  created_at: string;
  status: string; // 'pending' | 'accepted'
  invited_by: string;
  target_role?: ProjectRole | null;
  target_project_id?: number | null;
}

export interface SetupAccountProps {
  onSuccess: () => void;
  email: string;
}
