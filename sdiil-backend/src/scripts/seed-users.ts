import { supabaseAdmin } from '../lib/supabaseAdmin.js';

interface UserToSeed {
  email: string;
  password: string;
  name: string;
  role: string;
  caseNumbers: string[];
  totpSecret: string;
}

const DEMO_USERS_TO_SEED: UserToSeed[] = [
  {
    email: 'admin.demo@sdiil.test',
    password: 'Demo@Admin123',
    name: 'System Administrator',
    role: 'ADMIN',
    caseNumbers: ['MH-PN-2026-0142', 'MH-PN-2026-0198', 'MH-PN-2026-0210'],
    totpSecret: 'CBMDMYG5WT7W2GQXWOUXNG7MECH3LBIE',
  },
  {
    email: 'supervisor.demo@sdiil.test',
    password: 'Demo@Supervisor123',
    name: 'SP Sunita Sharma',
    role: 'SUPERVISOR',
    caseNumbers: ['MH-PN-2026-0142', 'MH-PN-2026-0198', 'MH-PN-2026-0210'],
    totpSecret: 'IAXTAQNCSNTOPVELUP3B4Y24JONHWALA',
  },
  {
    email: 'officer.demo@sdiil.test',
    password: 'Demo@Officer123',
    name: 'Insp. Vikram Rathore',
    role: 'INVESTIGATOR',
    caseNumbers: ['MH-PN-2026-0142', 'MH-PN-2026-0198'],
    totpSecret: 'XXK4LHEU7K3XEOGWJ6TLIDYLWEWWQEQQ',
  },
  {
    email: 'prosecutor.demo@sdiil.test',
    password: 'Demo@Prosecutor123',
    name: 'Adv. Meera Sen',
    role: 'PROSECUTOR',
    caseNumbers: ['MH-PN-2026-0142'],
    totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  },
  {
    email: 'judge.demo@sdiil.test',
    password: 'Demo@Judge123',
    name: 'Hon. Justice Rajesh Verma',
    role: 'JUDGE',
    caseNumbers: ['MH-PN-2026-0198', 'MH-PN-2026-0210'],
    totpSecret: 'OA5BNS6MDGW4TN5F4Q7ZV2KW6K5EAR3D',
  },
  {
    email: 'forensic.demo@sdiil.test',
    password: 'Demo@Forensic123',
    name: 'Dr. Subhash Bose',
    role: 'FORENSIC_OFFICER',
    caseNumbers: ['MH-PN-2026-0142', 'MH-PN-2026-0198'],
    totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  },
  {
    email: 'registrar.demo@sdiil.test',
    password: 'Demo@Registrar123',
    name: 'Sh. Alok Mathur',
    role: 'COURT_REGISTRAR',
    caseNumbers: ['MH-PN-2026-0142', 'MH-PN-2026-0210'],
    totpSecret: 'MZXW6YTBOIXW6YTBOIWW6YTBOI======',
  },
];

async function main() {
  console.log('=== Step 1: Normalizing all existing profiles to UPPERCASE roles ===');
  const { data: allProfiles } = await supabaseAdmin.from('profiles').select('id, role, name');
  for (const p of allProfiles || []) {
    if (p.role && p.role !== p.role.toUpperCase()) {
      await supabaseAdmin.from('profiles').update({ role: p.role.toUpperCase() }).eq('id', p.id);
      console.log(`  Normalized profile ${p.name} role: "${p.role}" -> "${p.role.toUpperCase()}"`);
    }
  }

  console.log('\n=== Step 2: Fetching cases from database ===');
  const { data: cases, error: casesErr } = await supabaseAdmin.from('cases').select('id, case_number, title');
  if (casesErr || !cases) {
    throw new Error(`Failed to load cases: ${casesErr?.message}`);
  }
  const caseMap = new Map<string, string>();
  for (const c of cases) {
    caseMap.set(c.case_number, c.id);
    console.log(`  Case: ${c.case_number} => ${c.id} (${c.title})`);
  }

  console.log('\n=== Step 3: Provisioning and updating demo users ===');
  const { data: userList } = await supabaseAdmin.auth.admin.listUsers();
  const existingUsers = userList?.users || [];

  for (const u of DEMO_USERS_TO_SEED) {
    let userId: string;
    const existing = existingUsers.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());

    if (existing) {
      userId = existing.id;
      // Update password & confirm email
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: u.password,
        email_confirm: true,
        user_metadata: { name: u.name, role: u.role },
      });
      console.log(`  Updated existing auth user: ${u.email} (ID: ${userId})`);
    } else {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { name: u.name, role: u.role },
      });
      if (created.error || !created.data?.user) {
        console.error(`  Failed to create user ${u.email}:`, created.error?.message);
        continue;
      }
      userId = created.data.user.id;
      console.log(`  Created new auth user: ${u.email} (ID: ${userId})`);
    }

    // Upsert profile
    const { error: profErr } = await supabaseAdmin.from('profiles').upsert({
      id: userId,
      name: u.name,
      role: u.role,
      is_locked: false,
    });
    if (profErr) {
      console.error(`  Profile upsert error for ${u.email}:`, profErr.message);
    } else {
      console.log(`  Profile upserted: ${u.name} [${u.role}]`);
    }

    // Assign to cases
    for (const cn of u.caseNumbers) {
      const caseUuid = caseMap.get(cn);
      if (!caseUuid) {
        console.warn(`  Case ${cn} not found in database`);
        continue;
      }

      // Check existing assignment
      const { data: existingAssign } = await supabaseAdmin
        .from('case_assignments')
        .select('id')
        .eq('case_id', caseUuid)
        .eq('user_id', userId)
        .maybeSingle();

      if (!existingAssign) {
        const { error: assignErr } = await supabaseAdmin.from('case_assignments').insert({
          case_id: caseUuid,
          user_id: userId,
          role_in_case: u.role.toLowerCase(),
        });
        if (assignErr) {
          console.error(`    Assignment error for ${u.email} to ${cn}:`, assignErr.message);
        } else {
          console.log(`    Assigned to ${cn}`);
        }
      } else {
        console.log(`    Already assigned to ${cn}`);
      }
    }
  }

  console.log('\n=== Step 4: Verification of seeded accounts ===');
  const { data: finalProfiles } = await supabaseAdmin.from('profiles').select('id, name, role, is_locked');
  const { data: finalAssignments } = await supabaseAdmin
    .from('case_assignments')
    .select('user_id, case_id, cases(case_number), profiles(name, role)');

  for (const u of DEMO_USERS_TO_SEED) {
    const prof = finalProfiles?.find((p: any) => p.name === u.name);
    const assigns = (finalAssignments || [])
      .filter((a: any) => a.user_id === prof?.id)
      .map((a: any) => a.cases?.case_number)
      .join(', ');
    console.log(`✓ ${u.email.padEnd(28)} | ${u.password.padEnd(18)} | ${prof?.role.padEnd(16)} | Cases: [${assigns}]`);
  }
}

main().catch(console.error);
