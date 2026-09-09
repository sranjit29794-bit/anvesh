import React from 'react';
import {
  LayoutDashboard,
  FolderLock,
  UploadCloud,
  Search,
  Share2,
  ShieldCheck,
  History,
  ShieldAlert,
  Menu,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Tooltip } from '@/components/ui/Tooltip';

export interface SidebarProps {
  currentRoute: string;
  navigate: (route: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  navigate,
  isCollapsed,
  setIsCollapsed,
}) => {
  const { user } = useAuth();

  interface NavItem {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    disabled?: boolean;
    lockReason?: string;
  }

  const navItems: NavItem[] = [
    { id: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: '/cases', label: 'Case Folders', icon: FolderLock },
    {
      id: '/upload',
      label: 'Evidence Ingest',
      icon: UploadCloud,
      disabled:
        user?.role === 'COURT_REGISTRAR' ||
        user?.role === 'REVIEWER' ||
        user?.role === 'PROSECUTOR',
      lockReason: `${user?.role} restricted from uploading`,
    },
    { id: '/search', label: 'ABAC Intelligence', icon: Search },
    {
      id: '/sharing',
      label: 'Controlled Sharing',
      icon: Share2,
      disabled: user?.role === 'COURT_REGISTRAR' || user?.role === 'REVIEWER',
      lockReason: `${user?.role} restricted from share initiation`,
    },
    { id: '/verification', label: 'Tamper Verification', icon: ShieldCheck },
    { id: '/audit', label: 'Audit Trail', icon: History },
  ];

  // Admin panel visible to ADMIN or SUPERVISOR
  if (user?.role === 'ADMIN' || user?.role === 'SUPERVISOR') {
    navItems.push({
      id: '/admin',
      label: 'Admin Control',
      icon: ShieldAlert,
    });
  }

  return (
    <aside
      className={`hidden sm:flex flex-col bg-bg-secondary border-r border-border transition-[width] duration-300 ease-in-out z-30 select-none shrink-0 ${
        isCollapsed ? 'w-[64px]' : 'w-[240px]'
      }`}
    >
      {/* Brand Header with fixed drawer toggle icon at top-left */}
      <div className="h-topbar flex items-center border-b border-border px-3 shrink-0">
        <div className="w-full flex items-center justify-between">
          {/* Drawer Icon: NEVER hidden on collapse, clickable in both expanded and collapsed states */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="w-10 h-10 rounded-btn flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors shrink-0"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo & Brand title: hides only on collapse */}
          {!isCollapsed && (
            <div className="flex items-center gap-2 overflow-hidden flex-1 pl-2">
              <div className="w-7 h-7 rounded-md bg-accent-primary/20 border border-accent-primary/40 flex items-center justify-center shrink-0">
                <span className="text-accent-primary font-bold text-xs tracking-wider">SD</span>
              </div>
              <div className="flex flex-col truncate">
                <span className="font-semibold text-xs text-text-primary tracking-wide">SDIIL DMS</span>
                <span className="text-[9px] text-text-muted tracking-wider uppercase font-medium">
                  ICJS Prototype
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation List: nav icons stay visible in a vertical stack, only text labels hide */}
      <nav className="flex-1 py-4 px-2 space-y-1.5 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            currentRoute === item.id ||
            (item.id !== '/dashboard' && currentRoute.startsWith(item.id));
          const isDisabled = Boolean(item.disabled);

          const button = (
            <button
              type="button"
              onClick={() => !isDisabled && navigate(item.id)}
              disabled={isDisabled}
              className={`flex items-center rounded-btn text-body font-medium transition-colors duration-150 ${
                isCollapsed ? 'justify-center w-10 h-10 mx-auto p-0' : 'w-full gap-3 px-3 py-2'
              } ${
                isActive
                  ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/30'
                  : isDisabled
                  ? 'text-text-muted opacity-40 cursor-not-allowed hover:bg-transparent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
              {!isCollapsed && isDisabled && (
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-bg-primary text-text-muted border border-border">
                  LOCKED
                </span>
              )}
            </button>
          );

          // On hover over a collapsed nav icon, show Tooltip positioned to the right
          if (isCollapsed) {
            return (
              <div key={item.id} className="flex justify-center w-full">
                <Tooltip
                  content={
                    isDisabled
                      ? `${item.label} (${item.lockReason || 'Locked'})`
                      : item.label
                  }
                  position="right"
                >
                  {button}
                </Tooltip>
              </div>
            );
          }

          return <div key={item.id}>{button}</div>;
        })}
      </nav>

      {/* Security Status Box: only visible in expanded state */}
      {!isCollapsed && (
        <div className="p-3 m-2 rounded-card bg-bg-card border border-border shrink-0">
          <div className="flex items-center justify-between text-[11px] text-text-muted mb-1 font-mono uppercase tracking-wider">
            <span>Envelope Enc</span>
            <span className="text-accent-success">AES-256</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-text-muted font-mono uppercase tracking-wider">
            <span>Audit Anchor</span>
            <span className="text-accent-primary">Immutable</span>
          </div>
        </div>
      )}
    </aside>
  );
};
