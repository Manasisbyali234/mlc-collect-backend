
/* ══════════════════════════════════════════════════════════
   REPORTS MODULE  –  added below existing routes
   ══════════════════════════════════════════════════════════ */

/* helpers shared across report endpoints */
function parseDate(s) {
  if (!s) return null;
  // handles dd/mm/yyyy, yyyy-mm-dd
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    return new Date(+y, +m - 1, +d);
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function isoDate(d) { return d ? d.toISOString().slice(0, 10) : ''; }
function inRange(dateStr, from, to) {
  const d = parseDate(dateStr);
  if (!d) return false;
  const f = new Date(from), t = new Date(to);
  f.setHours(0,0,0,0); t.setHours(23,59,59,999);
  return d >= f && d <= t;
}
function calcLoanStats(app, loanAccounts, collections) {
  const la = loanAccounts.find(l => l.appId === app.appId);
  const allCols = collections.filter(c => c.appId === app.appId || c.loanAccountId === (la && la.id));
  const totalPaid = allCols.reduce((s, c) => s + Number(c.amount || 0), 0);
  const loanAmount = Number(app.loanAmount || 0);
  const totalDue = Number(la ? la.totalDue || loanAmount : loanAmount);
  const pending = Math.max(0, totalDue - totalPaid);
  // overdue days
  let overdueDays = 0;
  if (app.status === 'Disbursed' && app.disbursalDate) {
    const tenure = Number(app.approvedTenure || app.tenure || 0);
    const start = parseDate(app.disbursalDate);
    if (start && tenure) {
      const due = new Date(start); due.setDate(due.getDate() + tenure);
      const today = new Date(); today.setHours(0,0,0,0); due.setHours(0,0,0,0);
      overdueDays = Math.max(0, Math.floor((today - due) / 86400000));
    }
  }
  const penalty = overdueDays > 0 && pending > 0 ? Math.round(pending * 0.03 * overdueDays) : 0;
  return { la, allCols, totalPaid, loanAmount, totalDue, pending, overdueDays, penalty };
}

/* ── Reports: Summary cards ── */
app.get('/api/reports/summary', (req, res) => {
  const db = getDB();
  const { applications: apps, collections, loanAccounts, members } = db;
  let totalDisbursed = 0, totalCollected = 0, totalOutstanding = 0, totalOverdue = 0;
  let paidMembers = new Set(), unpaidMembers = new Set();
  apps.filter(a => a.status === 'Disbursed').forEach(a => {
    const { totalPaid, loanAmount, pending, overdueDays } = calcLoanStats(a, loanAccounts, collections);
    totalDisbursed += loanAmount;
    totalCollected += totalPaid;
    totalOutstanding += pending;
    if (overdueDays > 0 && pending > 0) totalOverdue += pending;
    if (totalPaid > 0) paidMembers.add(a.memberId);
    else unpaidMembers.add(a.memberId);
  });
  res.json({
    totalApplications: apps.filter(a => a.status !== 'Draft').length,
    totalSanctioned: apps.filter(a => ['Sanctioned','Approved','Disbursed'].includes(a.status)).length,
    totalPendingApproval: apps.filter(a => ['Pending Admin Approval','Under Review'].includes(a.status)).length,
    totalActiveLoans: apps.filter(a => a.status === 'Disbursed').length,
    totalRejected: apps.filter(a => a.status === 'Rejected').length,
    totalDisbursed,
    totalCollected,
    totalOutstanding,
    totalOverdue,
    paidMembersCount: paidMembers.size,
    unpaidMembersCount: unpaidMembers.size,
  });
});

/* ── Reports: Daily ── */
app.get('/api/reports/daily', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required (YYYY-MM-DD)' });
  const db = getDB();
  const { applications: apps, collections, loanAccounts, members } = db;
  const rows = [];
  apps.filter(a => a.status === 'Disbursed').forEach(a => {
    const { allCols, totalPaid, loanAmount, totalDue, pending, overdueDays, penalty } = calcLoanStats(a, loanAccounts, collections);
    const todayCols = allCols.filter(c => {
      const d = parseDate(c.date || c.collectionDate);
      return d && isoDate(d) === date;
    });
    const paidToday = todayCols.reduce((s, c) => s + Number(c.amount || 0), 0);
    const member = members.find(m => m.memberId === a.memberId) || {};
    const payStatus = paidToday > 0 ? 'Paid' : overdueDays > 0 ? 'Overdue' : pending > 0 ? 'Pending' : 'Cleared';
    rows.push({
      date,
      memberName: a.memberName,
      memberId: a.memberId,
      loanId: a.loanId || a.appId,
      collectorName: a.collectorName,
      mobile: a.mobile || member.mobile || '',
      loanAmount,
      sanctionedAmount: Number(a.sanctionAmount || a.loanAmount || 0),
      paidToday,
      totalPaid,
      remaining: pending,
      paymentStatus: payStatus,
      paymentMode: todayCols.map(c => c.mode).join(', ') || '–',
      transactionRef: todayCols.map(c => c.reference || c.id).join(', ') || '–',
      dueAmount: Number(a.emi || 0),
      overdueStatus: overdueDays > 0 ? `${overdueDays} days overdue` : 'On track',
    });
  });
  res.json(rows);
});

/* ── Reports: Weekly ── */
app.get('/api/reports/weekly', (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const db = getDB();
  const { applications: apps, collections, loanAccounts, members } = db;
  // collector-wise summary
  const collectorMap = {};
  apps.filter(a => a.status === 'Disbursed').forEach(a => {
    const { allCols, totalPaid, loanAmount, pending } = calcLoanStats(a, loanAccounts, collections);
    const periodCols = allCols.filter(c => inRange(c.date || c.collectionDate, from, to));
    const periodPaid = periodCols.reduce((s, c) => s + Number(c.amount || 0), 0);
    const cid = a.collectorId || a.collectorName;
    if (!collectorMap[cid]) collectorMap[cid] = { collectorName: a.collectorName, collectorId: cid, totalLoans: 0, totalAmount: 0, collected: 0, paidMembers: 0, missedMembers: 0, outstanding: 0 };
    collectorMap[cid].totalLoans++;
    collectorMap[cid].totalAmount += loanAmount;
    collectorMap[cid].collected += periodPaid;
    collectorMap[cid].outstanding += pending;
    if (periodPaid > 0) collectorMap[cid].paidMembers++;
    else collectorMap[cid].missedMembers++;
  });
  const periodCols = collections.filter(c => inRange(c.date || c.collectionDate, from, to));
  const totalCollected = periodCols.reduce((s, c) => s + Number(c.amount || 0), 0);
  const disbursedInPeriod = apps.filter(a => inRange(a.disbursalDate, from, to));
  const sanctionedInPeriod = apps.filter(a => ['Sanctioned','Approved','Disbursed'].includes(a.status) && inRange(a.date, from, to));
  const pendingApps = apps.filter(a => ['Pending Admin Approval','Under Review'].includes(a.status));
  const paidMemberIds = new Set(periodCols.map(c => c.appId));
  const allDisbursed = apps.filter(a => a.status === 'Disbursed');
  const missedMembers = allDisbursed.filter(a => !paidMemberIds.has(a.appId));
  const totalOutstanding = allDisbursed.reduce((s, a) => {
    const { pending } = calcLoanStats(a, loanAccounts, collections);
    return s + pending;
  }, 0);
  res.json({
    from, to,
    totalLoansProcessed: disbursedInPeriod.length,
    totalSanctioned: sanctionedInPeriod.length,
    totalAmountDistributed: disbursedInPeriod.reduce((s, a) => s + Number(a.loanAmount || 0), 0),
    totalCollected,
    paidMembersCount: paidMemberIds.size,
    missedMembersCount: missedMembers.length,
    totalOutstanding,
    pendingApplications: pendingApps.length,
    collectorSummary: Object.values(collectorMap),
    paidMembers: [...paidMemberIds].map(appId => {
      const a = apps.find(x => x.appId === appId);
      const cols = periodCols.filter(c => c.appId === appId);
      return a ? { memberName: a.memberName, memberId: a.memberId, appId, collectorName: a.collectorName, amountPaid: cols.reduce((s, c) => s + Number(c.amount || 0), 0) } : null;
    }).filter(Boolean),
    missedMembersList: missedMembers.map(a => ({ memberName: a.memberName, memberId: a.memberId, appId: a.appId, collectorName: a.collectorName })),
  });
});

/* ── Reports: Monthly ── */
app.get('/api/reports/monthly', (req, res) => {
  const { year, month } = req.query; // month: 1-12
  if (!year || !month) return res.status(400).json({ error: 'year and month required' });
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(+year, +month, 0).getDate();
  const to = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;
  const db = getDB();
  const { applications: apps, collections, loanAccounts } = db;
  const periodCols = collections.filter(c => inRange(c.date || c.collectionDate, from, to));
  const totalCollected = periodCols.reduce((s, c) => s + Number(c.amount || 0), 0);
  const newApps = apps.filter(a => inRange(a.date, from, to) && a.status !== 'Draft');
  const approvedInPeriod = apps.filter(a => (a.statusHistory || []).some(h => h.status === 'Approved' && inRange(h.date, from, to)));
  const rejectedInPeriod = apps.filter(a => (a.statusHistory || []).some(h => h.status === 'Rejected' && inRange(h.date, from, to)));
  const disbursedInPeriod = apps.filter(a => inRange(a.disbursalDate, from, to));
  const allDisbursed = apps.filter(a => a.status === 'Disbursed');
  let totalOutstanding = 0, totalOverdue = 0;
  const paidSet = new Set(periodCols.map(c => c.appId));
  const collectorMap = {};
  allDisbursed.forEach(a => {
    const { totalPaid, pending, overdueDays } = calcLoanStats(a, loanAccounts, collections);
    totalOutstanding += pending;
    if (overdueDays > 0 && pending > 0) totalOverdue += pending;
    const cid = a.collectorId || a.collectorName;
    if (!collectorMap[cid]) collectorMap[cid] = { collectorName: a.collectorName, totalLoans: 0, totalAmount: 0, collected: 0, paidMembers: 0, pendingMembers: 0 };
    const periodPaid = periodCols.filter(c => c.appId === a.appId).reduce((s, c) => s + Number(c.amount || 0), 0);
    collectorMap[cid].totalLoans++;
    collectorMap[cid].totalAmount += Number(a.loanAmount || 0);
    collectorMap[cid].collected += periodPaid;
    if (paidSet.has(a.appId)) collectorMap[cid].paidMembers++;
    else collectorMap[cid].pendingMembers++;
  });
  // loan-wise payment history for the month
  const loanHistory = allDisbursed.map(a => {
    const cols = periodCols.filter(c => c.appId === a.appId);
    const { totalPaid, pending } = calcLoanStats(a, loanAccounts, collections);
    return { appId: a.appId, loanId: a.loanId || '', memberName: a.memberName, collectorName: a.collectorName, loanAmount: Number(a.loanAmount || 0), paidInMonth: cols.reduce((s, c) => s + Number(c.amount || 0), 0), totalPaid, remaining: pending, payments: cols.map(c => ({ date: c.date, amount: c.amount, mode: c.mode, ref: c.reference || '' })) };
  });
  res.json({
    year, month, from, to,
    totalNewApplications: newApps.length,
    totalApproved: approvedInPeriod.length,
    totalRejected: rejectedInPeriod.length,
    totalDisbursed: disbursedInPeriod.length,
    totalCollected,
    totalOutstanding,
    totalOverdue,
    paidMembersCount: paidSet.size,
    unpaidMembersCount: allDisbursed.length - paidSet.size,
    collectorPerformance: Object.values(collectorMap),
    loanHistory,
  });
});

/* ── Reports: Defaulters / Due ── */
app.get('/api/reports/defaulters', (req, res) => {
  const { from, to, collectorId, status: filterStatus } = req.query;
  const db = getDB();
  const { applications: apps, collections, loanAccounts, members } = db;
  const rows = [];
  apps.filter(a => a.status === 'Disbursed').forEach(a => {
    const { allCols, totalPaid, loanAmount, totalDue, pending, overdueDays, penalty } = calcLoanStats(a, loanAccounts, collections);
    const member = members.find(m => m.memberId === a.memberId) || {};
    const tenure = Number(a.approvedTenure || a.tenure || 0);
    const emi = Number(a.emi || 0);
    // due date
    let dueDate = '';
    if (a.disbursalDate && tenure) {
      const start = parseDate(a.disbursalDate);
      if (start) { const d = new Date(start); d.setDate(d.getDate() + tenure); dueDate = isoDate(d); }
    }
    // filter by date range if provided
    if (from && to && dueDate && !inRange(dueDate, from, to) && overdueDays === 0) return;
    // filter by collector
    if (collectorId && a.collectorId !== collectorId && a.collectorName !== collectorId) return;
    let payStatus = 'Cleared';
    if (pending <= 0) payStatus = 'Fully Paid';
    else if (overdueDays > 0) payStatus = 'Overdue';
    else if (totalPaid > 0 && pending > 0) payStatus = 'Partial';
    else if (totalPaid === 0) payStatus = 'Unpaid';
    else payStatus = 'Pending';
    if (filterStatus && filterStatus !== 'All' && payStatus !== filterStatus) return;
    rows.push({
      memberName: a.memberName,
      memberId: a.memberId,
      loanId: a.loanId || a.appId,
      appId: a.appId,
      mobile: a.mobile || member.mobile || '',
      collectorName: a.collectorName,
      sanctionedAmount: Number(a.sanctionAmount || a.loanAmount || 0),
      emiAmount: emi,
      dueDate,
      amountPaid: totalPaid,
      pendingAmount: pending,
      daysOverdue: overdueDays,
      penalty,
      paymentStatus: payStatus,
    });
  });
  res.json(rows);
});

/* ── Reports: Paid Members ── */
app.get('/api/reports/paid', (req, res) => {
  const { from, to, category } = req.query; // category: full|partial|all
  const db = getDB();
  const { applications: apps, collections, loanAccounts, members } = db;
  const rows = [];
  apps.filter(a => a.status === 'Disbursed').forEach(a => {
    const { allCols, totalPaid, loanAmount, totalDue, pending } = calcLoanStats(a, loanAccounts, collections);
    if (totalPaid === 0) return;
    const member = members.find(m => m.memberId === a.memberId) || {};
    const lastCol = allCols.filter(c => from && to ? inRange(c.date || c.collectionDate, from, to) : true).sort((x, y) => (parseDate(y.date) || 0) - (parseDate(x.date) || 0))[0];
    const isFullyPaid = pending <= 0;
    const cat = isFullyPaid ? 'Fully Paid' : 'Partially Paid';
    if (category && category !== 'all' && cat.toLowerCase().replace(' ','') !== category.toLowerCase()) return;
    rows.push({
      memberName: a.memberName,
      memberId: a.memberId,
      loanId: a.loanId || a.appId,
      appId: a.appId,
      collectorName: a.collectorName,
      mobile: a.mobile || member.mobile || '',
      totalLoanAmount: loanAmount,
      emiAmount: Number(a.emi || 0),
      lastPaymentDate: lastCol ? (lastCol.date || lastCol.collectionDate || '') : '',
      totalPaid,
      remaining: pending,
      paymentStatus: cat,
    });
  });
  res.json(rows);
});

/* ── Reports: Collector-wise ── */
app.get('/api/reports/collector-wise', (req, res) => {
  const { from, to } = req.query;
  const db = getDB();
  const { applications: apps, collections, loanAccounts, users } = db;
  const collectors = users.filter(u => u.role === 'collector');
  const result = collectors.map(col => {
    const colApps = apps.filter(a => a.collectorId === col.id || a.collectorName === col.name);
    const disbursedApps = colApps.filter(a => a.status === 'Disbursed');
    const periodCols = collections.filter(c => {
      const isCol = c.collectorId === col.id || c.collectorName === col.name;
      if (!isCol) return false;
      if (from && to) return inRange(c.date || c.collectionDate, from, to);
      return true;
    });
    const totalCollected = periodCols.reduce((s, c) => s + Number(c.amount || 0), 0);
    let totalOutstanding = 0;
    const paidSet = new Set(periodCols.map(c => c.appId));
    disbursedApps.forEach(a => {
      const { pending } = calcLoanStats(a, loanAccounts, collections);
      totalOutstanding += pending;
    });
    const totalLoanAmount = disbursedApps.reduce((s, a) => s + Number(a.loanAmount || 0), 0);
    const collectionPct = totalLoanAmount > 0 ? ((totalCollected / totalLoanAmount) * 100).toFixed(1) : '0.0';
    return {
      collectorId: col.id,
      collectorName: col.name,
      branch: col.branch || '',
      totalMembersAssigned: colApps.length,
      totalLoansProcessed: disbursedApps.length,
      totalLoanAmount,
      totalCollected,
      paidMembersCount: paidSet.size,
      pendingMembersCount: disbursedApps.length - paidSet.size,
      totalOutstanding,
      collectionPercentage: collectionPct,
    };
  });
  res.json(result);
});

/* ── Sanction Letters ── */
app.get('/api/sanction-letters', (req, res) => {
  const db = getDB();
  if (!db.sanctionLetters) db.sanctionLetters = [];
  // auto-generate missing letters for sanctioned/approved/disbursed apps
  const eligible = db.applications.filter(a => ['Sanctioned','Approved','Disbursed'].includes(a.status) && a.sanctionAmount);
  eligible.forEach(a => {
    const exists = db.sanctionLetters.find(l => l.appId === a.appId);
    if (!exists) {
      const letterNo = 'SL-' + new Date().getFullYear() + '-' + Math.random().toString(36).slice(2,8).toUpperCase();
      const sanctionDate = (a.statusHistory || []).find(h => h.status === 'Sanctioned')?.date || a.date;
      db.sanctionLetters.push({
        id: genId('SLT'),
        letterNo,
        appId: a.appId,
        loanId: a.loanId || '',
        memberId: a.memberId,
        memberName: a.memberName,
        mobile: a.mobile,
        loanType: a.loanType,
        approvedAmount: Number(a.sanctionAmount || a.loanAmount),
        netDisbursalAmount: Number(a.netDisbursalAmount || a.sanctionAmount || a.loanAmount),
        interestRate: Number(a.confirmedRate || a.rate),
        tenure: Number(a.approvedTenure || a.tenure),
        emiAmount: Number(a.emi || 0),
        disbursalDate: a.disbursalDate || '',
        sanctionDate,
        collectorName: a.collectorName,
        status: 'Generated',
        deliveryMethod: '',
        sentDate: '',
        receivedStatus: 'Pending Delivery',
        receivedDate: '',
        remarks: '',
        history: [{ action: 'Generated', date: new Date().toLocaleString('en-IN'), by: 'System' }],
        generatedAt: new Date().toISOString(),
      });
    }
  });
  saveDB(db);
  res.json(db.sanctionLetters);
});

app.get('/api/sanction-letters/:id', (req, res) => {
  const db = getDB();
  if (!db.sanctionLetters) return res.status(404).json({ error: 'Not found' });
  const letter = db.sanctionLetters.find(l => l.id === req.params.id);
  if (!letter) return res.status(404).json({ error: 'Not found' });
  const app2 = db.applications.find(a => a.appId === letter.appId);
  const member = db.members.find(m => m.memberId === letter.memberId);
  res.json({ ...letter, app: app2 || {}, member: member || {} });
});

app.patch('/api/sanction-letters/:id', (req, res) => {
  const db = getDB();
  if (!db.sanctionLetters) return res.status(404).json({ error: 'Not found' });
  const idx = db.sanctionLetters.findIndex(l => l.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  const prev = db.sanctionLetters[idx];
  const updated = { ...prev, ...req.body, history: [...(prev.history || []), { action: 'Updated', date: new Date().toLocaleString('en-IN'), by: 'Admin', changes: req.body }] };
  db.sanctionLetters[idx] = updated;
  saveDB(db);
  res.json(updated);
});

app.post('/api/sanction-letters/:id/regenerate', (req, res) => {
  const db = getDB();
  if (!db.sanctionLetters) return res.status(404).json({ error: 'Not found' });
  const idx = db.sanctionLetters.findIndex(l => l.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  const prev = db.sanctionLetters[idx];
  const a = db.applications.find(x => x.appId === prev.appId);
  if (!a) return res.status(404).json({ error: 'Application not found' });
  const updated = {
    ...prev,
    approvedAmount: Number(a.sanctionAmount || a.loanAmount),
    netDisbursalAmount: Number(a.netDisbursalAmount || a.sanctionAmount || a.loanAmount),
    interestRate: Number(a.confirmedRate || a.rate),
    tenure: Number(a.approvedTenure || a.tenure),
    emiAmount: Number(a.emi || 0),
    disbursalDate: a.disbursalDate || prev.disbursalDate,
    regeneratedAt: new Date().toISOString(),
    history: [...(prev.history || []), { action: 'Regenerated', date: new Date().toLocaleString('en-IN'), by: 'Admin' }],
  };
  db.sanctionLetters[idx] = updated;
  saveDB(db);
  res.json(updated);
});
