import React, { useState, useEffect } from 'react';
import { LogOut, Bell, Shield, User as UserIcon, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context/ThemeContext';
import { UserRole } from '@/types/auth.types';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { sharingService } from '@/services/sharing.service';

export interface TopbarProps {
  onOpenNotifications?: () => void;
  navigate: (route: string) => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onOpenNotifications, navigate }) => {
  const { user, logout, switchRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    const checkPending = async () => {
      if (user?.role === 'SUPERVISOR' || user?.role === 'ADMIN') {
        const approvals = await sharingService.getPendingApprovals();
        setPendingCount(approvals.length);
      } else {
        setPendingCount(0);
      }
    };
    checkPending();
    const interval = setInterval(checkPending, 8000);
    return () => clearInterval(interval);
  }, [user]);

  const roles: UserRole[] = [
    'INVESTIGATOR',
    'SUPERVISOR',
    'ADMIN',
    'PROSECUTOR',
    'FORENSIC_OFFICER',
    'COURT_REGISTRAR',
    'REVIEWER',
  ];

  return (
    <header className="h-topbar bg-bg-secondary border-b border-border px-4 sm:px-6 flex items-center justify-between z-20 shrink-0">
      {/* Left: Case Scope & System Indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent-success animate-pulse" />
          <span className="text-xs font-mono font-medium text-text-secondary uppercase tracking-wider hidden sm:inline">
            ICJS Node: Delhi Central
          </span>
        </div>

        {user && (
          <div className="hidden md:flex items-center gap-2 pl-3 border-l border-border text-xs text-text-muted">
            <span>Clearance:</span>
            <SensitivityBadge level={user.sensitivity_clearance} size="sm" />
          </div>
        )}
      </div>

      {/* Right: Role Switcher Simulation + User info + Notifications + Logout */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Rapid Testing Role Switcher */}
        {user && (
          <div className="flex items-center gap-1.5 bg-bg-card border border-border px-2 py-1 rounded-btn text-xs">
            <Shield className="w-3.5 h-3.5 text-accent-primary shrink-0 hidden sm:inline" />
            <span className="text-text-muted text-[11px] hidden sm:inline font-mono uppercase">Role:</span>
            <select
              aria-label="Switch Role Simulation"
              value={user.role}
              onChange={(e) => switchRole(e.target.value as UserRole)}
              className="bg-transparent text-text-primary text-xs font-medium outline-none cursor-pointer"
            >
              {roles.map((r) => (
                <option key={r} value={r} className="bg-bg-card text-text-primary">
                  {r}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Pending Dual-Auth Approvals notification for Supervisor/Admin */}
        {(user?.role === 'SUPERVISOR' || user?.role === 'ADMIN') && (
          <button
            onClick={() => {
              if (onOpenNotifications) onOpenNotifications();
              else navigate('/sharing');
            }}
            className="relative p-2 text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-btn transition-colors"
            title="Pending Dual-Auth Approvals"
          >
            <Bell className="w-4 h-4" />
            {pendingCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-accent-danger text-white rounded-full text-[10px] font-bold flex items-center justify-center animate-bounce">
                {pendingCount}
              </span>
            )}
          </button>
        )}

        {/* Light/Dark Theme Toggle Button (32x32px, transparent bg, hover bg-bg-elevated, radius 6px) */}
        <button
          onClick={toggleTheme}
          className="w-8 h-8 p-0 bg-transparent text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-[6px] flex items-center justify-center transition-colors shrink-0"
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label="Toggle light/dark theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-accent-primary" />}
        </button>

        {/* User Identity Info */}
        {user && (
          <div className="flex items-center gap-2 pl-2">
            <div className="w-7 h-7 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-text-primary shrink-0">
              <UserIcon className="w-3.5 h-3.5 text-accent-primary" />
            </div>
            <div className="hidden lg:flex flex-col text-left leading-tight">
              <span className="text-xs font-semibold text-text-primary truncate max-w-[140px]">
                {user.full_name}
              </span>
              <span className="text-[10px] text-text-muted truncate max-w-[140px]">
                {user.department}
              </span>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          className="p-2 text-text-muted hover:text-accent-danger hover:bg-bg-elevated rounded-btn transition-colors"
          title="Sign Out / End Session"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
