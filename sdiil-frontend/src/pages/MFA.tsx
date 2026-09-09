import React from 'react';
import { MFAForm } from '@/components/auth/MFAForm';
import { useAuth } from '@/hooks/useAuth';
import { KeyRound } from 'lucide-react';

export interface MFAPageProps {
  navigate: (route: string) => void;
}

export const MFA: React.FC<MFAPageProps> = ({ navigate }) => {
  const { verifyMfa, cancelMfa, mfaMethod, mfaDestination } = useAuth();

  const handleVerify = async (code: string) => {
    await verifyMfa(code);
    navigate('/dashboard');
  };

  const handleCancel = async () => {
    await cancelMfa();
    navigate('/login');
  };

  return (
    <div className="min-h-screen w-full bg-bg-primary flex flex-col justify-center items-center p-4 selection:bg-accent-primary selection:text-white">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-card bg-accent-primary/15 border border-accent-primary/40 text-accent-primary mb-2 shadow-lg">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-h1 font-bold tracking-tight text-text-primary">
            MFA Second Factor
          </h1>
          <p className="text-xs text-text-secondary">
            Mandatory Statutory Two-Factor Verification for Evidence Access
          </p>
        </div>

        <div className="bg-bg-card border border-border-strong rounded-card p-6 sm:p-8 shadow-2xl space-y-6">
          <MFAForm
            method={mfaMethod}
            maskedDestination={mfaDestination}
            onVerify={handleVerify}
            onCancel={handleCancel}
          />
        </div>

        <div className="text-center text-[11px] text-text-muted">
          Session Token: RS256 Signed (5 min expiration window)
        </div>
      </div>
    </div>
  );
};
