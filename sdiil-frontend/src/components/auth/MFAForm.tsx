import React, { useState, useEffect } from 'react';
import { KeyRound, ArrowLeft, ShieldCheck, Smartphone, Zap, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { useAuth } from '@/hooks/useAuth';
import demoSecretsData from '@/config/demoMfaSecrets.json';
import { generateClientTOTP } from '@/utils/totp';

export interface MFAFormProps {
  method?: string | null;
  maskedDestination?: string;
  onVerify: (code: string) => Promise<void>;
  onCancel: () => void;
}

interface DemoSecretItem {
  role: string;
  name: string;
  factorId: string;
  secret: string;
  uri: string;
}

const DEMO_SECRETS = demoSecretsData as Record<string, DemoSecretItem>;

export const MFAForm: React.FC<MFAFormProps> = ({
  method = 'TOTP',
  maskedDestination,
  onVerify,
  onCancel,
}) => {
  const { pendingEmail } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [liveDemoCode, setLiveDemoCode] = useState<string | null>(null);
  const [autoFilled, setAutoFilled] = useState(false);

  const matchedDemoUser = pendingEmail ? DEMO_SECRETS[pendingEmail.toLowerCase()] : null;

  // Generate live TOTP for demo user if configured
  useEffect(() => {
    let timer: any;
    const updateDemoTotp = async () => {
      if (matchedDemoUser?.secret) {
        try {
          const currentOtp = await generateClientTOTP(matchedDemoUser.secret);
          setLiveDemoCode(currentOtp);
        } catch {
          // ignore
        }
      }
    };

    updateDemoTotp();
    timer = setInterval(updateDemoTotp, 5000);
    return () => clearInterval(timer);
  }, [matchedDemoUser]);

  const handleAutoFill = () => {
    if (liveDemoCode) {
      setCode(liveDemoCode);
      setAutoFilled(true);
      setError(null);
      setTimeout(() => setAutoFilled(false), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!code || code.length !== 6) {
      setError('Please enter a valid 6-digit TOTP verification code.');
      return;
    }

    setIsLoading(true);
    try {
      await onVerify(code);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setError((err as { message: string }).message);
      } else {
        setError('Verification failed. Invalid or expired 6-digit TOTP code.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full">
      <div className="flex items-center gap-3 p-3 rounded-card bg-accent-primary/10 border border-accent-primary/30 text-text-primary">
        <Smartphone className="w-6 h-6 text-accent-primary shrink-0" />
        <div className="text-xs">
          <div className="font-semibold text-accent-primary">
            {method === 'TOTP' ? 'Time-based Authenticator (TOTP)' : 'Email Security Code (OTP)'}
          </div>
          <div className="text-text-secondary mt-0.5">
            {maskedDestination
              ? `Verification code dispatched to ${maskedDestination}`
              : `Enter the 6-digit dynamic code for ${pendingEmail || 'your authorized officer account'}.`}
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="danger">
          <div className="flex items-center gap-2">
            <span>{error}</span>
          </div>
        </Alert>
      )}

      <Input
        label="6-Digit Verification Code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="••••••"
        maxLength={6}
        className="text-center font-mono text-xl tracking-widest"
        leftIcon={<KeyRound className="w-4 h-4" />}
        helperText="Enter the 6-digit code from Google Authenticator, or use the quick helper below."
        autoFocus
        required
      />

      {/* Demo helper card with live TOTP code */}
      {matchedDemoUser && (
        <div className="p-3 rounded-card bg-bg-elevated border border-border/80 text-xs space-y-2">
          <div className="flex items-center justify-between text-text-secondary">
            <span className="font-mono text-[11px] font-semibold text-accent-primary">
              Demo MFA Helper ({matchedDemoUser.name})
            </span>
            <span className="font-mono text-[10px] text-text-muted">Supabase AAL2 Verified</span>
          </div>

          <div className="flex items-center justify-between gap-2 bg-bg-primary p-2 rounded border border-border">
            <div className="font-mono text-sm tracking-wider font-bold text-text-primary">
              {liveDemoCode || 'Loading...'}
            </div>
            <button
              type="button"
              onClick={handleAutoFill}
              className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 transition-colors font-medium border border-accent-primary/40"
            >
              {autoFilled ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                  <span>Filled!</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Fill Live TOTP</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={onCancel}
          leftIcon={<ArrowLeft className="w-4 h-4" />}
          className="w-1/3"
        >
          Cancel
        </Button>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          isLoading={isLoading}
          leftIcon={<ShieldCheck className="w-4 h-4" />}
          className="flex-1"
        >
          Verify & Access
        </Button>
      </div>
    </form>
  );
};
