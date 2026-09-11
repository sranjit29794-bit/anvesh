import React, { useState } from 'react';
import { Lock, Mail, ShieldAlert } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';

export interface LoginFormProps {
  onSuccess: (mfaRequired: boolean) => void;
  onLoginAction: (username: string, pass: string) => Promise<{ mfaRequired: boolean }>;
}

const DEMO_PROFILES = [
  {
    email: 'admin.demo@sdiil.test',
    password: 'Demo@Admin123',
    name: 'System Administrator',
    role: 'ADMIN (Full Clearance)',
  },
  {
    email: 'supervisor.demo@sdiil.test',
    password: 'Demo@Supervisor123',
    name: 'SP Sunita Sharma',
    role: 'SUPERVISOR (Dual-Auth)',
  },
  {
    email: 'officer.demo@sdiil.test',
    password: 'Demo@Officer123',
    name: 'Insp. Vikram Rathore',
    role: 'INVESTIGATOR (Upload/Search)',
  },
  {
    email: 'prosecutor.demo@sdiil.test',
    password: 'Demo@Prosecutor123',
    name: 'Adv. Meera Sen',
    role: 'PROSECUTOR (Case 0142)',
  },
  {
    email: 'judge.demo@sdiil.test',
    password: 'Demo@Judge123',
    name: 'Hon. Justice Rajesh Verma',
    role: 'JUDGE (Cases 0198 & 0210)',
  },
  {
    email: 'forensic.demo@sdiil.test',
    password: 'Demo@Forensic123',
    name: 'Dr. Subhash Bose',
    role: 'FORENSIC_OFFICER (Lab Reports)',
  },
  {
    email: 'registrar.demo@sdiil.test',
    password: 'Demo@Registrar123',
    name: 'Sh. Alok Mathur',
    role: 'COURT_REGISTRAR (Registry)',
  },
];

export const LoginForm: React.FC<LoginFormProps> = ({ onSuccess, onLoginAction }) => {
  const [email, setEmail] = useState('officer.demo@sdiil.test');
  const [password, setPassword] = useState('Demo@Officer123');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await onLoginAction(email, password);
      onSuccess(res.mfaRequired);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setError((err as { message: string }).message);
      } else {
        setError('Authentication failed. Please verify your credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const selectDemoProfile = (p: (typeof DEMO_PROFILES)[0]) => {
    setEmail(p.email);
    setPassword(p.password);
    setError(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 w-full">
      {error && (
        <Alert variant="danger">
          <div className="flex items-center gap-1.5 font-medium">
            <ShieldAlert className="w-4 h-4" />
            <span>{error}</span>
          </div>
        </Alert>
      )}

      <Input
        label="Email Address / Official ID"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="e.g. officer.demo@sdiil.test"
        leftIcon={<Mail className="w-4 h-4" />}
        required
      />

      <Input
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••••••"
        leftIcon={<Lock className="w-4 h-4" />}
        required
      />

      <Button
        type="submit"
        variant="primary"
        size="lg"
        isLoading={isLoading}
        className="w-full mt-2"
      >
        Authenticate & Verify Identity
      </Button>

      {/* Quick Demo Credentials selector */}
      <div className="pt-4 border-t border-border mt-4">
        <span className="text-[10px] font-mono uppercase text-text-muted tracking-wider block mb-2">
          Seeded Demo Profiles (Click to fill)
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {DEMO_PROFILES.map((p) => (
            <button
              key={p.email}
              type="button"
              onClick={() => selectDemoProfile(p)}
              className={`text-left text-xs p-2 rounded transition-colors truncate border ${
                email === p.email
                  ? 'bg-accent-primary/15 border-accent-primary/50 text-accent-primary'
                  : 'bg-bg-elevated hover:bg-border border-border/50 text-text-secondary hover:text-text-primary'
              }`}
            >
              <div className="font-semibold truncate">{p.name}</div>
              <div className="text-[10px] text-text-muted truncate">{p.role}</div>
            </button>
          ))}
        </div>
      </div>
    </form>
  );
};
