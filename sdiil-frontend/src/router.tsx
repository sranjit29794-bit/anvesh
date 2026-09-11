import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Login } from '@/pages/Login';
import { MFA } from '@/pages/MFA';
import { Dashboard } from '@/pages/Dashboard';
import { CaseDetail } from '@/pages/CaseDetail';
import { DocumentUpload } from '@/pages/DocumentUpload';
import { DocumentView } from '@/pages/DocumentView';
import { Search } from '@/pages/Search';
import { Sharing } from '@/pages/Sharing';
import { AuditTrail } from '@/pages/AuditTrail';
import { Verification } from '@/pages/Verification';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { DocumentRecord } from '@/types/document.types';

export const AppRouter: React.FC = () => {
  const { isAuthenticated, isMfaPending, caseAssignments } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<string>('/dashboard');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('MH-PN-2026-0142');
  const [selectedDocId, setSelectedDocId] = useState<string>('');

  // Sync selectedCaseId with user's assigned cases if available
  React.useEffect(() => {
    if (caseAssignments.length > 0 && selectedCaseId === 'MH-PN-2026-0142') {
      setSelectedCaseId(caseAssignments[0].case_id);
    }
  }, [caseAssignments, selectedCaseId]);

  // Navigation handler
  const navigate = (route: string) => {
    setCurrentRoute(route);
  };

  // Rule: Mandatory MFA in Auth Flow
  // If user has not completed login + MFA, route only to Login or MFA
  if (!isAuthenticated) {
    if (isMfaPending) {
      return <MFA navigate={navigate} />;
    }
    return <Login navigate={navigate} />;
  }

  // If authenticated user attempts to access /login or /mfa, redirect to dashboard
  if (currentRoute === '/login' || currentRoute === '/mfa') {
    setCurrentRoute('/dashboard');
  }

  // Selected document handler
  const handleSelectDoc = (docOrId: DocumentRecord | string) => {
    const id = typeof docOrId === 'string' ? docOrId : docOrId.file_id;
    setSelectedDocId(id);
    navigate(`/documents/${id}`);
  };

  // Selected case handler
  const handleSelectCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    navigate(`/cases/${caseId}`);
  };

  // Route resolution for authenticated session
  const renderCurrentPage = () => {
    if (currentRoute === '/dashboard') {
      return (
        <Dashboard
          navigate={navigate}
          onSelectCase={handleSelectCase}
          onSelectDoc={handleSelectDoc}
        />
      );
    }

    if (currentRoute === '/cases' || currentRoute.startsWith('/cases/')) {
      return (
        <CaseDetail
          caseId={selectedCaseId}
          onBack={() => navigate('/dashboard')}
          onSelectDoc={handleSelectDoc}
          navigate={navigate}
        />
      );
    }

    if (currentRoute === '/upload') {
      return <DocumentUpload navigate={navigate} defaultCaseId={selectedCaseId} />;
    }

    if (currentRoute.startsWith('/documents/')) {
      const routeDocId = currentRoute.replace('/documents/', '').trim();
      const activeDocId = routeDocId || selectedDocId;
      return (
        <DocumentView
          docId={activeDocId}
          onBack={() => navigate(selectedCaseId ? `/cases/${selectedCaseId}` : '/dashboard')}
          navigate={navigate}
        />
      );
    }

    if (currentRoute === '/search') {
      return <Search navigate={navigate} onSelectDoc={handleSelectDoc} />;
    }

    if (currentRoute === '/sharing') {
      return <Sharing onSelectDoc={handleSelectDoc} />;
    }

    if (currentRoute === '/verification') {
      return <Verification initialDocId={selectedDocId} />;
    }

    if (currentRoute === '/audit') {
      return <AuditTrail />;
    }

    // Default fallback
    return (
      <Dashboard
        navigate={navigate}
        onSelectCase={handleSelectCase}
        onSelectDoc={handleSelectDoc}
      />
    );
  };

  return (
    <PageWrapper currentRoute={currentRoute} navigate={navigate}>
      {renderCurrentPage()}
    </PageWrapper>
  );
};
