import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileNav } from './MobileNav';

export interface PageWrapperProps {
  currentRoute: string;
  navigate: (route: string) => void;
  children: React.ReactNode;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({
  currentRoute,
  navigate,
  children,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Responsive behavior:
  // Tablet (640–1024px): auto-collapses to icons only (64px)
  // Desktop (>1024px): full 240px sidebar with manual toggle
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width >= 640 && width <= 1024) {
        setIsCollapsed(true);
      }
    };
    if (window.innerWidth >= 640 && window.innerWidth <= 1024) {
      setIsCollapsed(true);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-primary text-text-primary">
      {/* Sidebar for Tablet & Desktop */}
      <Sidebar
        currentRoute={currentRoute}
        navigate={navigate}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar navigate={navigate} />

        <main className="flex-1 overflow-y-auto pb-16 sm:pb-6 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1280px]">
            {children}
          </div>
        </main>

        {/* Mobile Bottom Navigation */}
        <MobileNav currentRoute={currentRoute} navigate={navigate} />
      </div>
    </div>
  );
};
