import 'dotenv/config';
import { connectDB, Member, Application, LoanAccount, Collection, SanctionLetter } from './db.js';

const MEMBER_ID = 'MBR-ZF7FTZ';

async function deleteMember() {
  await connectDB();

  const member = await Member.findOne({ memberId: MEMBER_ID });
  if (!member) { console.log('Member not found:', MEMBER_ID); process.exit(0); }

  const apps = await Application.find({ memberId: MEMBER_ID });
  const appIds = apps.map(a => a.appId);

  const [la, col, sl, m] = await Promise.all([
    LoanAccount.deleteMany({ appId: { $in: appIds } }),
    Collection.deleteMany({ appId: { $in: appIds } }),
    SanctionLetter.deleteMany({ memberId: MEMBER_ID }),
    Member.deleteOne({ memberId: MEMBER_ID }),
  ]);
  const a = await Application.deleteMany({ memberId: MEMBER_ID });

  console.log('Deleted:', {
    member: m.deletedCount,
    applications: a.deletedCount,
    loanAccounts: la.deletedCount,
    collections: col.deletedCount,
    sanctionLetters: sl.deletedCount,
  });
  process.exit(0);
}

deleteMember().catch(err => { console.error(err); process.exit(1); });
