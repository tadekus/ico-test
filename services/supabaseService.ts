
import { createClient } from '@supabase/supabase-js';
import { ExtractionResult, SavedInvoice, Profile, Project, ProjectAssignment, ProjectRole, UserInvitation, Budget, AppRole, BudgetLine, InvoiceAllocation } from '../types';
import { parseBudgetXml } from '../utils/budgetParser';

// These should be set in your environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl!, supabaseKey!) 
  : null;

// Helper to normalize IČO (remove spaces)
const normalizeIco = (ico: string | null | undefined): string | null => {
    if (!ico) return null;
    return ico.replace(/\s+/g, '');
};

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

  // 2. Update Profile Name (Try Direct Update first)
  const user = await getCurrentUser();
  if (user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id);

    // 3. FAIL-SAFE: Explicitly claim the invited role AND set the name
    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('claim_invited_role', { 
          p_full_name: fullName 
      });
      
      if (rpcError) {
        console.error("Role claim RPC failed:", rpcError);
        if (profileError) throw profileError; 
        throw rpcError;
      }
    } catch (e) {
      console.warn("RPC call error", e);
      throw e;
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
  const { error } = await supabase.rpc('delete_team_member', { target_user_id: userId });

  if (error) {
     console.warn("RPC delete failed, trying direct table delete", error);
     const { error: tableError } = await supabase.from('profiles').delete().eq('id', userId);
     if (tableError) throw new Error(`Failed to delete user: ${error.message}`);
  }
};

// --- DATABASE OPERATIONS: INVOICES ---

export const getNextInvoiceId = async (projectId: number): Promise<number> => {
    if (!supabase) return 1;
    
    // Get max internal_id for this project
    const { data, error } = await supabase
        .from('invoices')
        .select('internal_id')
        .eq('project_id', projectId)
        .order('internal_id', { ascending: false })
        .limit(1);
        
    if (error) {
        console.error("Error getting next invoice ID", error);
        return 1;
    }
    
    if (data && data.length > 0 && data[0].internal_id) {
        return data[0].internal_id + 1;
    }
    return 1;
};

export const checkDuplicateInvoice = async (projectId: number, ico: string | null, variableSymbol: string | null): Promise<boolean> => {
    if (!supabase || !ico || !variableSymbol) return false;

    const cleanIco = normalizeIco(ico);

    // Using limit(1) instead of maybeSingle() to prevent errors if duplicates already exist
    const { data, error } = await supabase
        .from('invoices')
        .select('id')
        .eq('project_id', projectId)
        .eq('ico', cleanIco) // Using normalized IČO
        .eq('variable_symbol', variableSymbol)
        .limit(1); 

    if (error) {
        console.error("Error checking for duplicate:", error);
        return false;
    }

    return data && data.length > 0;
};

export const saveExtractionResult = async (
    result: ExtractionResult, 
    projectId?: number,
    status: 'draft' | 'approved' = 'draft',
    base64?: string
) => {
  if (!supabase) throw new Error("Supabase not configured.");

  const user = await getCurrentUser();
  if (!user) throw new Error("You must be logged in.");
  
  let internalId = null;
  if (projectId) {
      internalId = await getNextInvoiceId(projectId);
  }

  const normalizedIco = normalizeIco(result.ico);

  const { data, error } = await supabase
    .from('invoices')
    .insert([
      {
        user_id: user.id,
        project_id: projectId || null,
        internal_id: internalId,
        ico: normalizedIco, // Save normalized IČO
        company_name: result.companyName,
        bank_account: result.bankAccount,
        iban: result.iban,
        variable_symbol: result.variableSymbol,
        description: result.description,
        amount_with_vat: result.amountWithVat,
        amount_without_vat: result.amountWithoutVat,
        currency: result.currency,
        confidence: result.confidence,
        raw_text: result.rawText,
        status: status,
        file_content: base64 || null,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const updateInvoice = async (
    id: number, 
    updates: Partial<SavedInvoice>
) => {
    if (!supabase) throw new Error("Supabase not configured");
    
    // Normalize IČO if it's being updated
    const finalUpdates = { ...updates };
    if (finalUpdates.ico) {
        finalUpdates.ico = normalizeIco(finalUpdates.ico);
    }

    const { data, error } = await supabase
        .from('invoices')
        .update(finalUpdates)
        .eq('id', id)
        .select('id') 
        .single();
        
    if (error) throw error;
    return data;
};

export const fetchInvoices = async (projectId?: number): Promise<SavedInvoice[]> => {
  if (!supabase) throw new Error("Supabase is not configured.");

  let query = supabase
    .from('invoices')
    .select('id, created_at, internal_id, ico, company_name, description, amount_with_vat, amount_without_vat, currency, status, project_id, file_content, variable_symbol, bank_account, iban, confidence')
    .order('internal_id', { ascending: false });

  if (projectId) {
      query = query.eq('project_id', projectId);
  } else {
      query = query.is('project_id', null); 
  }

  const { data, error } = await query;

  if (error) throw error;
  return data as SavedInvoice[];
};

export const deleteInvoice = async (id: number): Promise<void> => {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
};

export const fetchInvoiceAllocations = async (invoiceId: number): Promise<InvoiceAllocation[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('invoice_allocations')
        .select(`*, budget_line:budget_lines(*)`)
        .eq('invoice_id', invoiceId);
        
    if (error) throw error;
    return data as InvoiceAllocation[];
};

export const saveInvoiceAllocation = async (invoiceId: number, budgetLineId: number, amount: number) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.from('invoice_allocations').insert([{
        invoice_id: invoiceId,
        budget_line_id: budgetLineId,
        amount
    }]);
    if (error) throw error;
};

export const deleteInvoiceAllocation = async (allocationId: number) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.from('invoice_allocations').delete().eq('id', allocationId);
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
    // We order budgets by ID (newest last usually) or active
    const { data, error } = await supabase
        .from('projects')
        .select(`*, budgets(*)`)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Fetch Projects Error:", error);
        throw new Error("Failed to load projects. " + error.message);
    }
    
    // Sort budgets locally if needed, e.g. active first
    const projects = data.map((p: any) => ({
        ...p,
        budgets: p.budgets?.sort((a: Budget, b: Budget) => b.id - a.id)
    }));

    return projects as Project[];
};

export const fetchAssignedProjects = async (userId: string): Promise<Project[]> => {
    if (!supabase) return [];
    
    const { data: assignments, error: assignError } = await supabase
        .from('project_assignments')
        .select('project_id')
        .eq('user_id', userId);

    if (assignError) return [];
    if (!assignments || assignments.length === 0) return [];

    const projectIds = assignments.map(a => a.project_id);

    const { data: projects, error: projError } = await supabase
        .from('projects')
        .select(`*, budgets(*)`) // Fetch budgets too
        .in('id', projectIds)
        .order('created_at', { ascending: false });
        
    if (projError) return [];
    return projects as Project[];
};

export const getProjectRole = async (userId: string, projectId: number): Promise<ProjectRole | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('project_assignments')
        .select('role')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .single();
    
    if (error || !data) return null;
    return data.role as ProjectRole;
}

export const deleteProject = async (id: number): Promise<void> => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
};

export const uploadBudget = async (projectId: number, fileName: string, xmlContent: string) => {
    if (!supabase) throw new Error("Supabase not configured");
    
    // 1. Check existing budgets to determine active state
    // If no budgets exist, this one should be active by default
    const { count } = await supabase
        .from('budgets')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId);

    const shouldBeActive = count === 0;

    // 2. Parse XML to lines
    const lines = parseBudgetXml(xmlContent);
    if (lines.length === 0) throw new Error("No valid budget lines found in XML.");

    // 3. Create Budget Record
    const { data: budgetData, error: budgetError } = await supabase
        .from('budgets')
        .insert([{
            project_id: projectId,
            version_name: fileName,
            xml_content: xmlContent,
            is_active: shouldBeActive 
        }])
        .select()
        .single();

    if (budgetError) throw budgetError;
    
    // 4. Bulk Insert Lines
    const budgetLinesPayload = lines.map(line => ({
        budget_id: budgetData.id,
        ...line
    }));

    const { error: linesError } = await supabase
        .from('budget_lines')
        .insert(budgetLinesPayload);

    if (linesError) {
        // Cleanup if lines fail
        await supabase.from('budgets').delete().eq('id', budgetData.id);
        throw new Error("Failed to save budget details: " + linesError.message);
    }
};

export const setBudgetActive = async (projectId: number, budgetId: number) => {
    if (!supabase) throw new Error("Supabase not configured");
    
    // Deactivate all for this project
    await supabase.from('budgets')
        .update({ is_active: false })
        .eq('project_id', projectId);
        
    // Activate selected
    const { error } = await supabase.from('budgets')
        .update({ is_active: true })
        .eq('id', budgetId);
        
    if (error) throw error;
};

export const fetchActiveBudgetLines = async (projectId: number): Promise<BudgetLine[]> => {
    if (!supabase) return [];
    
    // Find active budget ID first
    const { data: budget, error: bError } = await supabase
        .from('budgets')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_active', true)
        .single();
        
    if (bError || !budget) return []; // No active budget

    // Fetch lines
    const { data: lines, error: lError } = await supabase
        .from('budget_lines')
        .select('*')
        .eq('budget_id', budget.id);
        
    if (lError) throw lError;
    return lines as BudgetLine[];
};

export const fetchVendorBudgetHistory = async (projectId: number, ico: string): Promise<BudgetLine[]> => {
    if (!supabase) return [];
    
    const cleanIco = normalizeIco(ico);

    // Complex query to get budget lines used by invoices with matching IČO in this project
    const { data, error } = await supabase
        .from('invoice_allocations')
        .select(`
            budget_line:budget_lines(*),
            invoices!inner(project_id, ico)
        `)
        .eq('invoices.project_id', projectId)
        .eq('invoices.ico', cleanIco) // Match normalized
        .order('id', { ascending: false }) // Newest first
        .limit(20);

    if (error) {
        console.warn("Failed to fetch vendor history", error);
        return [];
    }

    // Deduplicate budget lines by ID
    const uniqueLines = new Map<number, BudgetLine>();
    data.forEach((item: any) => {
        if (item.budget_line) {
            uniqueLines.set(item.budget_line.id, item.budget_line);
        }
    });

    return Array.from(uniqueLines.values());
};

// --- PROJECT ASSIGNMENTS ---

export const fetchProjectAssignments = async (projectId: number): Promise<ProjectAssignment[]> => {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('project_assignments')
        .select(`*, profile:profiles(id, full_name, email)`)
        .eq('project_id', projectId);
    if (error) return [];
    return data.map((item: any) => ({ ...item, profile: item.profile })) as ProjectAssignment[];
};

export const fetchAssignmentsForOwner = async (ownerId: string): Promise<any[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('project_assignments')
    .select(`id, user_id, role, project_id, project:projects!inner(id, name, created_by)`)
    .eq('project.created_by', ownerId);
  if (error) return [];
  return data;
};

export const addProjectAssignment = async (projectId: number, userId: string, role: ProjectRole) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.from('project_assignments').insert([{ project_id: projectId, user_id: userId, role }]);
    if (error) {
        if (error.code === '23505') throw new Error("User is already assigned to this project.");
        throw error;
    }
};

export const removeProjectAssignment = async (assignmentId: number) => {
    if (!supabase) throw new Error("Supabase not configured");
    const { error } = await supabase.from('project_assignments').delete().eq('id', assignmentId);
    if (error) throw error;
};

// --- ADMIN: PROFILES & HIERARCHY ---

export const fetchAllProfiles = async (): Promise<Profile[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as Profile[];
};

export const toggleUserDisabled = async (targetUserId: string, isDisabled: boolean) => {
  if (!supabase) return;
  const { error } = await supabase.from('profiles').update({ is_disabled: isDisabled }).eq('id', targetUserId);
  if (error) throw error;
};

// --- INVITATIONS ---

export const checkUserExistsGlobally = async (email: string): Promise<boolean> => {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('check_email_exists_global', { target_email: email });
    if (error) return checkUserExistsBasic(email);
    return !!data;
  } catch (e) {
    return checkUserExistsBasic(email);
  }
};

const checkUserExistsBasic = async (email: string): Promise<boolean> => {
  if (!supabase) return false;
  const targetEmail = email.toLowerCase();
  const { data: profile } = await supabase.from('profiles').select('id').ilike('email', targetEmail).maybeSingle();
  if (profile) return true;
  const { data: invite } = await supabase.from('user_invitations').select('id').ilike('email', targetEmail).eq('status', 'pending').maybeSingle();
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
    .select().single();
    
  if (dbError) throw new Error(`Failed to create invitation: ${dbError.message}`);

  try {
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin }
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
  const { data, error } = await supabase.from('user_invitations').select('*').eq('status', 'pending').order('created_at', { ascending: false });
  if (error) throw error;
  return data as UserInvitation[];
};

export const checkMyPendingInvitation = async (email: string): Promise<boolean> => {
  if (!supabase) return false;
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.from('user_invitations').select('*').ilike('email', normalizedEmail).eq('status', 'pending').maybeSingle();
  if (error) return false;
  return !!data;
};

export const acceptInvitation = async (email: string) => {
  if (!supabase) return;
  const normalizedEmail = email.trim().toLowerCase();
  const { error } = await supabase.from('user_invitations').update({ status: 'accepted' }).ilike('email', normalizedEmail);
  if (error) throw error;
};

export const deleteInvitation = async (id: number) => {
  if (!supabase) return;
  const { error } = await supabase.from('user_invitations').delete().eq('id', id);
  if (error) throw error;
};
