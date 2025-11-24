
import { createClient } from '@supabase/supabase-js';
import { ExtractionResult, SavedInvoice } from '../types';

// These should be set in your environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl!, supabaseKey!) 
  : null;

// --- AUTHENTICATION ---

export const signUp = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase not configured");
  return await supabase.auth.signUp({
    email,
    password,
  });
};

export const signIn = async (email: string, password: string) => {
  if (!supabase) throw new Error("Supabase not configured");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  if (!supabase) throw new Error("Supabase not configured");
  return await supabase.auth.signOut();
};

export const getCurrentUser = async () => {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
};

// --- DATABASE OPERATIONS ---

export const saveExtractionResult = async (result: ExtractionResult) => {
  if (!supabase) {
    throw new Error("Supabase is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY.");
  }

  // Get current user for RLS
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("You must be logged in to save invoices.");
  }

  // Assuming a table named 'invoices' exists with these columns
  const { data, error } = await supabase
    .from('invoices')
    .insert([
      {
        user_id: user.id, // Explicitly set user_id for RLS
        ico: result.ico,
        company_name: result.companyName,
        bank_account: result.bankAccount,
        iban: result.iban,
        amount_with_vat: result.amountWithVat,
        amount_without_vat: result.amountWithoutVat,
        currency: result.currency,
        confidence: result.confidence,
        raw_text: result.rawText,
        created_at: new Date().toISOString()
      }
    ])
    .select();

  if (error) {
    console.error("Supabase Error:", error);
    // Throw the full error object so we can check the code (e.g. 42P01 for missing table, 42501 for RLS)
    throw error;
  }
  
  return data;
};

export const fetchInvoices = async (): Promise<SavedInvoice[]> => {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error("You must be logged in to view history.");
  }

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error fetching invoices:", error);
    throw error;
  }

  return data as SavedInvoice[];
};

export const deleteInvoice = async (id: number): Promise<void> => {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id);

  if (error) {
    console.error("Error deleting invoice:", error);
    throw error;
  }
};
