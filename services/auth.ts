import { supabase } from '../lib/supabase';
import { DbProfile } from '../types';

export interface AuthSession {
  userId: string;
  email: string;
  companyId: string;
  companyName: string;
  role: 'admin' | 'crew';
  displayName: string | null;
}

/**
 * Sign up a new admin + company
 */
export const signUp = async (
  email: string,
  password: string,
  companyName: string,
  displayName: string
): Promise<AuthSession> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        company_name: companyName,
        display_name: displayName,
      },
    },
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Signup failed');

  // If email confirmation is required Supabase returns a user but no session.
  // In that case we can't query the profile yet — tell the caller to check email.
  if (!data.session) {
    throw new Error('CHECK_EMAIL');
  }

  // Wait briefly for the DB trigger to create the profile row
  await new Promise((r) => setTimeout(r, 1000));

  return getSessionFromUser(data.user.id);
};

/**
 * Sign in with email/password (admin or crew)
 */
export const signIn = async (email: string, password: string): Promise<AuthSession> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Login failed');

  return getSessionFromUser(data.user.id);
};

/**
 * Sign out
 */
export const signOut = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
};

/**
 * Get current session (for page refresh recovery)
 */
export const getCurrentSession = async (): Promise<AuthSession | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  try {
    return await getSessionFromUser(user.id);
  } catch {
    return null;
  }
};

/**
 * Listen for auth state changes
 */
export const onAuthStateChange = (callback: (session: AuthSession | null) => void) => {
  return supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      callback(null);
      return;
    }
    try {
      const authSession = await getSessionFromUser(session.user.id);
      callback(authSession);
    } catch {
      callback(null);
    }
  });
};

/**
 * Helper: build AuthSession from user ID by fetching profile + company
 */
const getSessionFromUser = async (userId: string): Promise<AuthSession> => {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*, companies(name)')
    .eq('id', userId)
    .single();

  if (profileError || !profile) throw new Error('Profile not found');

  const { data: { user } } = await supabase.auth.getUser();

  return {
    userId: profile.id,
    email: user?.email || '',
    companyId: profile.company_id,
    companyName: (profile as any).companies?.name || '',
    role: profile.role,
    displayName: profile.display_name,
  };
};
