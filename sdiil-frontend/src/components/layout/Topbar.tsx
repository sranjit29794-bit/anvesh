import React, { useState, useEffect } from 'react';
import { LogOut, Bell, Shield, User as UserIcon, Sun, Moon, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/context/ThemeContext';
import { SensitivityBadge } from '@/components/ui/SensitivityBadge';
import { supabase } from '@/services/supabase.client';
import { sharingService } from '@/services/sharing.service';

export interface TopbarProps {
  onOpenNotifications?: () => void;
  navigate: (route: string) => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onOpenNotifications: _onOpenNotifications, navigate }) => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [pendingSharingCount, setPendingSharingCount] = useState<number>(0);
  const [pendingDocCount, setPendingDocCount] = useState<number>(0);
  const [showNotificationMenu, setShowNotificationMenu] = useState<boolean>(false);

  useEffect(() => {
    const checkPending = async () => {
      if (user?.role === 'SUPERVISOR' || user?.role === 'ADMIN') {
        try {
          const approvals = await sharingService.getPendingApprovals();
          setPendingSharingCount(approvals?.length || 0);
        } catch {
          setPendingSharingCount(0);
        }

        try {
          const { count } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'PENDING_REVIEW');
          setPendingDocCount(count || 0);
        } catch {
          setPendingDocCount(0);
        }
      } else {
        setPendingSharingCount(0);
        setPendingDocCount(0);
      }
    };

    checkPending();
    const interval = setInterval(checkPending, 8000);
    return () => clearInterval(interval);
  }, [user]);

  const totalNotifications = pendingSharingCount + pendingDocCount;

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

      {/* Right: User Role Badge + User info + Notifications + Logout */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Read-Only Role Badge */}
        {user && (
          <div className="flex items-center gap-1.5 bg-bg-card border border-border px-2.5 py-1 rounded-btn text-xs">
            <Shield className="w-3.5 h-3.5 text-accent-primary shrink-0 hidden sm:inline" />
            <span className="text-text-muted text-[11px] hidden sm:inline font-mono uppercase">Role:</span>
            <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold bg-accent-primary/10 text-accent-primary border border-accent-primary/30">
              {user.role}
            </span>
          </div>
        )}

        {/* Pending Reviews & Approvals notification for Supervisor/Admin */}
        {(user?.role === 'SUPERVISOR' || user?.role === 'ADMIN') && (
          <div className="relative">
            <button
              onClick={() => setShowNotificationMenu((prev) => !prev)}
              className="relative p-2 text-text-secondary hover:text-text-primary hover:bg-bg-elevated rounded-btn transition-colors cursor-pointer"
              title={
                pendingDocCount > 0
                  ? `${pendingDocCount} documents awaiting your review`
                  : pendingSharingCount > 0
                  ? `${pendingSharingCount} pending dual-auth requests`
                  : 'Notifications'
              }
            >
              <Bell className="w-4 h-4" />
              {totalNotifications > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-accent-danger text-white rounded-full text-[10px] font-bold flex items-center justify-center animate-bounce shadow-sm">
                  {totalNotifications}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotificationMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-bg-card border border-border rounded-modal shadow-modal p-3 z-50 space-y-2 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-border text-xs font-semibold text-text-primary">
                  <span>Supervisor Alerts</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary">
                    {totalNotifications} Active
                  </span>
                </div>

                {totalNotifications === 0 ? (
                  <p className="text-xs text-text-muted py-2 text-center">
                    All reviews and approvals are up to date.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {pendingDocCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotificationMenu(false);
                          navigate('/cases');
                        }}
                        className="w-full text-left p-2.5 rounded-btn bg-[#F5A623]/10 hover:bg-[#F5A623]/20 border border-[#F5A623]/30 transition-colors flex items-start gap-2.5 cursor-pointer"
                      >
                        <Clock className="w-4 h-4 text-[#F5A623] shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-[#F5A623]">
                            {pendingDocCount} documents awaiting your review
                          </p>
                          <p className="text-[11px] text-text-muted mt-0.5">
                            Click to inspect case documents awaiting supervisor attestation
                          </p>
                        </div>
                      </button>
                    )}

                    {pendingSharingCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotificationMenu(false);
                          navigate('/sharing');
                        }}
                        className="w-full text-left p-2.5 rounded-btn bg-accent-primary/10 hover:bg-accent-primary/20 border border-accent-primary/30 transition-colors flex items-start gap-2.5 cursor-pointer"
                      >
                        <Shield className="w-4 h-4 text-accent-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-accent-primary">
                            {pendingSharingCount} dual-auth sharing requests
                          </p>
                          <p className="text-[11px] text-text-muted mt-0.5">
                            Pending Sensitivity-A cross-agency authorizations
                          </p>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
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
