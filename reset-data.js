import 'dotenv/config';
import { connectDB, Member, Application, LoanAccount, Collection, Deposit, User, Target, SanctionLetter } from './db.js';

async function resetAllData() {
  await connectDB();
  console.log('🔄 Starting complete data reset...\n');

  const [m, a, la, c, d, t, sl] = await Promise.all([
    Member.deleteMany({}),
    Application.deleteMany({}),
    LoanAccount.deleteMany({}),
    Collection.deleteMany({}),
    Deposit.deleteMany({}),
    Target.deleteMany({}),
    SanctionLetter.deleteMany({}),
  ]);

  console.log(`✅ Members deleted        : ${m.deletedCount}`);
  console.log(`✅ Applications deleted   : ${a.deletedCount}`);
  console.log(`✅ Loan Accounts deleted  : ${la.deletedCount}`);
  console.log(`✅ Collections deleted    : ${c.deletedCount}`);
  console.log(`✅ Deposits deleted       : ${d.deletedCount}`);
  console.log(`✅ Targets deleted        : ${t.deletedCount}`);
  console.log(`✅ Sanction Letters deleted: ${sl.deletedCount}`);

  // Delete all collector users — preserve admin and subadmin only
  const u = await User.deleteMany({ role: { $nin: ['admin', 'subadmin'] } });
  console.log(`✅ Collector users deleted: ${u.deletedCount}`);

  // Verify preserved accounts
  const preserved = await User.find({}, { password: 0 });
  console.log('\n📋 Preserved accounts:');
  preserved.forEach(u => console.log(`   [${u.role}] ${u.name} — ID: ${u.id || u.mobile}`));

  console.log('\n✅ Reset complete. All application data cleared. Login accounts preserved.');
  process.exit(0);
}

resetAllData().catch(e => { console.error('❌ Reset failed:', e.message); process.exit(1); });
