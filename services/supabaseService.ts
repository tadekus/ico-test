import { createClient } from '@supabase/supabase-js';
import { ExtractionResult } from '../types';

// These should be set in your environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl!, supabaseKey!) 
  : null;

export const saveExtractionResult = async (result: ExtractionResult) => {
  if (!supabase) {
    throw new Error("Supabase is not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY.");
  }

  // Assuming a table named 'invoices' exists with these columns
  const { data, error } = await supabase
    .from('invoices')
    .insert([
      {
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
    // Throw the full error object so we can check the code (e.g. 42P01 for missing table)
    throw error;
  }
  
  return data;
};