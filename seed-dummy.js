import 'dotenv/config';
import { connectDB, Member, Application } from './db.js';

// A tiny 1x1 red pixel PNG as base64 — acts as a placeholder "photo"
const DUMMY_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';

// A tiny 2x1 blue pixel PNG for shop image
const DUMMY_SHOP  = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVQI12NgYGD4DwABBAEAcHMnkgAAAABJRU5ErkJggg==';

async function seed() {
  await connectDB();

  // Remove previous dummy data if re-running
  await Member.deleteOne({ mobile: '9876543210' });
  await Application.deleteMany({ mobile: { $in: ['9876543210', '9876543211'] } });
  await Member.deleteOne({ mobile: '9876543211' });

  const member = await Member.create({
    memberId: 'MBR-DEMO01',
    name: 'Ramesh Kumar',
    mobile: '9876543210',
    altMobile: '9123456780',
    dob: '15/06/1985',
    gender: 'Male',
    aadhaar: '1234 5678 9012',
    pan: 'ABCDE1234F',
    occupation: 'Vegetable Vendor',
    address: '12, Gandhi Nagar, Near Bus Stand',
    village: 'Shirpur',
    district: 'Dhule',
    state: 'Maharashtra',
    pin: '425405',
    nomName: 'Sunita Kumar',
    nomRel: 'Wife',
    nomMobile: '9000011111',
    nomAddress: 'Same as above',
    photo: DUMMY_PHOTO,
    shopImage: DUMMY_SHOP,
  });

  const today = new Date().toLocaleDateString('en-IN');

  await Application.create({
    appId: 'APP-DEMO01',
    memberId: member.memberId,
    memberName: member.name,
    mobile: member.mobile,
    loanType: 'Business Loan',
    loanAmount: '15000',
    tenure: '55',
    rate: '10',
    interest: '2260',
    total: '17260',
    emi: '314',
    purpose: 'Stock purchase for vegetable business',
    status: 'Pending Admin Approval',
    collectorId: 'COL-DEMO',
    collectorName: 'Demo Collector',
    date: today,
    bank: {
      holderName: 'Ramesh Kumar',
      bankName: 'State Bank of India',
      branch: 'Shirpur',
      accNo: '31234567890',
      ifsc: 'SBIN0001234',
      accType: 'Savings',
      upi: 'ramesh@upi',
    },
    statusHistory: [{ status: 'Pending Admin Approval', date: today, by: 'Demo Collector' }],
  });

  // Second dummy member with 5000 loan pending admin approval
  const member2 = await Member.create({
    memberId: 'MBR-DEMO02',
    name: 'Priya Sharma',
    mobile: '9876543211',
    altMobile: '9123456781',
    dob: '22/03/1990',
    gender: 'Female',
    aadhaar: '9876 5432 1098',
    pan: 'PQRST5678G',
    occupation: 'Tailor',
    address: '45, Nehru Road, Near Market',
    village: 'Shirpur',
    district: 'Dhule',
    state: 'Maharashtra',
    pin: '425405',
    nomName: 'Rajesh Sharma',
    nomRel: 'Husband',
    nomMobile: '9000022222',
    nomAddress: 'Same as above',
    photo: DUMMY_PHOTO,
    shopImage: DUMMY_SHOP,
  });

  await Application.create({
    appId: 'APP-DEMO02',
    memberId: member2.memberId,
    memberName: member2.name,
    mobile: member2.mobile,
    loanType: 'Business Loan',
    loanAmount: '5000',
    tenure: '50',
    rate: '10',
    interest: '750',
    total: '5750',
    emi: '115',
    purpose: 'Sewing machine purchase',
    status: 'Pending Admin Approval',
    collectorId: 'COL-DEMO',
    collectorName: 'Demo Collector',
    date: today,
    bank: {
      holderName: 'Priya Sharma',
      bankName: 'Bank of Maharashtra',
      branch: 'Shirpur',
      accNo: '41234567890',
      ifsc: 'MAHB0001234',
      accType: 'Savings',
      upi: 'priya@upi',
    },
    statusHistory: [{ status: 'Pending Admin Approval', date: today, by: 'Demo Collector' }],
  });

  console.log('✅ Dummy member + loan application inserted.');
  console.log('   Member ID : MBR-DEMO01');
  console.log('   App ID    : APP-DEMO01');
  console.log('   Status    : Pending Admin Approval');
  console.log('   Member ID : MBR-DEMO02');
  console.log('   App ID    : APP-DEMO02  (₹5000 — Pending Admin Approval)');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
