import 'dotenv/config';
import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import {
  Member, Application, LoanAccount, Collection,
  Deposit, User, Target, SanctionLetter, connectDB
} from './db.js';

const data = JSON.parse(readFileSync('./data.json', 'utf8'));

await connectDB();

await Member.deleteMany({});
await Application.deleteMany({});
await LoanAccount.deleteMany({});
await Collection.deleteMany({});
await Deposit.deleteMany({});
await User.deleteMany({});
await Target.deleteMany({});
await SanctionLetter.deleteMany({});

if (data.members?.length) await Member.insertMany(data.members);
if (data.applications?.length) await Application.insertMany(data.applications);
if (data.loanAccounts?.length) await LoanAccount.insertMany(data.loanAccounts);
if (data.collections?.length) await Collection.insertMany(data.collections);
if (data.deposits?.length) await Deposit.insertMany(data.deposits);
if (data.users?.length) await User.insertMany(data.users);
if (data.targets?.length) await Target.insertMany(data.targets);
if (data.sanctionLetters?.length) await SanctionLetter.insertMany(data.sanctionLetters);

console.log('Migration complete');
await mongoose.disconnect();
