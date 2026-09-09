import React, { useState, useEffect, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { adminService, AdminUser, AdminCase, SystemStats } from '@/services/admin.service';
import { useAudit } from '@/hooks/useAudit';
import { AuditTable } from '@/components/audit/AuditTable';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/Table';
import {
  ShieldAlert,
  UserPlus,
  Lock,
  Unlock,
  KeyRound,
  Pencil,
  Briefcase,
  BarChart3,
  History,
  FileText,
  Share2,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Download,
  FolderPlus,
  Users as UsersIcon,
} from 'lucide-react';

const ALLOWED_ROLES = [
  'INVESTIGATOR',
  'SUPERVISOR',
  'ADMIN',
  'PROSECUTOR',
  'FORENSIC_OFFICER',
  'COURT_REGISTRAR',
  'REVIEWER',
];

export const AdminPanel: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'cases' | 'stats' | 'audit'>('users');

  // --------------------------------------------------------------------------
  // Users Tab State
  // --------------------------------------------------------------------------
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showTempPasswordModal, setShowTempPasswordModal] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [createdUserEmail, setCreatedUserEmail] = useState('');
  const [hasCopiedPassword, setHasCopiedPassword] = useState(false);

  // New user form state
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserRole, setNewUserRole] = useState('INVESTIGATOR');
  const [newUserDepartment, setNewUserDepartment] = useState('Cyber Crime Investigation Cell');

  // Inline role editing state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [selectedRoleToUpdate, setSelectedRoleToUpdate] = useState<string>('');

  // Reset MFA confirmation modal
  const [mfaResetUser, setMfaResetUser] = useState<AdminUser | null>(null);

  // --------------------------------------------------------------------------
  // Cases Tab State
  // --------------------------------------------------------------------------
  const [cases, setCases] = useState<AdminCase[]>([]);
  const [isLoadingCases, setIsLoadingCases] = useState(false);
  const [showCreateCaseModal, setShowCreateCaseModal] = useState(false);
  const [newCaseId, setNewCaseId] = useState('');
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [newCaseDescription, setNewCaseDescription] = useState('');
  const [newCaseDepartment, setNewCaseDepartment] = useState('Special Crime Branch');

  // Case assignments modal state
  const [managingCase, setManagingCase] = useState<AdminCase | null>(null);
  const [assignTargetUserId, setAssignTargetUserId] = useState('');
  const [assignTargetRole, setAssignTargetRole] = useState('INVESTIGATOR');
  const [isAssigning, setIsAssigning] = useState(false);

  // --------------------------------------------------------------------------
  // System Stats Tab State
  // --------------------------------------------------------------------------
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // --------------------------------------------------------------------------
  // Audit Trail Tab State (Full cross-case admin visibility)
  // --------------------------------------------------------------------------
  const {
    logs: auditLogs,
    totalCount: auditTotalCount,
    isLoading: isLoadingAudit,
    filterAction,
    setFilterAction,
    filterCaseId: auditCaseFilter,
    setFilterCaseId: setAuditCaseFilter,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    searchTerm,
    setSearchTerm,
    refresh: refreshAudit,
  } = useAudit();

  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // --------------------------------------------------------------------------
  // Loaders
  // --------------------------------------------------------------------------
  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const data = await adminService.getUsers();
      setUsers(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load user records');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadCases = async () => {
    setIsLoadingCases(true);
    try {
      const data = await adminService.getCases();
      setCases(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load case records');
    } finally {
      setIsLoadingCases(false);
    }
  };

  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const data = await adminService.getSystemStats();
      setStats(data);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load system statistics');
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    if (currentAdmin?.role === 'ADMIN') {
      loadUsers();
      loadCases();
      loadStats();
    }
  }, [currentAdmin]);

  // --------------------------------------------------------------------------
  // User Management Actions
  // --------------------------------------------------------------------------
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserFullName || !newUserRole) return;

    try {
      const res = await adminService.createUser({
        email: newUserEmail.trim(),
        full_name: newUserFullName.trim(),
        role: newUserRole,
        department: newUserDepartment.trim(),
      });

      setTempPassword(res.temp_password);
      setCreatedUserEmail(res.user.email);
      setHasCopiedPassword(false);
      setShowCreateUserModal(false);
      setShowTempPasswordModal(true);

      // Reset form
      setNewUserEmail('');
      setNewUserFullName('');
      setNewUserRole('INVESTIGATOR');
      setNewUserDepartment('Cyber Crime Investigation Cell');

      toast.success('Officer provisioned successfully!');
      await loadUsers();
      await loadStats();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to provision user');
    }
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(tempPassword);
    setHasCopiedPassword(true);
    toast.success('Temporary password copied to clipboard!');
    setTimeout(() => setHasCopiedPassword(false), 3000);
  };

  const handleToggleLock = async (u: AdminUser) => {
    const isLocked = u.account_status === 'LOCKED';
    try {
      if (isLocked) {
        await adminService.unlockUser(u.id);
        toast.success(`Account unlocked for ${u.full_name}`);
      } else {
        await adminService.lockUser(u.id);
        toast.success(`Account locked and banned for ${u.full_name}`);
      }
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update account status');
    }
  };

  const handleSaveRole = async (userId: string) => {
    if (!selectedRoleToUpdate) return;
    try {
      await adminService.updateUserRole(userId, selectedRoleToUpdate);
      toast.success('User role updated successfully');
      setEditingUserId(null);
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update role');
    }
  };

  const handleConfirmResetMFA = async () => {
    if (!mfaResetUser) return;
    try {
      await adminService.resetUserMFA(mfaResetUser.id);
      toast.success(`MFA reset confirmed for ${mfaResetUser.full_name}`);
      setMfaResetUser(null);
      await loadUsers();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reset MFA');
    }
  };

  // --------------------------------------------------------------------------
  // Case Management Actions
  // --------------------------------------------------------------------------
  const handleCreateCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseId || !newCaseTitle) return;

    try {
      await adminService.createCase({
        case_id: newCaseId.trim(),
        title: newCaseTitle.trim(),
        description: newCaseDescription.trim(),
        department: newCaseDepartment.trim(),
      });

      toast.success(`Case ${newCaseId} created successfully`);
      setShowCreateCaseModal(false);
      setNewCaseId('');
      setNewCaseTitle('');
      setNewCaseDescription('');
      setNewCaseDepartment('Special Crime Branch');

      await loadCases();
      await loadStats();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create case');
    }
  };

  const handleAssignUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingCase || !assignTargetUserId) return;

    setIsAssigning(true);
    try {
      await adminService.assignUserToCase(
        managingCase.id,
        assignTargetUserId,
        assignTargetRole
      );
      toast.success('User assigned to case successfully');
      setAssignTargetUserId('');
      await loadCases();

      // Refresh managingCase in view
      const updated = await adminService.getCases();
      const ref = updated.find((c) => c.id === managingCase.id);
      if (ref) setManagingCase(ref);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to assign user');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRemoveUserFromCase = async (caseId: string, userId: string) => {
    try {
      await adminService.removeUserFromCase(caseId, userId);
      toast.success('User removed from case');
      await loadCases();

      // Refresh managingCase in view
      const updated = await adminService.getCases();
      const ref = updated.find((c) => c.id === caseId);
      if (ref) setManagingCase(ref);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove user');
    }
  };

  // --------------------------------------------------------------------------
  // Export Audit CSV Action
  // --------------------------------------------------------------------------
  const handleExportAuditCsv = async () => {
    setIsExportingCsv(true);
    try {
      const token = await adminService.getAuthToken();
      const res = await fetch(`${adminService.getApiBase()}/audit?limit=2000`, {
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      const data = await res.json();
      const logs = data.logs || [];

      if (logs.length === 0) {
        toast.error('No audit records available to export.');
        return;
      }

      // Convert to CSV
      const headers = ['Timestamp (UTC)', 'Action', 'Resource Type', 'Resource ID', 'Case ID', 'User Name', 'User Role', 'IP Address', 'Description'];
      const rows = logs.map((l: any) => [
        `"${l.timestamp || l.created_at || ''}"`,
        `"${l.action || ''}"`,
        `"${l.resource_type || ''}"`,
        `"${l.resource_id || ''}"`,
        `"${l.case_id || ''}"`,
        `"${l.user?.name || l.profiles?.name || ''}"`,
        `"${l.user?.role || l.profiles?.role || ''}"`,
        `"${l.ip_address || ''}"`,
        `"${(l.description || '').replace(/"/g, '""')}"`,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sdiil_audit_trail_export_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${logs.length} audit entries to CSV`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to export audit CSV');
    } finally {
      setIsExportingCsv(false);
    }
  };

  // Users not currently assigned to managingCase
  const unassignedUsersForCase = useMemo(() => {
    if (!managingCase) return [];
    const assignedIds = new Set((managingCase.assigned_users || []).map((a) => a.user_id));
    return users.filter((u) => !assignedIds.has(u.id));
  }, [managingCase, users]);

  // --------------------------------------------------------------------------
  // Immediate Access Denied Guard
  // --------------------------------------------------------------------------
  if (currentAdmin?.role !== 'ADMIN') {
    return (
      <div className="py-24 text-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-full bg-accent-danger/10 border border-accent-danger/30 flex items-center justify-center text-accent-danger mx-auto mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-text-primary">Access Denied</h2>
        <p className="text-xs text-text-secondary mt-2 leading-relaxed">
          Central Governance console requires verified <strong>ADMIN</strong> clearance.
          Your current session role (<span className="font-mono text-text-primary">{currentAdmin?.role || 'ANONYMOUS'}</span>) is not permitted to view or execute administrative operations.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-h1 font-bold text-text-primary flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-accent-primary" />
            Central Governance & Administration
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Real-time identity provisioning, case assignments, cryptographic tamper surveillance, and system auditing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'users' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreateUserModal(true)}
              leftIcon={<UserPlus className="w-4 h-4" />}
            >
              Add User
            </Button>
          )}

          {activeTab === 'cases' && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreateCaseModal(true)}
              leftIcon={<FolderPlus className="w-4 h-4" />}
            >
              Create Case
            </Button>
          )}

          {activeTab === 'stats' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={loadStats}
              isLoading={isLoadingStats}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Refresh Stats
            </Button>
          )}

          {activeTab === 'audit' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportAuditCsv}
              isLoading={isExportingCsv}
              leftIcon={<Download className="w-4 h-4" />}
            >
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <UsersIcon className="w-4 h-4" />
          <span>Users</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-bg-elevated border border-border">
            {users.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('cases')}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'cases'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>Cases</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-bg-elevated border border-border">
            {cases.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'stats'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>System Stats</span>
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-colors ${
            activeTab === 'audit'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Log</span>
          <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-bg-elevated border border-border">
            {auditTotalCount}
          </span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: USERS                                                         */}
      {/* ==================================================================== */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cases Assigned</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingUsers ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-text-muted">
                    Loading officers & judicial users...
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-text-muted">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => {
                  const isLocked = u.account_status === 'LOCKED';
                  const isEditingRole = editingUserId === u.id;

                  return (
                    <TableRow key={u.id} className="text-xs hover:bg-bg-elevated/40">
                      <TableCell className="font-semibold text-text-primary">
                        {u.full_name}
                      </TableCell>
                      <TableCell className="font-mono text-text-secondary">
                        {u.email || '—'}
                      </TableCell>
                      <TableCell>
                        {isEditingRole ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={selectedRoleToUpdate}
                              onChange={(e) => setSelectedRoleToUpdate(e.target.value)}
                              className="bg-bg-elevated text-text-primary border border-accent-primary rounded px-2 py-1 text-xs outline-none"
                            >
                              {ALLOWED_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleSaveRole(u.id)}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingUserId(null)}
                            >
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <Badge variant="outline" size="sm">
                            {u.role}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-text-secondary">
                        {u.department}
                      </TableCell>
                      <TableCell>
                        {isLocked ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border border-[#E84545]/40 bg-[#1A0808] text-[#E84545]">
                            LOCKED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border border-[#22C97A]/40 bg-[#081A10] text-[#22C97A]">
                            ACTIVE
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-text-secondary">
                        {u.case_count} Case(s)
                      </TableCell>
                      <TableCell className="text-text-muted text-[11px]">
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleDateString()
                          : 'Never'}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setEditingUserId(u.id);
                              setSelectedRoleToUpdate(u.role);
                            }}
                            title="Edit Role"
                            className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleLock(u)}
                            title={isLocked ? 'Unlock Account' : 'Lock & Ban Account'}
                            className={`p-1.5 rounded transition-colors ${
                              isLocked
                                ? 'text-accent-success hover:bg-accent-success/10'
                                : 'text-accent-danger hover:bg-accent-danger/10'
                            }`}
                          >
                            {isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => setMfaResetUser(u)}
                            title="Reset MFA Factors"
                            className="p-1.5 rounded text-text-secondary hover:text-accent-warning hover:bg-accent-warning/10 transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: CASES                                                         */}
      {/* ==================================================================== */}
      {activeTab === 'cases' && (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Assigned Users</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingCases ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-text-muted">
                    Loading statutory case registries...
                  </TableCell>
                </TableRow>
              ) : cases.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-text-muted">
                    No cases registered yet.
                  </TableCell>
                </TableRow>
              ) : (
                cases.map((c) => (
                  <TableRow key={c.id} className="text-xs hover:bg-bg-elevated/40">
                    <TableCell className="font-mono font-bold text-accent-primary">
                      {c.case_number}
                    </TableCell>
                    <TableCell className="font-semibold text-text-primary max-w-xs truncate">
                      {c.title}
                      {c.description && (
                        <div className="text-[11px] text-text-muted font-normal truncate">
                          {c.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-text-secondary">
                      {c.department || 'Crime Branch'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" size="sm" className="uppercase font-mono">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-text-secondary">
                      {c.document_count} Doc(s)
                    </TableCell>
                    <TableCell className="font-mono text-text-secondary">
                      {c.assigned_user_count} Officer(s)
                    </TableCell>
                    <TableCell className="text-text-muted text-[11px]">
                      {new Date(c.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setManagingCase(c)}
                        leftIcon={<UsersIcon className="w-3.5 h-3.5" />}
                      >
                        Manage Assignments
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: SYSTEM STATS                                                  */}
      {/* ==================================================================== */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="p-5 flex items-center justify-between border-border bg-bg-surface">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Total Users
                </span>
                <div className="text-3xl font-bold text-text-primary mt-2">
                  {stats ? stats.total_users : '...'}
                </div>
                <div className="text-[11px] text-text-secondary mt-1">
                  Provisioned officer & judicial identities
                </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary">
                <UsersIcon className="w-6 h-6" />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between border-border bg-bg-surface">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Total Cases
                </span>
                <div className="text-3xl font-bold text-text-primary mt-2">
                  {stats ? stats.total_cases : '...'}
                </div>
                <div className="text-[11px] text-text-secondary mt-1">
                  Active ICJS jurisdictional cases
                </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-accent-secondary/10 border border-accent-secondary/30 flex items-center justify-center text-accent-secondary">
                <Briefcase className="w-6 h-6" />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between border-border bg-bg-surface">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Total Documents
                </span>
                <div className="text-3xl font-bold text-text-primary mt-2">
                  {stats ? stats.total_documents : '...'}
                </div>
                <div className="text-[11px] text-text-secondary mt-1">
                  Cryptographically anchored evidence files
                </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-accent-success/10 border border-accent-success/30 flex items-center justify-center text-accent-success">
                <FileText className="w-6 h-6" />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between border-border bg-bg-surface">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Total Audit Events
                </span>
                <div className="text-3xl font-bold text-text-primary mt-2">
                  {stats ? stats.total_audit_events : '...'}
                </div>
                <div className="text-[11px] text-text-secondary mt-1">
                  Permanently appended ledger entries
                </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-accent-warning/10 border border-accent-warning/30 flex items-center justify-center text-accent-warning">
                <History className="w-6 h-6" />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between border-[#E84545]/30 bg-[#1A0808]/20">
              <div>
                <span className="text-xs font-semibold text-[#E84545] uppercase tracking-wider">
                  Active Anomalies
                </span>
                <div className="text-3xl font-bold text-[#E84545] mt-2">
                  {stats ? stats.unacknowledged_anomalies : '...'}
                </div>
                <div className="text-[11px] text-text-secondary mt-1">
                  Unacknowledged surveillance alerts
                </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-[#E84545]/10 border border-[#E84545]/40 flex items-center justify-center text-[#E84545]">
                <ShieldAlert className="w-6 h-6" />
              </div>
            </Card>

            <Card className="p-5 flex items-center justify-between border-border bg-bg-surface">
              <div>
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Active Shares & Approvals
                </span>
                <div className="text-3xl font-bold text-text-primary mt-2">
                  {stats ? `${stats.active_shares} / ${stats.pending_approvals}` : '...'}
                </div>
                <div className="text-[11px] text-text-secondary mt-1">
                  Active access grants / Pending dual-auth
                </div>
              </div>
              <div className="w-12 h-12 rounded-full bg-accent-primary/10 border border-accent-primary/30 flex items-center justify-center text-accent-primary">
                <Share2 className="w-6 h-6" />
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: AUDIT LOG (Cross-Case Visibility)                             */}
      {/* ==================================================================== */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <AuditTable
            logs={auditLogs}
            totalCount={auditTotalCount}
            filterAction={filterAction}
            setFilterAction={setFilterAction}
            filterCaseId={auditCaseFilter}
            setFilterCaseId={setAuditCaseFilter}
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            isLoading={isLoadingAudit}
            onRefresh={refreshAudit}
          />
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: ADD USER                                                      */}
      {/* ==================================================================== */}
      <Modal
        isOpen={showCreateUserModal}
        onClose={() => setShowCreateUserModal(false)}
        title="Provision New ICJS Officer Account"
        subtitle="Generates cryptographically scoped credentials with automated temporary password."
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            label="Government Official Email"
            type="email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="officer.name@nic.in"
            required
          />

          <Input
            label="Full Name & Designation"
            value={newUserFullName}
            onChange={(e) => setNewUserFullName(e.target.value)}
            placeholder="e.g. Insp. Vikram Rathore"
            required
          />

          <div>
            <label className="text-label text-text-secondary block mb-1.5">
              Assigned Judicial / Police Role
            </label>
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value)}
              className="w-full bg-bg-elevated text-text-primary border border-border rounded-input text-xs p-2.5 outline-none focus:border-accent-primary"
            >
              {ALLOWED_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Department / Jurisdictional Node"
            value={newUserDepartment}
            onChange={(e) => setNewUserDepartment(e.target.value)}
            placeholder="e.g. Cyber Crime Cell, Pune"
            required
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-border mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowCreateUserModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Provision Credentials
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: TEMPORARY PASSWORD COPY                                       */}
      {/* ==================================================================== */}
      <Modal
        isOpen={showTempPasswordModal}
        onClose={() => setShowTempPasswordModal(false)}
        title="User Provisioned Successfully"
        subtitle="A secure temporary password has been generated for this account."
      >
        <div className="space-y-4">
          <div className="p-3 bg-accent-warning/10 border border-accent-warning/30 rounded text-xs text-accent-warning">
            <strong>Security Notice:</strong> Share this temporary password securely with the user (<span className="font-mono text-text-primary">{createdUserEmail}</span>). They must change it upon their first sign-in.
          </div>

          <div className="flex items-center justify-between p-3 bg-bg-elevated border border-border rounded">
            <span className="font-mono text-base font-bold text-accent-primary tracking-wider">
              {tempPassword}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopyPassword}
              leftIcon={hasCopiedPassword ? <Check className="w-4 h-4 text-accent-success" /> : <Copy className="w-4 h-4" />}
            >
              {hasCopiedPassword ? 'Copied' : 'Copy Password'}
            </Button>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => setShowTempPasswordModal(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: CREATE CASE                                                   */}
      {/* ==================================================================== */}
      <Modal
        isOpen={showCreateCaseModal}
        onClose={() => setShowCreateCaseModal(false)}
        title="Create New Case Folder"
        subtitle="Registers an official ICJS investigation docket with cryptographic custody."
      >
        <form onSubmit={handleCreateCase} className="space-y-4">
          <Input
            label="Case Identifier / Docket Number"
            value={newCaseId}
            onChange={(e) => setNewCaseId(e.target.value)}
            placeholder="e.g. MH-PN-2026-0199"
            required
          />

          <Input
            label="Case Title"
            value={newCaseTitle}
            onChange={(e) => setNewCaseTitle(e.target.value)}
            placeholder="State of Maharashtra vs. ... (Organized Syndicate Crime)"
            required
          />

          <Input
            label="Department / Police Station"
            value={newCaseDepartment}
            onChange={(e) => setNewCaseDepartment(e.target.value)}
            placeholder="e.g. Deccan Police Station, Special Cell"
          />

          <div>
            <label className="text-label text-text-secondary block mb-1.5">Case Description / Synopsis</label>
            <textarea
              value={newCaseDescription}
              onChange={(e) => setNewCaseDescription(e.target.value)}
              placeholder="Brief summary of allegations, sections of law, and jurisdictional notes..."
              className="w-full bg-bg-elevated text-text-primary border border-border rounded-input text-xs p-2.5 outline-none focus:border-accent-primary min-h-[80px]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowCreateCaseModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Case Docket
            </Button>
          </div>
        </form>
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: MANAGE CASE ASSIGNMENTS                                       */}
      {/* ==================================================================== */}
      <Modal
        isOpen={Boolean(managingCase)}
        onClose={() => setManagingCase(null)}
        title={`Manage Case Assignments: ${managingCase?.case_number || ''}`}
        subtitle="Grant or revoke case access permissions enforcing strict Row Level Security."
      >
        {managingCase && (
          <div className="space-y-5">
            {/* Add User Section */}
            <form onSubmit={handleAssignUser} className="p-3.5 bg-bg-elevated border border-border rounded space-y-3">
              <h4 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-accent-primary" />
                Assign Officer to Case
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-text-secondary block mb-1">Select Officer</label>
                  <select
                    value={assignTargetUserId}
                    onChange={(e) => setAssignTargetUserId(e.target.value)}
                    className="w-full bg-bg-surface text-text-primary border border-border rounded text-xs p-2 outline-none focus:border-accent-primary"
                    required
                  >
                    <option value="">-- Choose User --</option>
                    {unassignedUsersForCase.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role} - {u.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-text-secondary block mb-1">Role in Case</label>
                  <select
                    value={assignTargetRole}
                    onChange={(e) => setAssignTargetRole(e.target.value)}
                    className="w-full bg-bg-surface text-text-primary border border-border rounded text-xs p-2 outline-none focus:border-accent-primary"
                  >
                    <option value="LEAD_INVESTIGATOR">Lead Investigator</option>
                    <option value="INVESTIGATOR">Investigator</option>
                    <option value="SUPERVISOR">Supervisor</option>
                    <option value="PROSECUTOR">Prosecutor</option>
                    <option value="JUDGE">Judge</option>
                    <option value="REVIEWER">Reviewer</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  type="submit"
                  variant="primary"
                  disabled={!assignTargetUserId}
                  isLoading={isAssigning}
                >
                  Assign to Case
                </Button>
              </div>
            </form>

            {/* Current Assignments Table */}
            <div>
              <h4 className="text-xs font-semibold text-text-primary mb-2">
                Currently Assigned Personnel ({managingCase.assigned_users?.length || 0})
              </h4>
              <div className="max-h-60 overflow-y-auto border border-border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Officer</TableHead>
                      <TableHead>System Role</TableHead>
                      <TableHead>Role in Case</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!managingCase.assigned_users || managingCase.assigned_users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-4 text-text-muted text-xs">
                          No personnel assigned to this case.
                        </TableCell>
                      </TableRow>
                    ) : (
                      managingCase.assigned_users.map((a) => (
                        <TableRow key={a.id} className="text-xs">
                          <TableCell className="font-semibold text-text-primary">
                            {a.profiles?.name || 'Officer'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" size="sm">
                              {a.profiles?.role || 'OFFICER'}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-accent-primary text-[11px]">
                            {a.role_in_case}
                          </TableCell>
                          <TableCell className="text-right">
                            <button
                              onClick={() => handleRemoveUserFromCase(managingCase.id, a.user_id)}
                              title="Remove from Case"
                              className="p-1 text-accent-danger hover:bg-accent-danger/10 rounded transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setManagingCase(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ==================================================================== */}
      {/* MODAL: RESET MFA CONFIRMATION                                        */}
      {/* ==================================================================== */}
      <Modal
        isOpen={Boolean(mfaResetUser)}
        onClose={() => setMfaResetUser(null)}
        title="Confirm MFA Reset"
        subtitle="Forces unenrollment of second factor authentication."
      >
        {mfaResetUser && (
          <div className="space-y-4">
            <p className="text-xs text-text-secondary leading-relaxed">
              Are you sure you want to reset MFA factors for{' '}
              <strong className="text-text-primary">{mfaResetUser.full_name}</strong> (
              <span className="font-mono">{mfaResetUser.email}</span>)? All enrolled TOTP tokens will be revoked immediately and the officer will be forced to re-enroll on their next login.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" onClick={() => setMfaResetUser(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmResetMFA}>
                Confirm MFA Reset
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
