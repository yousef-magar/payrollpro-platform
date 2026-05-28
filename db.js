// =============================================
//  PayrollPro — Database Layer (IndexedDB)
// =============================================
(function() {
  const DB_NAME = 'PayrollProDB';
  const DB_VER  = 2;
  let db;

  async function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('users')) {
          const us = d.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
          us.createIndex('username', 'username', { unique: true });
        }
        if (!d.objectStoreNames.contains('companies')) {
          d.createObjectStore('companies', { keyPath: 'userId' });
        }
        if (!d.objectStoreNames.contains('reports')) {
          const rs = d.createObjectStore('reports', { keyPath: 'id', autoIncrement: true });
          rs.createIndex('userId', 'userId');
        }
        if (!d.objectStoreNames.contains('pdfSettings')) {
          d.createObjectStore('pdfSettings', { keyPath: 'userId' });
        }
      };
      req.onsuccess = e => { db = e.target.result; resolve(db); };
      req.onerror   = e => reject(e.target.error);
    });
  }

  function tx(store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }

  function promisify(req) {
    return new Promise((res, rej) => {
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  async function hashPassword(pwd) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(pwd));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function register(username, password, email) {
    const hash = await hashPassword(password);
    const user = { username: username.trim().toLowerCase(), passwordHash: hash, email: email.trim(), createdAt: Date.now() };
    try {
      const id = await promisify(tx('users','readwrite').add(user));
      return { ok: true, user: { id, username: user.username, email: user.email } };
    } catch(e) {
      if (e.name === 'ConstraintError') return { ok: false, error: 'اسم المستخدم موجود بالفعل' };
      return { ok: false, error: e.message };
    }
  }

  async function login(username, password) {
    const hash = await hashPassword(password);
    const user = await promisify(tx('users','readonly').index('username').get(username.trim().toLowerCase()));
    if (!user) return { ok: false, error: 'اسم المستخدم غير موجود' };
    if (user.passwordHash !== hash) return { ok: false, error: 'كلمة المرور غير صحيحة' };
    const { passwordHash, ...safe } = user;
    return { ok: true, user: safe };
  }

  async function saveCompany(userId, data) {
    await promisify(tx('companies','readwrite').put({ userId, ...data }));
    return { ok: true };
  }

  async function getCompany(userId) {
    return promisify(tx('companies','readonly').get(userId));
  }

  async function savePdfSettings(userId, settings) {
    await promisify(tx('pdfSettings','readwrite').put({ userId, ...settings }));
    return { ok: true };
  }

  async function getPdfSettings(userId) {
    const s = await promisify(tx('pdfSettings','readonly').get(userId));
    return s || getDefaultPdfSettings();
  }

  function getDefaultPdfSettings() {
    return {
      orientation: 'landscape',
      fontSize: 10,
      headerFontSize: 12,
      rowHeight: 10,
      colWidths: { num:8, name:40, base:28, lateDays:18, lateDeduct:25, absentDays:18, absentDeduct:25, bonus:20, net:30 },
      headerBg: '#1e3450',
      headerColor: '#7ecfad',
      rowBg: '#162336',
      altRowBg: '#0f1923',
      textColor: '#c5dff0',
      totalRowBg: '#1a2d42',
      accentColor: '#40916c',
      showLogo: true,
      showSummary: true,
      paperSize: 'a4',
      reportMode: 'table',
      repeatHeaderPerEmployee: false,
      columnOrder: ['num','name','base','lateDays','lateDeduct','absentDays','absentDeduct','bonus','net'],
      columnLabels: {
        num:'#', name:'اسم الموظف', base:'الراتب الأساسي',
        lateDays:'أيام التأخير', lateDeduct:'خصم التأخير',
        absentDays:'أيام الغياب', absentDeduct:'خصم الغياب',
        bonus:'المكافأة', net:'الراتب الصافي'
      },
      colVisibility: {}
    };
  }

  async function saveReport(userId, report) {
    const id = await promisify(tx('reports','readwrite').add({ userId, ...report, createdAt: Date.now() }));
    return { ok: true, id };
  }

  async function getReports(userId) {
    return new Promise((res, rej) => {
      const store = tx('reports','readonly');
      const idx   = store.index('userId');
      const req   = idx.getAll(userId);
      req.onsuccess = e => res(e.target.result || []);
      req.onerror   = e => rej(e.target.error);
    });
  }

  window.DB = {
    open: openDB,
    register, login,
    saveCompany, getCompany,
    savePdfSettings, getPdfSettings, getDefaultPdfSettings,
    saveReport, getReports,
    hashPassword
  };
})();
