import 'dotenv/config';
import { connectDB, Application } from './db.js';

await connectDB();

const result = await Application.updateMany(
  { loanAmount: '5000' },
  { $set: { loanAmount: '5500' } }
);

console.log(`Updated ${result.modifiedCount} application(s) from 5000 to 5500`);
process.exit(0);
