import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface UseUserReturn {
  user: User | null;
  userId: string | null;
  session: Session | null;
  isLoading: boolean;
  error: Error | null;
  signOut: () => Promise<void>;
}

export function useUser(): UseUserReturn {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    console.log('useUser: Starting initialization');
    
    // Safety timeout to prevent infinite loading
    const safetyTimeout = setTimeout(() => {
      console.warn('useUser: Safety timeout triggered - forcing isLoading to false');
      setIsLoading(false);
    }, 3000);
    
    // Check for existing session immediately
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('useUser: getSession result', { hasSession: !!session, error });
      if (error) {
        console.error('useUser: getSession error', error);
        setError(error);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      clearTimeout(safetyTimeout);
    }).catch((err) => {
      console.error('useUser: getSession exception', err);
      setIsLoading(false);
      clearTimeout(safetyTimeout);
    });

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('useUser: Auth state changed', { event, hasSession: !!session });
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => {
      console.log('useUser: Cleaning up');
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    console.log('useUser: Signing out');
    await supabase.auth.signOut();
  };

  console.log('useUser: Rendering', { hasUser: !!user, isLoading });

  return {
    user,
    userId: user?.id ?? null,
    session,
    isLoading,
    error,
    signOut,
  };
}
