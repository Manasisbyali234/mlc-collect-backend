import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { connectDB, Member, Application, LoanAccount, Collection, Deposit, User, Target, SanctionLetter } from './db.js';

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

app.get('/', (req, res) => res.json({ status: 'MLC Backend is running' }));

function genId(prefix) {
  return prefix + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

const otpStore = {};

/* ── Auth ── */
app.post('/api/login', async (req, res) => {
  const mobile = (req.body.mobile || '').replace(/\s+/g, '');
  const { password } = req.body;
  const user = await User.findOne({ $or: [{ mobile }, { id: mobile }], password });
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  const { password: _, ...safe } = user.toObject();
  res.json(safe);
});

app.post('/api/otp/send', async (req, res) => {
  const mobile = (req.body.mobile || '').replace(/\s+/g, '');
  // auto-create collector if not exists
  let user = await User.findOne({ mobile, role: 'collector' });
  if (!user) {
    user = await User.create({ id: genId('USR'), name: mobile, mobile, role: 'collector', password: '' });
  }
  const otp = '123456'; // dummy OTP for demo
  otpStore[mobile] = { otp, expires: Date.now() + 30 * 60 * 1000 };
  res.json({ message: 'OTP sent', otp });
});

app.post('/api/otp/verify', (req, res) => {
  const mobile = (req.body.mobile || '').replace(/\s+/g, '');
  const { otp } = req.body;
  const entry = otpStore[mobile];
  if (!entry || entry.otp !== otp || Date.now() > entry.expires)
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  res.json({ ok: true });
});

app.post('/api/set-password', async (req, res) => {
  const mobile = (req.body.mobile || '').replace(/\s+/g, '');
  const { otp, password } = req.body;
  const entry = otpStore[mobile];
  if (!entry || entry.otp !== otp || Date.now() > entry.expires)
    return res.status(400).json({ error: 'OTP expired, please retry' });
  const user = await User.findOneAndUpdate({ mobile }, { password }, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found' });
  delete otpStore[mobile];
  const { password: _, ...safe } = user.toObject();
  res.json(safe);
});

/* ── Members ── */
app.get('/api/members', async (req, res) => {
  const { collectorId } = req.query;
  if (!collectorId) return res.json(await Member.find());
  const user = await User.findOne({ $or: [{ id: collectorId }, { mobile: collectorId }] });
  const filter = user
    ? { $or: [{ collectorId: user.id }, { collectorId: user.mobile }, { collectorName: user.name }] }
    : { $or: [{ collectorId }, { collectorName: collectorId }] };
  const apps = await Application.find(filter);
  const memberIds = [...new Set(apps.map(a => a.memberId))];
  res.json(await Member.find({ memberId: { $in: memberIds } }));
});

app.get('/api/members/:id', async (req, res) => {
  const m = await Member.findOne({ memberId: req.params.id });
  if (!m) return res.status(404).json({ error: 'Not found' });
  res.json(m);
});

app.get('/api/members/:id/loans', async (req, res) => {
  const apps = await Application.find({ memberId: req.params.id });
  const collections = await Collection.find({ appId: { $in: apps.map(a => a.appId) } });
  const loanAccounts = await LoanAccount.find({ appId: { $in: apps.map(a => a.appId) } });
  const loans = apps.map(a => {
    const la = loanAccounts.find(l => l.appId === a.appId);
    const cols = collections.filter(c => c.appId === a.appId || c.loanAccountId === (la && la.id));
    const totalPaid = cols.reduce((s, c) => s + Number(c.amount || 0), 0);
    const loanAmount = Number(a.loanAmount || 0);
    const totalDue = Number(la ? la.totalDue || loanAmount : loanAmount);
    const pending = Math.max(0, totalDue - totalPaid);
    return { appId: a.appId, loanId: a.loanId || '', loanType: a.loanType, loanAmount, status: a.status, date: a.date, disbursalDate: a.disbursalDate || '', totalPaid, pending };
  });
  const totalLoanAmount = loans.reduce((s, l) => s + l.loanAmount, 0);
  const totalPaidAll = loans.reduce((s, l) => s + l.totalPaid, 0);
  res.json({ loans, count: loans.length, totalLoanAmount, totalPaidAll });
});

app.get('/api/members/:id/loans', async (req, res) => {
  const apps = await Application.find({ memberId: req.params.id });
  const collections = await Collection.find({ appId: { $in: apps.map(a => a.appId) } });
  const loanAccounts = await LoanAccount.find({ appId: { $in: apps.map(a => a.appId) } });
  const loans = apps.map(a => {
    const la = loanAccounts.find(l => l.appId === a.appId);
    const cols = collections.filter(c => c.appId === a.appId || c.loanAccountId === (la && la.id));
    const totalPaid = cols.reduce((s, c) => s + Number(c.amount || 0), 0);
    const loanAmount = Number(a.loanAmount || 0);
    const totalDue = Number(la ? la.totalDue || loanAmount : loanAmount);
    const pending = Math.max(0, totalDue - totalPaid);
    return { appId: a.appId, loanId: a.loanId || '', loanType: a.loanType, loanAmount, status: a.status, date: a.date, disbursalDate: a.disbursalDate || '', totalPaid, pending };
  });
  const totalLoanAmount = loans.reduce((s, l) => s + l.loanAmount, 0);
  const totalPaidAll = loans.reduce((s, l) => s + l.totalPaid, 0);
  res.json({ loans, count: loans.length, totalLoanAmount, totalPaidAll });
});

app.post('/api/members', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'shopImage', maxCount: 1 }]), async (req, res) => {
  const body = req.body;
  const orClauses = [];
  if (body.aadhaar) orClauses.push({ aadhaar: body.aadhaar });
  if (body.mobile) orClauses.push({ mobile: body.mobile });
  if (orClauses.length) {
    const dup = await Member.findOne({ $or: orClauses });
    if (dup) return res.status(409).json({ error: 'Member already registered with this Aadhaar/mobile' });
  }
  const extra = {};
  if (req.files?.photo?.[0]) extra.photo = `data:${req.files.photo[0].mimetype};base64,${req.files.photo[0].buffer.toString('base64')}`;
  if (req.files?.shopImage?.[0]) extra.shopImage = `data:${req.files.shopImage[0].mimetype};base64,${req.files.shopImage[0].buffer.toString('base64')}`;
  const member = await Member.create({ ...body, ...extra, memberId: genId('MBR') });
  res.status(201).json(member);
});

/* ── Loan Applications ── */
app.get('/api/applications', async (req, res) => {
  const { collectorId } = req.query;
  if (!collectorId) return res.json(await Application.find());
  const user = await User.findOne({ $or: [{ id: collectorId }, { mobile: collectorId }] });
  const filter = user
    ? { $or: [{ collectorId: user.id }, { collectorId: user.mobile }, { collectorName: user.name }] }
    : { $or: [{ collectorId }, { collectorName: collectorId }] };
  res.json(await Application.find(filter));
});

app.get('/api/applications/:id', async (req, res) => {
  const a = await Application.findOne({ appId: req.params.id });
  if (!a) return res.status(404).json({ error: 'Not found' });
  const loanAccount = await LoanAccount.findOne({ appId: req.params.id });
  const collections = await Collection.find({
    $or: [{ appId: req.params.id }, { loanAccountId: loanAccount?.id }]
  });
  const totalPaid = collections.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const loanAmount = Number(a.loanAmount || a.amount || 0);
  const totalDue = Number(loanAccount ? loanAccount.totalDue || loanAmount : loanAmount);
  const pending = Math.max(0, totalDue - totalPaid);
  const penalty = calcPenalty(a, loanAccount, pending, collections);
  const schedule = buildSchedule(a, collections);
  const missedStreak = calcMissedStreak(schedule);
  const npa = missedStreak > 10;
  res.json({ ...a.toObject(), totalPaid, pending, penalty, totalPayable: pending + penalty, dailyEmi: DAILY_EMI, schedule, missedStreak, npa });
});

app.post('/api/applications', async (req, res) => {
  const appId = req.body.appId || genId('APP');
  const existing = await Application.findOne({ appId });
  const isDraft = req.body.status === 'Draft';
  if (!isDraft && !existing && req.body.memberId) {
    const activeLoan = await Application.findOne({ memberId: req.body.memberId, status: 'Disbursed' });
    if (activeLoan) {
      const la = await LoanAccount.findOne({ appId: activeLoan.appId });
      const totalDue = Number(la ? la.totalDue || activeLoan.loanAmount : activeLoan.loanAmount);
      const cols = await Collection.find({ $or: [{ appId: activeLoan.appId }, { loanAccountId: la?.id }] });
      const paid = cols.reduce((s, c) => s + (Number(c.amount) || 0), 0);
      const paidPct = totalDue > 0 ? (paid / totalDue) * 100 : 0;
      if (paidPct < 50) return res.status(400).json({ error: `Cannot apply for a new loan. Active loan (${activeLoan.appId}) is only ${paidPct.toFixed(1)}% repaid.` });
    }
  }
  const record = existing
    ? await Application.findOneAndUpdate({ appId }, { ...req.body, appId }, { new: true })
    : await Application.create({ ...req.body, appId });
  res.status(201).json(record);
});

app.patch('/api/applications/:id', async (req, res) => {
  const updated = await Application.findOneAndUpdate({ appId: req.params.id }, req.body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

/* Auto-flag NPA: disbursed loans with >10 consecutive missed EMIs */
app.post('/api/applications/auto-npa', async (req, res) => {
  const apps = await Application.find({ status: 'Disbursed' });
  const flagged = [];
  for (const a of apps) {
    const loanAccount = await LoanAccount.findOne({ appId: a.appId });
    const collections = await Collection.find({ $or: [{ appId: a.appId }, { loanAccountId: loanAccount?.id }] });
    const schedule = buildSchedule(a, collections);
    const streak = calcMissedStreak(schedule);
    if (streak > 10) {
      await Application.findOneAndUpdate({ appId: a.appId }, {
        status: 'NPA',
        npaDate: new Date().toLocaleDateString('en-IN'),
        missedStreak: streak,
        $push: { statusHistory: { status: 'NPA', date: new Date().toLocaleString(), by: 'System (Auto)' } },
      });
      flagged.push(a.appId);
    }
  }
  res.json({ flagged, count: flagged.length });
});

/* ── Loan Accounts ── */
app.get('/api/loan-accounts', async (req, res) => {
  const { collectorId } = req.query;
  if (!collectorId) return res.json(await LoanAccount.find());
  const user = await User.findOne({ $or: [{ id: collectorId }, { mobile: collectorId }] });
  const filter = user
    ? { $or: [{ collectorId: user.id }, { collectorId: user.mobile }, { collectorName: user.name }] }
    : { $or: [{ collectorId }, { collectorName: collectorId }] };
  const apps = await Application.find(filter);
  const appIds = apps.map(a => a.appId);
  res.json(await LoanAccount.find({ appId: { $in: appIds } }));
});

app.post('/api/loan-accounts', async (req, res) => {
  const account = await LoanAccount.create({ ...req.body, id: genId('MCS') });
  res.status(201).json(account);
});

/* ── Collections ── */
app.get('/api/collections', async (req, res) => {
  const { collectorId, date } = req.query;
  const filter = {};
  if (collectorId) {
    const user = await User.findOne({ $or: [{ id: collectorId }, { mobile: collectorId }] });
    filter.$or = user
      ? [{ collectorId: user.id }, { collectorId: user.mobile }, { collectorName: user.name }]
      : [{ collectorId }, { collectorName: collectorId }];
  }
  if (date) filter.date = date;
  res.json(await Collection.find(filter));
});

app.post('/api/collections', upload.single('photo'), async (req, res) => {
  const body = req.body;
  let photoData = null;
  if (req.file) photoData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  let location = null;
  if (body.location) { try { location = JSON.parse(body.location); } catch {} }
  const record = await Collection.create({ ...body, id: genId('COL'), ...(photoData && { photo: photoData }), ...(location && { location }) });
  res.status(201).json(record);
});

/* ── Deposits ── */
app.get('/api/deposits', async (req, res) => res.json(await Deposit.find()));

app.post('/api/deposits', upload.single('photo'), async (req, res) => {
  const body = req.body;
  let photoData = null;
  if (req.file) {
    photoData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  }
  let location = null;
  if (body.location) { try { location = JSON.parse(body.location); } catch {} }
  const deposit = await Deposit.create({
    ...body,
    id: genId('DEP'),
    status: 'To verify',
    ...(photoData && { photo: photoData }),
    ...(location && { location }),
  });
  res.status(201).json(deposit);
});

app.patch('/api/deposits/:id', async (req, res) => {
  const updated = await Deposit.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

/* ── Users ── */
app.get('/api/users', async (req, res) => {
  const users = await User.find();
  res.json(users.map(u => { const { password: _, ...safe } = u.toObject(); return safe; }));
});

app.post('/api/users', async (req, res) => {
  const user = await User.create({ ...req.body, id: genId('USR') });
  const { password: _, ...safe } = user.toObject();
  res.status(201).json(safe);
});

/* ── Targets ── */
app.get('/api/targets', async (req, res) => res.json(await Target.find()));

app.post('/api/targets', async (req, res) => {
  const existing = await Target.findOne({ collectorId: req.body.collectorId });
  if (existing) {
    const updated = await Target.findOneAndUpdate({ collectorId: req.body.collectorId }, req.body, { new: true });
    return res.json(updated);
  }
  const target = await Target.create({ ...req.body, id: genId('TGT') });
  res.status(201).json(target);
});

app.patch('/api/targets/:id', async (req, res) => {
  const updated = await Target.findOneAndUpdate({ id: req.params.id }, req.body, { new: true });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  res.json(updated);
});

/* ── Borrower Portal ── */
app.post('/api/borrower/login', async (req, res) => {
  const { appId, mobile } = req.body;
  if (!appId || !mobile) return res.status(400).json({ error: 'Application ID and mobile are required' });
  const application = await Application.findOne({ appId });
  if (!application) return res.status(404).json({ error: 'Application ID not found' });
  const member = await Member.findOne({ memberId: application.memberId });
  if (!member || (member.mobile || '').replace(/\s+/g, '') !== (mobile || '').replace(/\s+/g, ''))
    return res.status(401).json({ error: 'Mobile number does not match this application' });
  res.json({ appId: application.appId, name: member.name, mobile: member.mobile, memberId: member.memberId });
});

const DAILY_EMI = 100;

function parseIndianDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  return parts.length === 3
    ? new Date(+parts[2], +parts[1] - 1, +parts[0])
    : new Date(dateStr);
}

function toDateKey(date) { return date.toISOString().slice(0, 10); }

function buildSchedule(app, collections) {
  if (app.status !== 'Disbursed' || !app.disbursalDate) return [];
  const tenure = Number(app.approvedTenure || app.tenure || 0);
  if (!tenure) return [];
  const start = parseIndianDate(app.disbursalDate);
  if (!start) return [];
  const paidByDate = {};
  collections.forEach(c => {
    const key = c.collectionDate || c.date;
    paidByDate[key] = (paidByDate[key] || 0) + Number(c.amount || 0);
  });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Array.from({ length: tenure }, (_, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const key = toDateKey(d);
    const paid = paidByDate[key] || 0;
    return { day: i + 1, date: key, due: DAILY_EMI, paid, status: paid >= DAILY_EMI ? 'Paid' : d <= today ? 'Missed' : 'Upcoming' };
  });
}

function calcPenalty(app, loanAccount, pending, collections) {
  if (pending <= 0 || app.status !== 'Disbursed') return 0;
  const tenure = Number(app.approvedTenure || app.tenure || 0);
  if (!tenure || !app.disbursalDate) return 0;
  const dueDate = parseIndianDate(app.disbursalDate);
  if (!dueDate) return 0;
  dueDate.setDate(dueDate.getDate() + tenure);
  const today = new Date(); today.setHours(0, 0, 0, 0); dueDate.setHours(0, 0, 0, 0);
  const overdueDays = Math.max(0, Math.floor((today - dueDate) / 86400000));
  return overdueDays === 0 ? 0 : Math.round(pending * 0.03 * overdueDays);
}

function calcMissedStreak(schedule) {
  // Returns the current consecutive missed days streak (from today backwards)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const past = schedule.filter(s => s.status === 'Missed' || s.status === 'Paid');
  let streak = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    if (past[i].status === 'Missed') streak++;
    else break;
  }
  return streak;
}

app.get('/api/borrower/dashboard/:appId', async (req, res) => {
  const a = await Application.findOne({ appId: req.params.appId });
  if (!a) return res.status(404).json({ error: 'Not found' });
  const member = await Member.findOne({ memberId: a.memberId });
  const loanAccount = await LoanAccount.findOne({ appId: req.params.appId });
  const collections = await Collection.find({ $or: [{ appId: req.params.appId }, { loanAccountId: loanAccount?.id }] });
  const totalPaid = collections.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const loanAmount = Number(a.loanAmount || a.amount || 0);
  const totalDue = Number(loanAccount ? loanAccount.totalDue || loanAmount : loanAmount);
  const pending = Math.max(0, totalDue - totalPaid);
  const penalty = calcPenalty(a, loanAccount, pending, collections);
  const schedule = buildSchedule(a, collections);
  const missedDays = schedule.filter(s => s.status === 'Missed').length;
  const todayKey = toDateKey(new Date());
  res.json({
    appId: a.appId, status: a.status, loanAmount, netDisbursalAmount: Number(a.netDisbursalAmount || 0) || null,
    totalDue, totalPaid, pending, penalty,
    totalPayable: pending + penalty, dailyEmi: DAILY_EMI, missedDays,
    todayDue: schedule.find(s => s.date === todayKey) || null,
    memberName: member?.name || '', mobile: member?.mobile || '',
    collections: collections.map(c => ({ id: c.id, date: c.date, collectionDate: c.collectionDate, amount: c.amount, mode: c.mode, reference: c.reference, photo: c.photo, location: c.location })),
    schedule, loanAccount: loanAccount || null,
  });
});

/* ── Dashboard stats ── */
app.get('/api/dashboard', async (req, res) => {
  const { collectorId } = req.query;
  const appFilter = collectorId ? { collectorId } : {};
  const colFilter = collectorId ? { collectorId } : {};
  const [apps, members, collections, deposits, loanAccounts, users] = await Promise.all([
    Application.find(appFilter), Member.find(), Collection.find(colFilter), Deposit.find(), LoanAccount.find(), User.find()
  ]);
  const memberIds = collectorId ? [...new Set(apps.map(a => a.memberId))] : null;
  res.json({
    totalMembers: collectorId ? memberIds.length : members.length,
    totalApplications: apps.length,
    pendingApproval: apps.filter(a => a.status === 'Pending Admin Approval').length,
    approved: apps.filter(a => a.status === 'Approved').length,
    disbursed: apps.filter(a => a.status === 'Disbursed').length,
    totalCollected: collections.reduce((s, c) => s + (Number(c.amount) || 0), 0),
    pendingDeposits: deposits.filter(d => d.status === 'To verify').length,
    totalCollectors: users.filter(u => u.role === 'collector').length,
    totalLoanAccounts: loanAccounts.length,
    totalNPA: apps.filter(a => a.status === 'NPA').length,
  });
});

/* ── Reports helpers ── */
function rParseDate(s) {
  if (!s) return null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d, m, y] = s.split('/'); return new Date(+y, +m - 1, +d); }
  const d = new Date(s); return isNaN(d) ? null : d;
}
function rIso(d) { return d ? d.toISOString().slice(0, 10) : ''; }
function rInRange(dateStr, from, to) {
  const d = rParseDate(dateStr); if (!d) return false;
  const f = new Date(from), t = new Date(to); f.setHours(0, 0, 0, 0); t.setHours(23, 59, 59, 999);
  return d >= f && d <= t;
}
function rLoanStats(a, loanAccounts, collections) {
  const la = loanAccounts.find(l => l.appId === a.appId);
  const allCols = collections.filter(c => c.appId === a.appId || c.loanAccountId === (la && la.id));
  const totalPaid = allCols.reduce((s, c) => s + Number(c.amount || 0), 0);
  const loanAmount = Number(a.loanAmount || 0);
  const totalDue = Number(la ? la.totalDue || loanAmount : loanAmount);
  const pending = Math.max(0, totalDue - totalPaid);
  let overdueDays = 0;
  if (a.status === 'Disbursed' && a.disbursalDate) {
    const tenure = Number(a.approvedTenure || a.tenure || 0);
    const start = rParseDate(a.disbursalDate);
    if (start && tenure) { const due = new Date(start); due.setDate(due.getDate() + tenure); const today = new Date(); today.setHours(0, 0, 0, 0); due.setHours(0, 0, 0, 0); overdueDays = Math.max(0, Math.floor((today - due) / 86400000)); }
  }
  const penalty = overdueDays > 0 && pending > 0 ? Math.round(pending * 0.03 * overdueDays) : 0;
  return { la, allCols, totalPaid, loanAmount, totalDue, pending, overdueDays, penalty };
}

app.get('/api/reports/summary', async (req, res) => {
  const [apps, collections, loanAccounts] = await Promise.all([Application.find(), Collection.find(), LoanAccount.find()]);
  let totalDisbursed = 0, totalCollected = 0, totalOutstanding = 0, totalOverdue = 0;
  const paidM = new Set(), unpaidM = new Set();
  apps.filter(a => a.status === 'Disbursed').forEach(a => {
    const { totalPaid, loanAmount, pending, overdueDays } = rLoanStats(a, loanAccounts, collections);
    totalDisbursed += loanAmount; totalCollected += totalPaid; totalOutstanding += pending;
    if (overdueDays > 0 && pending > 0) totalOverdue += pending;
    if (totalPaid > 0) paidM.add(a.memberId); else unpaidM.add(a.memberId);
  });
  res.json({
    totalApplications: apps.filter(a => a.status !== 'Draft').length,
    totalSanctioned: apps.filter(a => ['Sanctioned', 'Approved', 'Disbursed'].includes(a.status)).length,
    totalPendingApproval: apps.filter(a => ['Pending Admin Approval', 'Under Review'].includes(a.status)).length,
    totalActiveLoans: apps.filter(a => a.status === 'Disbursed').length,
    totalRejected: apps.filter(a => a.status === 'Rejected').length,
    totalDisbursed, totalCollected, totalOutstanding, totalOverdue,
    paidMembersCount: paidM.size, unpaidMembersCount: unpaidM.size,
  });
});

app.get('/api/reports/daily', async (req, res) => {
  const { date } = req.query; if (!date) return res.status(400).json({ error: 'date required' });
  const [apps, collections, loanAccounts, members] = await Promise.all([Application.find(), Collection.find(), LoanAccount.find(), Member.find()]);
  const rows = apps.filter(a => a.status === 'Disbursed').map(a => {
    const { allCols, totalPaid, loanAmount, pending, overdueDays } = rLoanStats(a, loanAccounts, collections);
    const todayCols = allCols.filter(c => { const d = rParseDate(c.date || c.collectionDate); return d && rIso(d) === date; });
    const paidToday = todayCols.reduce((s, c) => s + Number(c.amount || 0), 0);
    const member = members.find(m => m.memberId === a.memberId) || {};
    const payStatus = paidToday > 0 ? 'Paid' : overdueDays > 0 ? 'Overdue' : pending > 0 ? 'Pending' : 'Cleared';
    return { date, memberName: a.memberName, memberId: a.memberId, loanId: a.loanId || a.appId, collectorName: a.collectorName, mobile: a.mobile || member.mobile || '', loanAmount, sanctionedAmount: Number(a.sanctionAmount || a.loanAmount || 0), paidToday, totalPaid, remaining: pending, paymentStatus: payStatus, paymentMode: todayCols.map(c => c.mode).join(', ') || '–', transactionRef: todayCols.map(c => c.reference || c.id).join(', ') || '–', dueAmount: Number(a.emi || 0), overdueStatus: overdueDays > 0 ? `${overdueDays} days overdue` : 'On track' };
  });
  res.json(rows);
});

app.get('/api/reports/weekly', async (req, res) => {
  const { from, to } = req.query; if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const [apps, collections, loanAccounts] = await Promise.all([Application.find(), Collection.find(), LoanAccount.find()]);
  const periodCols = collections.filter(c => rInRange(c.date || c.collectionDate, from, to));
  const totalCollected = periodCols.reduce((s, c) => s + Number(c.amount || 0), 0);
  const allDisbursed = apps.filter(a => a.status === 'Disbursed');
  const paidSet = new Set(periodCols.map(c => c.appId));
  const missedMembers = allDisbursed.filter(a => !paidSet.has(a.appId));
  const totalOutstanding = allDisbursed.reduce((s, a) => s + rLoanStats(a, loanAccounts, collections).pending, 0);
  const collectorMap = {};
  allDisbursed.forEach(a => {
    const { loanAmount, pending } = rLoanStats(a, loanAccounts, collections);
    const periodPaid = periodCols.filter(c => c.appId === a.appId).reduce((s, c) => s + Number(c.amount || 0), 0);
    const cid = a.collectorId || a.collectorName;
    if (!collectorMap[cid]) collectorMap[cid] = { collectorName: a.collectorName, totalLoans: 0, totalAmount: 0, collected: 0, paidMembers: 0, missedMembers: 0, outstanding: 0 };
    collectorMap[cid].totalLoans++; collectorMap[cid].totalAmount += loanAmount; collectorMap[cid].collected += periodPaid; collectorMap[cid].outstanding += pending;
    if (paidSet.has(a.appId)) collectorMap[cid].paidMembers++; else collectorMap[cid].missedMembers++;
  });
  res.json({ from, to, totalLoansProcessed: apps.filter(a => rInRange(a.disbursalDate, from, to)).length, totalSanctioned: apps.filter(a => ['Sanctioned', 'Approved', 'Disbursed'].includes(a.status) && rInRange(a.date, from, to)).length, totalAmountDistributed: apps.filter(a => rInRange(a.disbursalDate, from, to)).reduce((s, a) => s + Number(a.loanAmount || 0), 0), totalCollected, totalOutstanding, paidMembersCount: paidSet.size, missedMembersCount: missedMembers.length, pendingApplications: apps.filter(a => ['Pending Admin Approval', 'Under Review'].includes(a.status)).length, collectorSummary: Object.values(collectorMap), paidMembers: [...paidSet].map(appId => { const a = apps.find(x => x.appId === appId); const cols = periodCols.filter(c => c.appId === appId); return a ? { memberName: a.memberName, memberId: a.memberId, appId, collectorName: a.collectorName, amountPaid: cols.reduce((s, c) => s + Number(c.amount || 0), 0) } : null; }).filter(Boolean), missedMembersList: missedMembers.map(a => ({ memberName: a.memberName, memberId: a.memberId, appId: a.appId, collectorName: a.collectorName })) });
});

app.get('/api/reports/monthly', async (req, res) => {
  const { year, month } = req.query; if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(+year, +month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
  const [apps, collections, loanAccounts] = await Promise.all([Application.find(), Collection.find(), LoanAccount.find()]);
  const periodCols = collections.filter(c => rInRange(c.date || c.collectionDate, from, to));
  const totalCollected = periodCols.reduce((s, c) => s + Number(c.amount || 0), 0);
  const allDisbursed = apps.filter(a => a.status === 'Disbursed');
  const paidSet = new Set(periodCols.map(c => c.appId));
  let totalOutstanding = 0, totalOverdue = 0;
  const collectorMap = {};
  allDisbursed.forEach(a => {
    const { pending, overdueDays, loanAmount } = rLoanStats(a, loanAccounts, collections);
    totalOutstanding += pending; if (overdueDays > 0 && pending > 0) totalOverdue += pending;
    const cid = a.collectorId || a.collectorName;
    if (!collectorMap[cid]) collectorMap[cid] = { collectorName: a.collectorName, totalLoans: 0, totalAmount: 0, collected: 0, paidMembers: 0, pendingMembers: 0 };
    const pp = periodCols.filter(c => c.appId === a.appId).reduce((s, c) => s + Number(c.amount || 0), 0);
    collectorMap[cid].totalLoans++; collectorMap[cid].totalAmount += loanAmount; collectorMap[cid].collected += pp;
    if (paidSet.has(a.appId)) collectorMap[cid].paidMembers++; else collectorMap[cid].pendingMembers++;
  });
  const loanHistory = allDisbursed.map(a => { const cols = periodCols.filter(c => c.appId === a.appId); const { totalPaid, pending } = rLoanStats(a, loanAccounts, collections); return { appId: a.appId, loanId: a.loanId || '', memberName: a.memberName, collectorName: a.collectorName, loanAmount: Number(a.loanAmount || 0), paidInMonth: cols.reduce((s, c) => s + Number(c.amount || 0), 0), totalPaid, remaining: pending, payments: cols.map(c => ({ date: c.date, amount: c.amount, mode: c.mode, ref: c.reference || '' })) }; });
  res.json({ year, month, from, to, totalNewApplications: apps.filter(a => rInRange(a.date, from, to) && a.status !== 'Draft').length, totalApproved: apps.filter(a => (a.statusHistory || []).some(h => h.status === 'Approved' && rInRange(h.date, from, to))).length, totalRejected: apps.filter(a => (a.statusHistory || []).some(h => h.status === 'Rejected' && rInRange(h.date, from, to))).length, totalDisbursed: apps.filter(a => rInRange(a.disbursalDate, from, to)).length, totalCollected, totalOutstanding, totalOverdue, paidMembersCount: paidSet.size, unpaidMembersCount: allDisbursed.length - paidSet.size, collectorPerformance: Object.values(collectorMap), loanHistory });
});

app.get('/api/reports/defaulters', async (req, res) => {
  const { from, to, collectorId, status: fs } = req.query;
  const [apps, collections, loanAccounts, members] = await Promise.all([Application.find(), Collection.find(), LoanAccount.find(), Member.find()]);
  const rows = [];
  apps.filter(a => a.status === 'Disbursed').forEach(a => {
    const { allCols, totalPaid, pending, overdueDays, penalty } = rLoanStats(a, loanAccounts, collections);
    const member = members.find(m => m.memberId === a.memberId) || {};
    const tenure = Number(a.approvedTenure || a.tenure || 0);
    let dueDate = '';
    if (a.disbursalDate && tenure) { const start = rParseDate(a.disbursalDate); if (start) { const d = new Date(start); d.setDate(d.getDate() + tenure); dueDate = rIso(d); } }
    if (collectorId && a.collectorId !== collectorId && a.collectorName !== collectorId) return;
    const payStatus = pending <= 0 ? 'Fully Paid' : overdueDays > 0 ? 'Overdue' : totalPaid > 0 ? 'Partial' : totalPaid === 0 ? 'Unpaid' : 'Pending';
    if (fs && fs !== 'All' && payStatus !== fs) return;
    rows.push({ memberName: a.memberName, memberId: a.memberId, loanId: a.loanId || a.appId, appId: a.appId, mobile: a.mobile || member.mobile || '', collectorName: a.collectorName, sanctionedAmount: Number(a.sanctionAmount || a.loanAmount || 0), emiAmount: Number(a.emi || 0), dueDate, amountPaid: totalPaid, pendingAmount: pending, daysOverdue: overdueDays, penalty, paymentStatus: payStatus });
  });
  res.json(rows);
});

app.get('/api/reports/paid', async (req, res) => {
  const { from, to, category } = req.query;
  const [apps, collections, loanAccounts, members] = await Promise.all([Application.find(), Collection.find(), LoanAccount.find(), Member.find()]);
  const rows = [];
  apps.filter(a => a.status === 'Disbursed').forEach(a => {
    const { allCols, totalPaid, loanAmount, pending } = rLoanStats(a, loanAccounts, collections);
    if (totalPaid === 0) return;
    const member = members.find(m => m.memberId === a.memberId) || {};
    const filteredCols = from && to ? allCols.filter(c => rInRange(c.date || c.collectionDate, from, to)) : allCols;
    const lastCol = [...filteredCols].sort((x, y) => (rParseDate(y.date) || 0) - (rParseDate(x.date) || 0))[0];
    const cat = pending <= 0 ? 'Fully Paid' : 'Partially Paid';
    if (category && category !== 'all' && cat.toLowerCase().replace(' ', '') !== category.toLowerCase()) return;
    rows.push({ memberName: a.memberName, memberId: a.memberId, loanId: a.loanId || a.appId, appId: a.appId, collectorName: a.collectorName, mobile: a.mobile || member.mobile || '', totalLoanAmount: loanAmount, emiAmount: Number(a.emi || 0), lastPaymentDate: lastCol ? (lastCol.date || lastCol.collectionDate || '') : '', totalPaid, remaining: pending, paymentStatus: cat });
  });
  res.json(rows);
});

app.get('/api/reports/closing', async (req, res) => {
  const { from, to, collectorId } = req.query;
  const [apps, collections, loanAccounts, members] = await Promise.all([Application.find(), Collection.find(), LoanAccount.find(), Member.find()]);
  const rows = [];
  apps.filter(a => a.status === 'Disbursed').forEach(a => {
    const { allCols, totalPaid, loanAmount, pending } = rLoanStats(a, loanAccounts, collections);
    if (pending > 0) return;
    if (collectorId && a.collectorId !== collectorId && a.collectorName !== collectorId) return;
    const member = members.find(m => m.memberId === a.memberId) || {};
    const lastCol = [...allCols].sort((x, y) => (rParseDate(y.date || y.collectionDate) || 0) - (rParseDate(x.date || x.collectionDate) || 0))[0];
    const closeDate = lastCol ? (lastCol.date || lastCol.collectionDate || '') : '';
    if (from && to && closeDate && !rInRange(closeDate, from, to)) return;
    rows.push({ loanId: a.loanId || a.appId, appId: a.appId, memberName: a.memberName, memberId: a.memberId, mobile: a.mobile || member.mobile || '', collectorName: a.collectorName, loanType: a.loanType || '', loanAmount, totalPaid, disbursalDate: a.disbursalDate || '', closeDate, status: 'Closed' });
  });
  res.json(rows);
});


app.get('/api/reports/collector-performance', async (req, res) => {
  const { from, to } = req.query;
  const [apps, collections, loanAccounts, users] = await Promise.all([Application.find(), Collection.find(), LoanAccount.find(), User.find()]);
  const result = users.filter(u => u.role === 'collector').map(col => {
    const colApps = apps.filter(a => a.collectorId === col.id || a.collectorName === col.name);
    const disbursed = colApps.filter(a => a.status === 'Disbursed');
    const periodCols = collections.filter(c => { const isCol = c.collectorId === col.id || c.collectorName === col.name; return isCol && (from && to ? rInRange(c.date || c.collectionDate, from, to) : true); });
    const totalCollected = periodCols.reduce((s, c) => s + Number(c.amount || 0), 0);
    const paidSet = new Set(periodCols.map(c => c.appId));
    const totalOutstanding = disbursed.reduce((s, a) => s + rLoanStats(a, loanAccounts, collections).pending, 0);
    const totalLoanAmount = disbursed.reduce((s, a) => s + Number(a.loanAmount || 0), 0);
    return { collectorId: col.id, collectorName: col.name, branch: col.branch || '', totalMembersAssigned: colApps.length, totalLoansProcessed: disbursed.length, totalLoanAmount, totalCollected, paidMembersCount: paidSet.size, pendingMembersCount: disbursed.length - paidSet.size, totalOutstanding, collectionPercentage: totalLoanAmount > 0 ? ((totalCollected / totalLoanAmount) * 100).toFixed(1) : '0.0' };
  });
  res.json(result);
});

/* ── Sanction Letters ── */
app.get('/api/sanction-letters', async (req, res) => {
  const apps = await Application.find();
  const existing = await SanctionLetter.find();
  const existingIds = new Set(existing.map(l => l.appId));
  const toCreate = apps.filter(a => ['Sanctioned', 'Approved', 'Disbursed'].includes(a.status) && a.sanctionAmount && !existingIds.has(a.appId));
  if (toCreate.length) {
    await SanctionLetter.insertMany(toCreate.map(a => {
      const sanctionDate = (a.statusHistory || []).find(h => h.status === 'Sanctioned')?.date || a.date;
      return { id: genId('SLT'), letterNo: 'SL-' + new Date().getFullYear() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase(), appId: a.appId, loanId: a.loanId || '', memberId: a.memberId, memberName: a.memberName, mobile: a.mobile, loanType: a.loanType, approvedAmount: Number(a.sanctionAmount || a.loanAmount), netDisbursalAmount: Number(a.netDisbursalAmount || a.sanctionAmount || a.loanAmount), interestRate: Number(a.confirmedRate || a.rate), tenure: Number(a.approvedTenure || a.tenure), emiAmount: Number(a.emi || 0), disbursalDate: a.disbursalDate || '', sanctionDate, collectorName: a.collectorName, status: 'Generated', deliveryMethod: '', sentDate: '', receivedStatus: 'Pending Delivery', receivedDate: '', remarks: '', history: [{ action: 'Generated', date: new Date().toLocaleString('en-IN'), by: 'System' }], generatedAt: new Date().toISOString() };
    }));
  }
  res.json(await SanctionLetter.find());
});

app.get('/api/sanction-letters/:id', async (req, res) => {
  const letter = await SanctionLetter.findOne({ id: req.params.id });
  if (!letter) return res.status(404).json({ error: 'Not found' });
  const [appRec, member] = await Promise.all([Application.findOne({ appId: letter.appId }), Member.findOne({ memberId: letter.memberId })]);
  res.json({ ...letter.toObject(), app: appRec || {}, member: member || {} });
});

app.patch('/api/sanction-letters/:id', async (req, res) => {
  const prev = await SanctionLetter.findOne({ id: req.params.id });
  if (!prev) return res.status(404).json({ error: 'Not found' });
  const updated = await SanctionLetter.findOneAndUpdate({ id: req.params.id }, { ...req.body, history: [...(prev.history || []), { action: 'Updated', date: new Date().toLocaleString('en-IN'), by: 'Admin', changes: req.body }] }, { new: true });
  res.json(updated);
});

app.post('/api/sanction-letters/:id/regenerate', async (req, res) => {
  const prev = await SanctionLetter.findOne({ id: req.params.id });
  if (!prev) return res.status(404).json({ error: 'Not found' });
  const a = await Application.findOne({ appId: prev.appId });
  if (!a) return res.status(404).json({ error: 'Application not found' });
  const updated = await SanctionLetter.findOneAndUpdate({ id: req.params.id }, { approvedAmount: Number(a.sanctionAmount || a.loanAmount), netDisbursalAmount: Number(a.netDisbursalAmount || a.sanctionAmount || a.loanAmount), interestRate: Number(a.confirmedRate || a.rate), tenure: Number(a.approvedTenure || a.tenure), emiAmount: Number(a.emi || 0), disbursalDate: a.disbursalDate || prev.disbursalDate, regeneratedAt: new Date().toISOString(), history: [...(prev.history || []), { action: 'Regenerated', date: new Date().toLocaleString('en-IN'), by: 'Admin' }] }, { new: true });
  res.json(updated);
});

const PORT = process.env.PORT || 5000;
connectDB()
  .then(() => app.listen(PORT, () => console.log(`MLC backend running on http://localhost:${PORT}`)))
  .catch(err => { console.error('Failed to connect to DB:', err.message); process.exit(1); });
