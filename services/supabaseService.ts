
import { createClient } from '@supabase/supabase-js';
import { ExtractionResult, SavedInvoice, Profile, Project, ProjectAssignment, ProjectRole, UserInvitation } from '../types';

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

export const completeAccountSetup = async (password: string, fullName: string) => {
  if (!supabase) throw new Error("Supabase not configured");
  
  // 1. Update Auth Password
  const { error: authError } = await supabase.auth.updateUser({ password });
  if (authError) throw authError;

  // 2. Update Profile Name
  const user = await getCurrentUser();
  if (user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id);
    
    if (profileError) {
       // Check for schema cache or missing column error
       if (profileError.message.includes("full_name") && profileError.message.includes("column")) {
          throw new Error("Database schema out of date. Admin needs to run the SQL script to add 'full_name' column.");
       }
       throw profileError;
    }

    // 3. FAIL-SAFE: Explicitly claim the invited role (Superuser)
    // This calls the RPC function 'claim_invited_role' which checks user_invitations 
    // and updates the profile.is_superuser flag on the server side.
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('claim_invited_role');
      if (rpcError) {
        console.error("Role claim RPC failed:", rpcError);
        // We don't throw here to avoid blocking the user if the RPC is missing,
        // but it means they might not get superuser status immediately.
      } else {
        console.log("Role claim RPC result:", rpcData);
      }
    } catch (e) {
      console.warn("RPC call error", e);
    }
  }
};

export const getCurrentUser = async () => {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
};

export const getUserProfile = async (userId: string): Promise<Profile | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) return null;
  return data as Profile;
};

// --- DATABASE OPERATIONS: INVOICES ---

export const saveExtractionResult = async (result: ExtractionResult, projectId?: number) => {
  if (!supabase) throw new Error("Supabase not configured.");

  const user = await getCurrentUser();
  if (!user) throw new Error("You must be logged in.");

  const { data, error } = await supabase
    .from('invoices')
    .insert([
      {
        user_id: user.id,
        project_id: projectId || null,
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

  if (error) throw error;
  return data;
};

export const fetchInvoices = async (): Promise<SavedInvoice[]> => {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as SavedInvoice[];
};

export const deleteInvoice = async (id: number): Promise<void> => {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// --- DATABASE OPERATIONS: ADMIN & PROJECTS ---

export const fetchAllProfiles = async (): Promise<Profile[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('email');
  
  if (error) throw error;
  return data as Profile[];
};

// Note: Manual toggleSuperuser is kept in backend but removed from UI per request
export const toggleSuperuser = async (targetUserId: string, isSuper: boolean) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('profiles')
    .update({ is_superuser: isSuper })
    .eq('id', targetUserId);
  
  if (error) throw error;
};

export const toggleUserDisabled = async (targetUserId: string, isDisabled: boolean) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('profiles')
    .update({ is_disabled: isDisabled })
    .eq('id', targetUserId);
  
  if (error) throw error;
};

export const createProject = async (name: string) => {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('projects')
    .insert([{ name }])
    .select()
    .single();
  
  if (error) {
    if (error.code === '42501') {
      throw new Error("Database permission denied. Run the SQL script to fix your Superuser status.");
    }
    throw error;
  }
  return data as Project;
};

export const fetchProjects = async (): Promise<Project[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as Project[];
};

export const fetchProjectAssignments = async (projectId: number): Promise<ProjectAssignment[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('project_assignments')
    .select('*, profiles(email, full_name)')
    .eq('project_id', projectId);
    
  if (error) throw error;
  
  // Transform to match interface
  return data.map((item: any) => ({
    id: item.id,
    project_id: item.project_id,
    user_id: item.user_id,
    role: item.role,
    profile: item.profiles // Joined data
  }));
};

export const assignUserToProject = async (projectId: number, userId: string, role: ProjectRole) => {
  if (!supabase) return;

  // Check constraints before inserting
  const existingAssignments = await fetchProjectAssignments(projectId);
  
  // 1. Check if user is already assigned to this project
  if (existingAssignments.some(a => a.user_id === userId)) {
    throw new Error("User is already assigned to this project.");
  }

  // 2. Check Role Limits
  const roleCount = existingAssignments.filter(a => a.role === role).length;

  if (role === 'lineproducer' && roleCount >= 1) {
    throw new Error("Project can only have 1 Line Producer.");
  }
  if (role === 'accountant' && roleCount >= 2) {
    throw new Error("Project can only have 2 Accountants.");
  }
  if (role === 'producer' && roleCount >= 2) {
    throw new Error("Project can only have 2 Producers.");
  }

  const { error } = await supabase
    .from('project_assignments')
    .insert([{ project_id: projectId, user_id: userId, role }]);

  if (error) {
    if (error.code === '42501') {
      throw new Error("Permission denied. Ensure you are a Superuser.");
    }
    throw error;
  }
};

export const removeAssignment = async (assignmentId: number) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('project_assignments')
    .delete()
    .eq('id', assignmentId);
    
  if (error) throw error;
};

// --- INVITATIONS ---

export const checkUserExists = async (email: string): Promise<boolean> => {
  if (!supabase) return false;
  
  // Normalizing email to lowercase to prevent duplicates
  const targetEmail = email.toLowerCase();
  
  // 1. Check existing profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', targetEmail) // ilike matches case insensitive
    .maybeSingle();
    
  if (profile) return true;

  // 2. Check pending invitations
  const { data: invite } = await supabase
    .from('user_invitations')
    .select('id')
    .ilike('email', targetEmail)
    .eq('status', 'pending')
    .maybeSingle();

  return !!invite;
};

export const sendSystemInvitation = async (email: string) => {
  if (!supabase) throw new Error("Supabase not configured");

  const targetEmail = email.trim().toLowerCase();

  // Check for duplicates first
  if (await checkUserExists(targetEmail)) {
    throw new Error("User already exists or has a pending invitation.");
  }

  // 1. Send Magic Link (OTP) via Supabase
  const { error: authError } = await supabase.auth.signInWithOtp({
    email: targetEmail,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin
    }
  });

  if (authError) throw authError;

  // 2. Log the invitation in our table
  const user = await getCurrentUser();
  if (user) {
    const { error: dbError } = await supabase
      .from('user_invitations')
      .insert([{ 
        email: targetEmail, 
        invited_by: user.id,
        status: 'pending'
      }]);
      
    if (dbError) console.warn("Invitation sent but failed to log to DB:", dbError.message);
  }
};

export const fetchPendingInvitations = async (): Promise<UserInvitation[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_invitations')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
    
  if (error) throw error;
  return data as UserInvitation[];
};

export const checkMyPendingInvitation = async (email: string): Promise<boolean> => {
  if (!supabase) return false;
  
  // Ensure we compare lowercase to lowercase to avoid mismatches
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from('user_invitations')
    .select('*')
    .ilike('email', normalizedEmail) 
    .eq('status', 'pending')
    .maybeSingle();

  if (error) {
      // If error is permission denied, it's likely RLS.
      // But RLS policies should allow reading OWN email.
      console.warn("Check invitation error:", error.message);
      return false;
  }
  return !!data;
};

export const acceptInvitation = async (email: string) => {
  if (!supabase) return;
  const normalizedEmail = email.trim().toLowerCase();
  
  const { error } = await supabase
    .from('user_invitations')
    .update({ status: 'accepted' })
    .ilike('email', normalizedEmail);
    
  if (error) throw error;
};

export const deleteInvitation = async (id: number) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('user_invitations')
    .delete()
    .eq('id', id);
  if (error) throw error;
};
