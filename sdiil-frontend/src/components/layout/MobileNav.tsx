import React from 'react';
import { LayoutDashboard, FolderLock, UploadCloud, Search, Share2, ShieldCheck, History } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export interface MobileNavProps {
  currentRoute: string;
  navigate: (route: string) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentRoute, navigate }) => {
  const { user } = useAuth();

  const items = [
    { id: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { id: '/cases', label: 'Cases', icon: FolderLock },
    {
      id: '/upload',
      label: 'Upload',
      icon: UploadCloud,
      disabled:
        user?.role === 'COURT_REGISTRAR' ||
        user?.role === 'REVIEWER' ||
        user?.role === 'PROSECUTOR',
    },
    { id: '/search', label: 'Search', icon: Search },
    { id: '/sharing', label: 'Share', icon: Share2, disabled: user?.role === 'COURT_REGISTRAR' || user?.role === 'REVIEWER' },
    { id: '/verification', label: 'Verify', icon: ShieldCheck },
    { id: '/audit', label: 'Audit', icon: History },
  ];

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 h-14 bg-bg-secondary border-t border-border z-40 flex items-center justify-around px-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentRoute === item.id || currentRoute.startsWith(item.id);
        const isDisabled = Boolean(item.disabled);

        return (
          <button
            key={item.id}
            onClick={() => !isDisabled && navigate(item.id)}
            disabled={isDisabled}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] transition-colors ${
              isActive
                ? 'text-accent-primary font-semibold'
                : isDisabled
                ? 'text-text-muted opacity-30 cursor-not-allowed'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon className="w-4 h-4 mb-0.5" />
            <span className="truncate max-w-[48px]">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
