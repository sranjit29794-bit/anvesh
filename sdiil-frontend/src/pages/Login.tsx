import React from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { useAuth } from '@/hooks/useAuth';
import { Shield, Lock } from 'lucide-react';

export interface LoginPageProps {
  navigate: (route: string) => void;
}

export const Login: React.FC<LoginPageProps> = ({ navigate }) => {
  const { login } = useAuth();

  const handleSuccess = (mfaRequired: boolean) => {
    if (mfaRequired) {
      navigate('/mfa');
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen w-full bg-bg-primary flex flex-col justify-center items-center p-4 selection:bg-accent-primary selection:text-white">
      {/* Background Subtle Gradient Grid */}
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-card bg-accent-primary/15 border border-accent-primary/40 text-accent-primary mb-2 shadow-lg">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-h1 font-bold tracking-tight text-text-primary">
            SDIIL — ICJS Node
          </h1>
          <p className="text-xs text-text-secondary">
            Sensitive Document Intelligence & Integrity Layer • Secure Legal Intake
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-bg-card border border-border-strong rounded-card p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <span className="text-xs font-mono uppercase text-text-muted">Authentication Phase 1</span>
            <span className="flex items-center gap-1 text-xs text-accent-primary font-mono font-medium">
              <Lock className="w-3.5 h-3.5" /> RS256 PKI
            </span>
          </div>

          <LoginForm onSuccess={handleSuccess} onLoginAction={login} />
        </div>

        {/* Prototype Footer */}
        <div className="text-center space-y-1 text-[11px] text-text-muted">
          <div>Integrated Criminal Justice System (ICJS) DMS Prototype</div>
          <div className="font-mono text-[10px]">Strict ABAC & Immutable Hash Enforcement</div>
        </div>
      </div>
    </div>
  );
};
