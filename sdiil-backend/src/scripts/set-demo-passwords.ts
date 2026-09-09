import { supabaseAdmin } from '../lib/supabaseAdmin';

const demoUsers = [
  { email: 'officer.demo@sdiil.test', password: 'Demo@Officer123' },
  { email: 'supervisor.demo@sdiil.test', password: 'Demo@Supervisor123' },
  { email: 'admin.demo@sdiil.test', password: 'Demo@Admin123' },
  { email: 'judge.demo@sdiil.test', password: 'Demo@Judge123' },
];

async function main() {
  for (const u of demoUsers) {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const match = users.users.find(x => x.email === u.email);
    if (!match) { console.log('Not found:', u.email); continue; }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(match.id, { password: u.password });
    console.log(u.email, error ? `FAILED: ${error.message}` : 'password set');
  }
}

main();