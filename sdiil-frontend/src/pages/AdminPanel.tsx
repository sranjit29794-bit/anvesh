import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { authService } from '@/services/auth.service';
import { db } from '@/services/api';
import { User, UserRole, AccountStatus } from '@/types/auth.types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/Table';
import { ShieldAlert, UserPlus, Lock, Unlock, KeyRound } from 'lucide-react';

export const AdminPanel: React.FC = () => {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New user form state
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('INVESTIGATOR');
  const [newDepartment, setNewDepartment] = useState('Delhi Police Special Cell');

  const loadUsers = async () => {
    const data = await authService.getUsers();
    setUsers(data);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleToggleLock = async (targetUser: User) => {
    if (!currentAdmin) return;
    const newStatus: AccountStatus =
      targetUser.account_status === 'LOCKED' ? 'ACTIVE' : 'LOCKED';

    await authService.updateUser(currentAdmin.user_id, targetUser.user_id, {
      account_status: newStatus,
      failed_attempts: 0,
    });
    await loadUsers();
  };

  const handleResetMFA = async (targetUser: User) => {
    if (!currentAdmin) return;
    await authService.updateUser(currentAdmin.user_id, targetUser.user_id, {
      failed_attempts: 0,
    });
    alert(`MFA lockout reset confirmed for ${targetUser.username}.`);
    await loadUsers();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentAdmin) return;

    const newUser: User = {
      user_id: `usr-${Date.now().toString().slice(-4)}`,
      username: newUsername.trim().toLowerCase(),
      full_name: newFullName.trim(),
      role: newRole,
      department: newDepartment,
      email: newEmail.trim(),
      account_status: 'ACTIVE',
      mfa_method: 'TOTP',
      case_ids: ['case-del-2024-001'],
      sensitivity_clearance: ['INVESTIGATOR', 'SUPERVISOR', 'ADMIN'].includes(newRole)
        ? 'A'
        : newRole === 'COURT_REGISTRAR'
        ? 'C'
        : 'B',
      failed_attempts: 0,
      created_at: new Date().toISOString(),
    };

    db.users.push(newUser);
    db.logAudit({
      user_id: currentAdmin.user_id,
      username: currentAdmin.username,
      action: 'ADMIN_USER_MODIFIED',
      ip_address: '10.14.22.8',
      metadata: { action: 'USER_CREATED', target_user: newUser.username, role: newRole },
    });

    setShowCreateModal(false);
    setNewUsername('');
    setNewFullName('');
    setNewEmail('');
    await loadUsers();
  };

  const roles: UserRole[] = [
    'INVESTIGATOR',
    'SUPERVISOR',
    'ADMIN',
    'PROSECUTOR',
    'FORENSIC_OFFICER',
    'COURT_REGISTRAR',
    'REVIEWER',
  ];

  if (currentAdmin?.role !== 'ADMIN' && currentAdmin?.role !== 'SUPERVISOR') {
    return (
      <div className="py-20 text-center text-text-muted">
        Access Denied. Administrator clearance required.
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-h1 font-bold text-text-primary flex items-center gap-2.5">
            <ShieldAlert className="w-6 h-6 text-accent-primary" />
            Central User & RBAC Governance
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Provision officer credentials, case assignments, account locks, and MFA credentials.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setShowCreateModal(true)}
          leftIcon={<UserPlus className="w-4 h-4" />}
        >
          Provision Officer Account
        </Button>
      </div>

      {/* Users Ledger Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Officer Name</TableHead>
            <TableHead>Username / ID</TableHead>
            <TableHead>Assigned Role</TableHead>
            <TableHead>Clearance</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned Cases</TableHead>
            <TableHead className="text-right">Governance Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isLocked = u.account_status === 'LOCKED';

            return (
              <TableRow key={u.user_id} className="text-xs">
                <TableCell className="font-semibold text-text-primary">
                  {u.full_name}
                  <div className="text-[10px] text-text-muted font-normal">{u.department}</div>
                </TableCell>
                <TableCell className="font-mono text-text-secondary">{u.username}</TableCell>
                <TableCell>
                  <Badge variant="outline" size="sm">
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-accent-primary font-bold">Tier {u.sensitivity_clearance}</span>
                </TableCell>
                <TableCell>
                  {isLocked ? (
                    <Badge variant="danger" size="sm">
                      LOCKED
                    </Badge>
                  ) : (
                    <Badge variant="success" size="sm">
                      ACTIVE
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-[11px] text-text-secondary">
                  {u.case_ids.length} Case(s)
                </TableCell>
                <TableCell className="text-right space-x-2 whitespace-nowrap">
                  <Button
                    size="sm"
                    variant={isLocked ? 'primary' : 'secondary'}
                    onClick={() => handleToggleLock(u)}
                    leftIcon={isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                  >
                    {isLocked ? 'Unlock' : 'Lock Account'}
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleResetMFA(u)}
                    title="Reset MFA counters"
                    leftIcon={<KeyRound className="w-3.5 h-3.5" />}
                  >
                    Reset MFA
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Modal: Create User */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Provision ICJS Officer Account"
        subtitle="Generates cryptographically scoped credentials and default MFA session"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            label="Full Officer Name"
            value={newFullName}
            onChange={(e) => setNewFullName(e.target.value)}
            placeholder="e.g. Inspector S. Ramanujan"
            required
          />

          <Input
            label="NIC Username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="e.g. s.ramanujan"
            required
          />

          <Input
            label="Government Official Email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="s.ramanujan@delhipolice.nic.in"
            required
          />

          <div>
            <label className="text-label text-text-secondary block mb-1.5">Assigned Judicial / Police Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UserRole)}
              className="w-full bg-bg-elevated text-text-primary border border-border rounded-input text-xs p-2 outline-none"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Department / Node Branch"
            value={newDepartment}
            onChange={(e) => setNewDepartment(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Provision Credentials
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
