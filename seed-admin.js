import 'dotenv/config';
import { connectDB, User } from './db.js';

async function seed() {
  await connectDB();

  // Remove any existing admin records first
  await User.deleteMany({ role: 'admin' });

  await User.create({
    id: 'ADM-001',
    name: 'Admin',
    role: 'admin',
    mobile: 'ADM-001',
    branch: 'Head Office',
    password: process.env.ADMIN_PASSWORD || 'Admin@123',
  });

  console.log('✅ Admin account created');
  console.log('   User ID  : ADM-001');
  console.log('   Password : (from .env ADMIN_PASSWORD)');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
