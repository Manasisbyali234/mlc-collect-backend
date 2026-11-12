import 'dotenv/config';
import { connectDB, User, Member, Application } from './db.js';

const DUMMY_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==';
const DUMMY_SHOP  = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVQI12NgYGD4DwABBAEAcHMnkgAAAABJRU5ErkJggg==';

async function seed() {
  await connectDB();

  // Create collector gangayya
  await User.deleteOne({ name: 'gangayya' });
  const collector = await User.create({
    id: 'COL-GANG01',
    name: 'gangayya',
    role: 'collector',
    mobile: '0000000001',
    branch: 'Head Office',
    password: '112233',
  });
  console.log('✅ Collector created');
  console.log('   Name     : gangayya');
  console.log('   Password : 112233');

  const today = new Date().toLocaleDateString('en-IN');

  const dummies = [
    { memberId: 'MBR-GANG01', name: 'Suresh Patil',   mobile: '1111111111', aadhaar: '1111 2222 3333', appId: 'APP-GANG01', loanAmount: '5000', purpose: 'Shop renovation' },
    { memberId: 'MBR-GANG02', name: 'Kavita Rao',     mobile: '2222222222', aadhaar: '2222 3333 4444', appId: 'APP-GANG02', loanAmount: '5000', purpose: 'Medical expenses' },
    { memberId: 'MBR-GANG03', name: 'Mahesh Jadhav',  mobile: '3333333333', aadhaar: '3333 4444 5555', appId: 'APP-GANG03', loanAmount: '5000', purpose: 'Agriculture tools' },
    { memberId: 'MBR-GANG04', name: 'Laxmi Desai',    mobile: '4444444444', aadhaar: '4444 5555 6666', appId: 'APP-GANG04', loanAmount: '5000', purpose: 'Dairy business' },
  ];

  for (const d of dummies) {
    await Member.deleteOne({ memberId: d.memberId });
    await Application.deleteOne({ appId: d.appId });

    await Member.create({
      memberId: d.memberId,
      name: d.name,
      mobile: d.mobile,
      dob: '01/01/1990',
      gender: 'Male',
      aadhaar: d.aadhaar,
      pan: 'DUMMY0000Z',
      occupation: 'Business',
      address: 'Dummy Address',
      village: 'Shirpur',
      district: 'Dhule',
      state: 'Maharashtra',
      pin: '425405',
      nomName: 'Nominee Name',
      nomRel: 'Spouse',
      nomMobile: '9999999999',
      nomAddress: 'Same as above',
      photo: DUMMY_PHOTO,
      shopImage: DUMMY_SHOP,
    });

    await Application.create({
      appId: d.appId,
      memberId: d.memberId,
      memberName: d.name,
      mobile: d.mobile,
      loanType: 'Business Loan',
      loanAmount: d.loanAmount,
      tenure: '50',
      rate: '10',
      purpose: d.purpose,
      status: 'Pending Admin Approval',
      collectorId: collector.id,
      collectorName: collector.name,
      date: today,
      statusHistory: [{ status: 'Pending Admin Approval', date: today, by: collector.name }],
    });

    console.log(`   Member: ${d.name} (${d.memberId}) — App: ${d.appId}`);
  }

  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
