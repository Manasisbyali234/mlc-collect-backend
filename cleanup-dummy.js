import 'dotenv/config';
import { connectDB, Member, Application, LoanAccount, Collection, Deposit, User, Target, SanctionLetter } from './db.js';

async function cleanup() {
  await connectDB();

  // Dummy member IDs inserted by seed scripts and data.json
  const dummyMemberIds = [
    'MBR-DEMO01', 'MBR-DEMO02',                          // seed-dummy.js
    'MBR-GANG01', 'MBR-GANG02', 'MBR-GANG03', 'MBR-GANG04', // seed-gangayya.js
    'MBR-DUM001', 'MBR-DUM002', 'MBR-DUM003', 'MBR-DUM004',  // data.json
    'MBR-DUM005', 'MBR-DUM006', 'MBR-DUM007', 'MBR-DUM008',
    'MBR-60PCT', 'MBR-MSE001', 'MBR-MSE002', 'MBR-MSE003',
    'MBR-IMH7OH',
  ];

  // Dummy app IDs
  const dummyAppIds = [
    'APP-DEMO01', 'APP-DEMO02',
    'APP-GANG01', 'APP-GANG02', 'APP-GANG03', 'APP-GANG04',
    'APP-DUM001', 'APP-DUM002', 'APP-DUM003', 'APP-DUM004',
    'APP-DUM005', 'APP-DUM006', 'APP-DUM007', 'APP-DUM008',
    'APP-60PCT', 'APP-MSE001', 'APP-MSE002', 'APP-MSE003',
  ];

  // Dummy mobile numbers used in seed scripts
  const dummyMobiles = ['9876543210', '9876543211', '1111111111', '2222222222', '3333333333', '4444444444'];

  const mRes = await Member.deleteMany({ memberId: { $in: dummyMemberIds } });
  console.log(`Deleted ${mRes.deletedCount} dummy members`);

  const aRes = await Application.deleteMany({ appId: { $in: dummyAppIds } });
  console.log(`Deleted ${aRes.deletedCount} dummy applications`);

  const laRes = await LoanAccount.deleteMany({ appId: { $in: dummyAppIds } });
  console.log(`Deleted ${laRes.deletedCount} dummy loan accounts`);

  const cRes = await Collection.deleteMany({ appId: { $in: dummyAppIds } });
  console.log(`Deleted ${cRes.deletedCount} dummy collections`);

  const slRes = await SanctionLetter.deleteMany({ appId: { $in: dummyAppIds } });
  console.log(`Deleted ${slRes.deletedCount} dummy sanction letters`);

  // Remove dummy collector (gangayya) and dummy users from seed scripts
  // Preserve: admin (role=admin) and subadmin (role=subadmin)
  const uRes = await User.deleteMany({
    role: 'collector',
    $or: [
      { id: 'COL-GANG01' },
      { name: 'gangayya' },
      { id: 'COL-001' },
      { name: 'Ravi Naik' },
      { mobile: { $in: dummyMobiles } },
    ],
  });
  console.log(`Deleted ${uRes.deletedCount} dummy users`);

  // Remove dummy admin "Manjunath P" inserted via data.json (not the real admin)
  const dummyAdminRes = await User.deleteMany({ id: 'ADM-001', name: 'Manjunath P' });
  console.log(`Deleted ${dummyAdminRes.deletedCount} dummy admin record(s)`);

  console.log('\n✅ Cleanup complete. Admin and Sub-Admin accounts preserved.');

  // Verify remaining users
  const remaining = await User.find({}, { password: 0 });
  console.log('\nRemaining users:');
  remaining.forEach(u => console.log(`  [${u.role}] ${u.name} (${u.id || u.mobile})`));

  process.exit(0);
}

cleanup().catch(e => { console.error(e); process.exit(1); });
