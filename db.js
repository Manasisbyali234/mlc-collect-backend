import mongoose from 'mongoose';
import 'dotenv/config';

export async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB Atlas connected');
}

const anyObj = { type: mongoose.Schema.Types.Mixed };

export const Member = mongoose.model('Member', new mongoose.Schema({
  memberId: String, name: String, mobile: String, altMobile: String,
  dob: String, gender: String, aadhaar: String, pan: String,
  occupation: String, address: String, village: String, district: String,
  state: String, pin: String, nomName: String, nomRel: String,
  nomMobile: String, nomAddress: String,
}, { strict: false }));

export const Application = mongoose.model('Application', new mongoose.Schema({
  appId: String, memberId: String, memberName: String, mobile: String,
  loanType: String, loanAmount: String, tenure: String, rate: String,
  status: String, collectorId: String, collectorName: String,
  disbursalDate: String, date: String,
}, { strict: false }));

export const LoanAccount = mongoose.model('LoanAccount', new mongoose.Schema({
  id: String, appId: String, totalDue: Number,
}, { strict: false }));

export const Collection = mongoose.model('Collection', new mongoose.Schema({
  id: String, appId: String, loanAccountId: String, collectorId: String,
  collectorName: String, memberName: String, amount: mongoose.Schema.Types.Mixed,
  mode: String, reference: String, date: String, collectionDate: String,
}, { strict: false }));

export const Deposit = mongoose.model('Deposit', new mongoose.Schema({
  id: String, status: String,
}, { strict: false }));

export const User = mongoose.model('User', new mongoose.Schema({
  id: String, name: String, role: String, mobile: String,
  branch: String, password: String,
}, { strict: false }));

export const Target = mongoose.model('Target', new mongoose.Schema({
  id: String,
}, { strict: false }));

export const SanctionLetter = mongoose.model('SanctionLetter', new mongoose.Schema({
  id: String, appId: String, memberId: String,
}, { strict: false }));
