
import { createClient } from '@supabase/supabase-js';
import { ExtractionResult, SavedInvoice, Profile, Project, ProjectAssignment, ProjectRole, UserInvitation, Budget, AppRole } from '../types';

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
       if (profileError.message.includes("full_name") && profileError.message.includes("column")) {
          throw new Error("Database schema out of date. Admin needs to run the SQL script to add 'full_name' column.");
       }
       throw profileError;
    }

    // 3. FAIL-SAFE: Explicitly claim the invited role
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('claim_invited_role');
      if (rpcError) {
        console.error("Role claim RPC failed:", rpcError);
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

export const adminResetPassword = async (userId: string, newPassword: string) => {
  if (!supabase) throw new Error("Supabase not configured");
  
  const { error } = await supabase.rpc('admin_reset_user_password', {
    target_user_id: userId,
    new_password: newPassword
  });

  if (error) throw new Error(`Failed to reset password: ${error.message}`);
};

export const deleteProfile = async (userId: string) => {
  if (!supabase) throw new Error("Supabase not configured");
  
  // Call the secure RPC function that deletes from auth.users
  // This triggers a cascade delete to profiles/assignments
  const { error } = await supabase.rpc('delete_team_member', { target_user_id: userId });

  if (error) {
     // Fallback for Admins if RPC fails or not updated yet
     console.warn("RPC delete failed, trying direct table delete", error);
     const { error: tableError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userId);
        
     if (tableError) throw new Error(`Failed to delete user: ${error.message}`);
  }
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

// --- PROJECTS & BUDGETS ---

export const createProject = async (
    name: string, 
    currency: string, 
    description?: string, 
    company_name?: string, 
    ico?: string
): Promise<Project> => {
    if (!supabase) throw new Error("Supabase not configured");
    const user = await getCurrentUser();
    if (!user) throw new Error("User not logged in");

    const { data, error } = await supabase
        .from('projects')
        .insert([{ 
            name, 
            currency,
            description,
            company_name,
            ico,
            created_by: user.id
        }])
        .select()
        .single();
    
    if (error) throw error;
    return data as Project;
};

export const fetchProjects = async (): Promise<Project[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('projects')
        .select(`*, budgets(*)`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Fetch Projects Error:", error);
        throw new Error("Failed to load projects. " + error.message);
    }
    return data as Project[];
};

export const deleteProject = async (id: number): Promise<void> => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
    if (error) throw error;
};

export const uploadBudget = async (projectId: number, fileName: string, xmlContent: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    
    const { error } = await supabase
        .from('budgets')
        .insert([{
            project_id: projectId,
            version_name: fileName,
            xml_content: xmlContent
        }]);
    
    if (error) throw error;
};

// --- PROJECT ASSIGNMENTS ---

export const fetchProjectAssignments = async (projectId: number): Promise<ProjectAssignment[]> => {
    if (!supabase) return [];
    
    const { data, error } = await supabase
        .from('project_assignments')
        .select(`
            *,
            profile:profiles(id, full_name, email)
        `)
        .eq('project_id', projectId);
        
    if (error) {
        console.error("Fetch Assignments Error:", error);
        return [];
    }
    // Flatten the profile data
    return data.map((item: any) => ({
        ...item,
        profile: item.profile
    })) as ProjectAssignment[];
};

// Fetch ALL assignments for projects OWNED by the current user
// This helps display "Line Producer" in the team list instead of generic "User"
export const fetchAssignmentsForOwner = async (ownerId: string): Promise<any[]> => {
  if (!supabase) return [];
  
  // We want assignments where the linked project was created by `ownerId`
  // This requires a join on projects.
  const { data, error } = await supabase
    .from('project_assignments')
    .select(`
      id,
      user_id,
      role,
      project_id,
      project:projects!inner(id, name, created_by)
    `)
    .eq('project.created_by', ownerId);

  if (error) {
    console.error("Fetch Owner Assignments Error:", error);
    return [];
  }
  
  return data;
};

export const addProjectAssignment = async (projectId: number, userId: string, role: ProjectRole) => {
    if (!supabase) throw new Error("Supabase not configured");
    
    const { error } = await supabase
        .from('project_assignments')
        .insert([{
            project_id: projectId,
            user_id: userId,
            role
        }]);
        
    if (error) {
        if (error.code === '23505') throw new Error("User is already assigned to this project.");
        throw error;
    }
};

export const removeProjectAssignment = async (assignmentId: number) => {
    if (!supabase) throw new Error("Supabase not configured");
    
    const { error } = await supabase
        .from('project_assignments')
        .delete()
        .eq('id', assignmentId);
        
    if (error) throw error;
};

// --- ADMIN: PROFILES & HIERARCHY ---

export const fetchAllProfiles = async (): Promise<Profile[]> => {
  if (!supabase) return [];
  const user = await getCurrentUser();
  if (!user) return [];

  // RLS will ensure I only see what I'm allowed to see
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data as Profile[];
};

export const toggleUserDisabled = async (targetUserId: string, isDisabled: boolean) => {
  if (!supabase) return;
  const { error } = await supabase
    .from('profiles')
    .update({ is_disabled: isDisabled })
    .eq('id', targetUserId);
  
  if (error) throw error;
};

// --- INVITATIONS ---

export const checkUserExistsGlobally = async (email: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('check_email_exists_global', { target_email: email });
    if (error) {
      console.warn("Global email check failed, falling back to basic check:", error);
      return checkUserExistsBasic(email);
    }
    return !!data;
  } catch (e) {
    return checkUserExistsBasic(email);
  }
};

// Internal fallback
const checkUserExistsBasic = async (email: string): Promise<boolean> => {
  if (!supabase) return false;
  const targetEmail = email.toLowerCase();
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', targetEmail)
    .maybeSingle();
  if (profile) return true;

  const { data: invite } = await supabase
    .from('user_invitations')
    .select('id')
    .ilike('email', targetEmail)
    .eq('status', 'pending')
    .maybeSingle();

  return !!invite;
};

export const sendSystemInvitation = async (
    email: string, 
    appRole?: AppRole | null,
    projectRole?: ProjectRole | null, 
    projectId?: number | null
) => {
  if (!supabase) throw new Error("Supabase not configured");

  const targetEmail = email.trim().toLowerCase();

  // Use the robust global check
  if (await checkUserExistsGlobally(targetEmail)) {
    throw new Error("User with this email already exists in the system.");
  }

  const user = await getCurrentUser();
  if (!user) throw new Error("You must be logged in to invite users.");

  const { data: inviteData, error: dbError } = await supabase
    .from('user_invitations')
    .insert([{ 
      email: targetEmail, 
      invited_by: user.id,
      status: 'pending',
      target_app_role: appRole || null,
      target_role: projectRole || null,
      target_project_id: projectId || null
    }])
    .select()
    .single();
    
  if (dbError) {
    console.error("DB Insert Error:", dbError);
    if (dbError.code === '42501') {
       throw new Error("Permission denied. Check Admin Roles.");
    }
    throw new Error(`Failed to create invitation: ${dbError.message}`);
  }

  try {
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin
      }
    });

    if (authError) {
      await deleteInvitation(inviteData.id);
      throw authError;
    }
  } catch (err) {
    await deleteInvitation(inviteData.id);
    throw err;
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
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase
    .from('user_invitations')
    .select('*')
    .ilike('email', normalizedEmail) 
    .eq('status', 'pending')
    .maybeSingle();

  if (error) {
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
