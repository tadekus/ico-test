
export interface ExtractionResult {
  ico: string | null;
  companyName?: string | null;
  bankAccount?: string | null;
  iban?: string | null;
  amountWithVat?: number | null;
  amountWithoutVat?: number | null;
  currency?: string | null;
  variableSymbol?: string | null;
  description?: string | null;
  confidence: number;
  rawText?: string;
}

export interface SavedInvoice {
  id: number;
  created_at: string;
  internal_id?: number | null; // Project specific sequence number (1, 2, 3...)
  ico: string | null;
  company_name: string | null;
  bank_account: string | null;
  iban: string | null;
  variable_symbol?: string | null;
  description?: string | null;
  amount_with_vat: number | null;
  amount_without_vat: number | null;
  currency: string | null;
  confidence: number;
  raw_text: string | null;
  user_id: string; // The uploader
  project_id?: number | null; // Linked project
  status: 'draft' | 'approved';
  file_content?: string | null; // Base64 content for preview
  allocations?: InvoiceAllocation[]; // Joined allocations
}

export interface FileData {
  id: string; // Unique ID for UI handling
  file: File;
  preview?: string;
  base64?: string;
  textContent?: string;
  type: 'pdf' | 'excel' | 'image';
  status: 'uploading' | 'analyzing' | 'ready' | 'saved' | 'error';
  extractionResult?: ExtractionResult | null;
  error?: string;
}

// --- USER MANAGEMENT ---

export type AppRole = 'admin' | 'superuser' | 'user';

export interface Profile {
  id: string;
  email: string;
  full_name?: string;
  app_role: AppRole;
  is_superuser?: boolean; // Deprecated, kept for backward compat during migration
  is_disabled?: boolean;
  invited_by?: string;
  created_at: string;
}

export interface Budget {
  id: number;
  project_id: number;
  version_name: string;
  xml_content: string; // Kept for backup
  is_active: boolean;
  created_at: string;
}

export interface BudgetLine {
  id: number;
  budget_id: number;
  account_number: string;
  account_description: string;
  category_number: string;
  category_description: string;
  original_amount: number;
  spent_amount?: number; // Calculated field for Cost Report
  remaining_amount?: number; // Calculated field
  created_at?: string;
}

export interface InvoiceAllocation {
  id: number;
  invoice_id: number;
  budget_line_id: number;
  amount: number;
  budget_line?: BudgetLine; // Joined data
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  company_name?: string;
  ico?: string;
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
  project?: Project; // Joined data
}

export interface UserInvitation {
  id: number;
  email: string;
  created_at: string;
  status: string; // 'pending' | 'accepted'
  invited_by: string;
  target_app_role?: AppRole | null; // For System Invites (Admin/Superuser)
  target_role?: ProjectRole | null; // For Project Invites
  target_project_id?: number | null;
}

export interface SetupAccountProps {
  onSuccess: () => void;
  email: string;
}