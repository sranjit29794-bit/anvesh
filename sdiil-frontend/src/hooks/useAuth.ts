import { useContext } from 'react';
import { AuthContext, AuthContextType, CaseAssignmentRecord } from '@/context/AuthContext';

export type { CaseAssignmentRecord, AuthContextType };

/**
 * Custom hook providing access to authenticated user state, profile role,
 * case assignments, and Supabase auth methods.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
