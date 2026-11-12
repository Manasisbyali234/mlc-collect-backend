import 'dotenv/config';
import { connectDB, User } from './db.js';

async function seed() {
  await connectDB();
  await User.deleteOne({ id: 'SUB-001' });
  await User.create({
    id: 'SUB-001',
    name: 'Sub Admin',
    role: 'subadmin',
    mobile: 'SUB-001',
    branch: 'Head Office',
    password: 'subadmin123',
  });
  console.log('✅ Sub-admin created');
  console.log('   User ID  : SUB-001');
  console.log('   Password : subadmin123');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
