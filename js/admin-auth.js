// Cockpit accompagnement (enseignant)
// - Liste des élèves depuis BDD_ELEVES (classe + accCode)
// - Autorisation d'accès via RTDB: accompagnement/autorisations/{accCode}
// - Scan QR + journal validations: accompagnement/validations
// - Export des codes ACC par classe (sans correspondance nominative)

(function () {
  const DB_ROOT = 'accompagnement';
  const REF_ELEVES = `${DB_ROOT}/eleves`;
  const REF_AUTORISATIONS = `${DB_ROOT}/autorisations`;
  const REF_VALIDATIONS = `${DB_ROOT}/validations`;
  const REF_HORAIRES_GLOBAL = `${DB_ROOT}/config/horaires_global`;

  // Codes de déverrouillage obfusqués (CPS2026, PROFPSE, INVITE)
  const UNLOCK_CODES_B64 = ['Q1BTMjAyNg==', 'UFJPRlBTRQ==', 'SU5WSVRF'];
  const SESSION_UNLOCK_KEY = 'cockpit_teacher_unlock';
  const ROSTER_LOCAL_KEY = 'cockpit_private_roster_v1';

  const elListe = document.getElementById('liste-eleves');
  const elClasseFilter = document.getElementById('classe-filter');
  const elCount = document.getElementById('table-count');
  const elDetailSection = document.getElementById('sec-eleve');
  const elNomEleve = document.getElementById('nom-eleve');
  const elDetailEleve = document.getElementById('detail-eleve');
  const elListeValidations = document.getElementById('liste-validations');
  const elExportButtons = document.getElementById('class-export-buttons');
  const elExportOutput = document.getElementById('export-output');
  const elCopyStatus = document.getElementById('copy-status');
  const elUnlockStatus = document.getElementById('unlock-status');
  const elTeacherCode = document.getElementById('teacher-code');
  const btnSpecialProfpse = document.getElementById('btn-special-profpse');
  const btnSpecialInvite = document.getElementById('btn-special-invite');
  const elStatusSpecialProfpse = document.getElementById('status-special-profpse');
  const elStatusSpecialInvite = document.getElementById('status-special-invite');
  const btnUnlock = document.getElementById('btn-unlock');
  const btnResetFilter = document.getElementById('btn-reset-filter');
  const btnCopyExport = document.getElementById('btn-copy-export');
  const elRosterFile = document.getElementById('roster-file');
  const btnImportRoster = document.getElementById('btn-import-roster');
  const btnClearRoster = document.getElementById('btn-clear-roster');
  const elRosterStatus = document.getElementById('roster-status');
  const elSpecialLabel = document.getElementById('special-label');
  const elSpecialCode = document.getElementById('special-code');
  const btnGenerateSpecial = document.getElementById('btn-generate-special');
  const btnCreateSpecial = document.getElementById('btn-create-special');
  const elSpecialCodesList = document.getElementById('special-codes-list');
  const elSpecialCreateStatus = document.getElementById('special-create-status');
  const elGlobalScheduleBody = document.getElementById('global-schedule-body');
  const elCodeScheduleBody = document.getElementById('code-schedule-body');
  const btnLoadGlobalSchedule = document.getElementById('btn-load-global-schedule');
  const btnSaveGlobalSchedule = document.getElementById('btn-save-global-schedule');
  const btnClearGlobalSchedule = document.getElementById('btn-clear-global-schedule');
  const elGlobalScheduleStatus = document.getElementById('status-global-schedule');
  const elScheduleCode = document.getElementById('schedule-code');
  const btnUseSelectedCode = document.getElementById('btn-use-selected-code');
  const btnLoadCodeSchedule = document.getElementById('btn-load-code-schedule');
  const btnSaveCodeSchedule = document.getElementById('btn-save-code-schedule');
  const btnClearCodeSchedule = document.getElementById('btn-clear-code-schedule');
  const elCodeScheduleStatus = document.getElementById('status-code-schedule');

  if (typeof firebase === 'undefined' || !firebase.apps?.length) {
    console.error('Firebase non initialise');
    return;
  }

  const bdd = Array.isArray(window.BDD_ELEVES) ? window.BDD_ELEVES.slice() : [];
  const byAcc = new Map();
  bdd.forEach((e) => {
    const acc = safeUpper(e.accCode || '');
    if (acc) byAcc.set(acc, e);
  });

  let autorisationsCache = {}; // { [accCode]: {autorise: true} }
  let elevesCache = {}; // { [accCode]: {...eleveData} }
  let localRosterByAcc = {}; // { [accCode]: { classe, prenom, nom } }
  let selectedAccCode = null;
  let unlocked = sessionStorage.getItem(SESSION_UNLOCK_KEY) === '1';
  let ensuringSpecialDefaults = false;
  let specialDefaultsReady = false;
  let lastScanText = '';
  let lastScanAt = 0;

  const SPECIAL_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const SPECIAL_CODE_DIGITS = '23456789';
  const RESERVED_SPECIAL_CODES = new Set(['PROFPSE', 'INVITE']);
  const SCAN_DUPLICATE_COOLDOWN_MS = 3000;
  const SCHEDULE_DAYS = [
    { key: 'lundi', label: 'Lundi' },
    { key: 'mardi', label: 'Mardi' },
    { key: 'mercredi', label: 'Mercredi' },
    { key: 'jeudi', label: 'Jeudi' },
    { key: 'vendredi', label: 'Vendredi' },
    { key: 'samedi', label: 'Samedi' },
    { key: 'dimanche', label: 'Dimanche' },
  ];

  function safeUpper(v) {
    return String(v || '').trim().toUpperCase();
  }

  function normalizeCode(v) {
    return String(v || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .trim();
  }

  function escapeHtml(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setSpecialCreateStatus(message, type) {
    if (!elSpecialCreateStatus) return;
    elSpecialCreateStatus.textContent = message || '';
    elSpecialCreateStatus.classList.remove('ok', 'err');
    if (type === 'ok') elSpecialCreateStatus.classList.add('ok');
    if (type === 'err') elSpecialCreateStatus.classList.add('err');
  }

  function setStatus(el, message, type) {
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('ok', 'err');
    if (type === 'ok') el.classList.add('ok');
    if (type === 'err') el.classList.add('err');
  }

  function setGlobalScheduleStatus(message, type) {
    setStatus(elGlobalScheduleStatus, message, type);
  }

  function setCodeScheduleStatus(message, type) {
    setStatus(elCodeScheduleStatus, message, type);
  }

  function normalizeTime(v, fallback) {
    const s = String(v || '').trim();
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(s) ? s : fallback;
  }

  function timeToMinutes(v) {
    const [h, m] = String(v || '00:00')
      .split(':')
      .map((x) => Number(x));
    return h * 60 + m;
  }

  function defaultScheduleTemplate() {
    const base = {};
    SCHEDULE_DAYS.forEach((d) => {
      base[d.key] = { actif: true, debut: '00:00', fin: '23:59' };
    });
    return base;
  }

  function normalizeSchedule(raw) {
    const base = defaultScheduleTemplate();
    if (!raw || typeof raw !== 'object') return base;
    SCHEDULE_DAYS.forEach((d) => {
      const current = raw[d.key] || {};
      base[d.key] = {
        actif: current.actif === true,
        debut: normalizeTime(current.debut, '00:00'),
        fin: normalizeTime(current.fin, '23:59'),
      };
    });
    return base;
  }

  function renderScheduleTable(bodyEl, scheduleObj) {
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    SCHEDULE_DAYS.forEach((d) => {
      const day = scheduleObj[d.key] || { actif: true, debut: '00:00', fin: '23:59' };
      const tr = document.createElement('tr');
      tr.dataset.day = d.key;
      tr.innerHTML = `
        <td>${escapeHtml(d.label)}</td>
        <td><input type="checkbox" class="schedule-active" ${day.actif ? 'checked' : ''}></td>
        <td><input type="time" class="input schedule-time schedule-start" value="${escapeHtml(day.debut)}"></td>
        <td><input type="time" class="input schedule-time schedule-end" value="${escapeHtml(day.fin)}"></td>
      `;
      bodyEl.appendChild(tr);
    });
  }

  function collectScheduleTable(bodyEl) {
    const out = {};
    if (!bodyEl) return out;
    bodyEl.querySelectorAll('tr[data-day]').forEach((tr) => {
      const day = tr.dataset.day;
      if (!day) return;
      const active = !!tr.querySelector('.schedule-active')?.checked;
      const debut = normalizeTime(tr.querySelector('.schedule-start')?.value, '00:00');
      const fin = normalizeTime(tr.querySelector('.schedule-end')?.value, '23:59');
      out[day] = { actif: active, debut, fin };
    });
    return out;
  }

  function validateSchedule(horaires) {
    for (let i = 0; i < SCHEDULE_DAYS.length; i += 1) {
      const day = SCHEDULE_DAYS[i];
      const slot = horaires[day.key];
      if (!slot || slot.actif !== true) continue;
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(slot.debut) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(slot.fin)) {
        return `Format horaire invalide pour ${day.label}.`;
      }
      if (timeToMinutes(slot.fin) <= timeToMinutes(slot.debut)) {
        return `La fin doit être après le début pour ${day.label}.`;
      }
    }
    return '';
  }

  function syncScheduleWriteState() {
    if (btnSaveGlobalSchedule) btnSaveGlobalSchedule.disabled = !unlocked;
    if (btnClearGlobalSchedule) btnClearGlobalSchedule.disabled = !unlocked;
    if (btnSaveCodeSchedule) btnSaveCodeSchedule.disabled = !unlocked;
    if (btnClearCodeSchedule) btnClearCodeSchedule.disabled = !unlocked;
  }

  function isStudentCode(code) {
    return byAcc.has(safeUpper(code));
  }

  function isSpecialEntry(code, data) {
    const c = safeUpper(code);
    if (RESERVED_SPECIAL_CODES.has(c)) return true;
    return !!(data && data.special === true);
  }

  function getSpecialLabel(code, data) {
    if (data && data.label) return String(data.label);
    if (code === 'PROFPSE') return 'Accès personnel enseignant';
    if (code === 'INVITE') return 'Accès invité';
    return 'Code spécial';
  }

  function generateSpecialCodeCandidate(length = 6) {
    let code = '';
    for (let i = 0; i < length; i += 1) {
      if (i % 2 === 0) {
        code += SPECIAL_CODE_LETTERS[Math.floor(Math.random() * SPECIAL_CODE_LETTERS.length)];
      } else {
        code += SPECIAL_CODE_DIGITS[Math.floor(Math.random() * SPECIAL_CODE_DIGITS.length)];
      }
    }
    return code;
  }

  function nextAvailableSpecialCode() {
    for (let i = 0; i < 800; i += 1) {
      const candidate = generateSpecialCodeCandidate(6);
      if (isStudentCode(candidate)) continue;
      if (autorisationsCache[candidate]) continue;
      return candidate;
    }
    return '';
  }

  function normalizeHeader(v) {
    return String(v || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '');
  }

  function parseCsvLine(line, delimiter) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    return values;
  }

  function detectDelimiter(headerLine) {
    const semi = (headerLine.match(/;/g) || []).length;
    const comma = (headerLine.match(/,/g) || []).length;
    return semi >= comma ? ';' : ',';
  }

  function isTechnicalClass(classe) {
    return /^A_COMPLETER/.test(safeUpper(classe));
  }

  function localDisplayName(accCode) {
    const row = localRosterByAcc[safeUpper(accCode)];
    if (!row) return '—';
    const full = `${String(row.prenom || '').trim()} ${String(row.nom || '').trim()}`.trim();
    return full || '—';
  }

  function setRosterStatus(message, type) {
    if (!elRosterStatus) return;
    elRosterStatus.textContent = message;
    elRosterStatus.classList.remove('ok', 'err');
    if (type === 'ok') elRosterStatus.classList.add('ok');
    if (type === 'err') elRosterStatus.classList.add('err');
  }

  function classesSansTechnique() {
    return getClasses().filter((c) => !isTechnicalClass(c));
  }

  function mapRowsByClassOrder(rows, warnings) {
    const byClassCsv = new Map();
    rows.forEach((r) => {
      const c = safeUpper(r.classe);
      if (!c) return;
      if (!byClassCsv.has(c)) byClassCsv.set(c, []);
      byClassCsv.get(c).push(r);
    });

    const byAcc = {};
    const classes = classesSansTechnique();
    classes.forEach((classe) => {
      const c = safeUpper(classe);
      const csvList = byClassCsv.get(c) || [];
      const bddList = bdd.filter((e) => safeUpper(e.classe) === c);
      if (csvList.length !== bddList.length) {
        warnings.push(`Classe ${classe}: CSV=${csvList.length}, base=${bddList.length}`);
      }
      const n = Math.min(csvList.length, bddList.length);
      for (let i = 0; i < n; i += 1) {
        const acc = safeUpper(bddList[i].accCode);
        byAcc[acc] = {
          classe,
          prenom: csvList[i].prenom,
          nom: csvList[i].nom,
        };
      }
    });

    byClassCsv.forEach((_rows, csvClass) => {
      const exists = classes.some((c) => safeUpper(c) === csvClass);
      if (!exists && !isTechnicalClass(csvClass)) {
        warnings.push(`Classe ${csvClass}: absente de la base publique.`);
      }
    });
    return byAcc;
  }

  function saveLocalRoster(byAcc, warnings, fileName) {
    const payload = {
      importedAt: Date.now(),
      fileName: fileName || '',
      byAcc,
      warnings,
    };
    localStorage.setItem(ROSTER_LOCAL_KEY, JSON.stringify(payload));
    localRosterByAcc = byAcc;
    const count = Object.keys(byAcc).length;
    const warningCount = warnings.length;
    setRosterStatus(
      warningCount
        ? `CSV importé localement: ${count} élève(s). ${warningCount} alerte(s) à vérifier.`
        : `CSV importé localement: ${count} élève(s).`,
      warningCount ? 'err' : 'ok'
    );
    renderListeEleves();
    if (selectedAccCode) openEleve(selectedAccCode);
  }

  function loadLocalRoster() {
    const raw = localStorage.getItem(ROSTER_LOCAL_KEY);
    if (!raw) {
      localRosterByAcc = {};
      setRosterStatus('Aucun fichier privé chargé.', '');
      return;
    }
    try {
      const payload = JSON.parse(raw);
      localRosterByAcc = payload.byAcc || {};
      const count = Object.keys(localRosterByAcc).length;
      const importedAt = payload.importedAt ? fmtDate(payload.importedAt) : '';
      setRosterStatus(`CSV privé chargé localement: ${count} élève(s). ${importedAt}`, 'ok');
    } catch (_e) {
      localStorage.removeItem(ROSTER_LOCAL_KEY);
      localRosterByAcc = {};
      setRosterStatus('CSV local illisible. Supprimé automatiquement.', 'err');
    }
  }

  function clearLocalRoster() {
    localStorage.removeItem(ROSTER_LOCAL_KEY);
    localRosterByAcc = {};
    setRosterStatus('Fichier privé local supprimé de cet appareil.', 'ok');
    renderListeEleves();
    if (selectedAccCode) openEleve(selectedAccCode);
  }

  async function importRosterCsvFile(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length < 2) {
        setRosterStatus('CSV vide ou incomplet.', 'err');
        return;
      }

      const delimiter = detectDelimiter(lines[0]);
      const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
      const idxClasse = headers.findIndex((h) => ['classe', 'class'].includes(h));
      const idxPrenom = headers.findIndex((h) => ['prenom', 'firstname', 'first_name'].includes(h));
      const idxNom = headers.findIndex((h) => ['nom', 'lastname', 'last_name'].includes(h));
      const idxAccCode = headers.findIndex((h) => ['acccode', 'codeacc', 'code_acc'].includes(h));
      const idxUserCode = headers.findIndex((h) => ['usercode', 'codeeleve', 'code_eleve'].includes(h));

      if (idxClasse < 0 || idxPrenom < 0 || idxNom < 0) {
        setRosterStatus('En-têtes CSV attendus: classe, prenom, nom (accCode/userCode optionnels).', 'err');
        return;
      }

      const rows = [];
      for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLine(lines[i], delimiter);
        const classe = String(cols[idxClasse] || '').trim();
        const prenom = String(cols[idxPrenom] || '').trim();
        const nom = String(cols[idxNom] || '').trim();
        if (!classe || (!prenom && !nom)) continue;
        rows.push({
          classe,
          prenom,
          nom,
          accCode: idxAccCode >= 0 ? String(cols[idxAccCode] || '').trim() : '',
          userCode: idxUserCode >= 0 ? String(cols[idxUserCode] || '').trim() : '',
        });
      }

      if (!rows.length) {
        setRosterStatus('Aucune ligne élève exploitable dans le CSV.', 'err');
        return;
      }

      const warnings = [];
      let byAcc = {};
      if (idxAccCode >= 0 || idxUserCode >= 0) {
        rows.forEach((r) => {
          let acc = safeUpper(r.accCode);
          if (!acc && r.userCode) {
            const found = bdd.find((e) => safeUpper(e.userCode) === safeUpper(r.userCode));
            if (found) acc = safeUpper(found.accCode);
          }
          if (!acc) return;
          if (byAcc[acc]) warnings.push(`Doublon de mapping pour ${acc}`);
          byAcc[acc] = { classe: r.classe, prenom: r.prenom, nom: r.nom };
        });
      } else {
        byAcc = mapRowsByClassOrder(rows, warnings);
      }

      saveLocalRoster(byAcc, warnings, file.name);
    } catch (e) {
      console.error(e);
      setRosterStatus('Erreur lors de la lecture du CSV local.', 'err');
    } finally {
      if (elRosterFile) elRosterFile.value = '';
    }
  }

  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('fr-FR');
  }

  function getClasses() {
    return Array.from(new Set(bdd.map((e) => e.classe))).sort();
  }

  function filteredEleves() {
    const current = elClasseFilter ? elClasseFilter.value : 'ALL';
    if (!current || current === 'ALL') return bdd.slice();
    return bdd.filter((e) => e.classe === current);
  }

  function getAuthState(accCode) {
    const c = safeUpper(accCode);
    const a = autorisationsCache[c];
    return !!(a && a.autorise === true);
  }

  function getEleveData(accCode) {
    const c = safeUpper(accCode);
    const mapped = byAcc.get(c);
    if (!mapped) return {};
    return elevesCache[c] || elevesCache[safeUpper(mapped.userCode)] || {};
  }

  function resolveEleveDataCode(loginCode) {
    const code = safeUpper(loginCode);
    const mapped = byAcc.get(code);
    if (mapped && mapped.userCode) return safeUpper(mapped.userCode);
    return code;
  }

  async function confirmAndMarkGoalFromQr(rec) {
    if (!rec || rec.flux !== 1 || !rec.eleve || !rec.objectif) return;

    const eleveLoginCode = safeUpper(rec.eleve);
    const candidateCodes = [resolveEleveDataCode(eleveLoginCode), eleveLoginCode]
      .map(safeUpper)
      .filter(Boolean)
      .filter((code, idx, arr) => arr.indexOf(code) === idx);

    let goalRef = null;
    let snap = null;
    for (const code of candidateCodes) {
      const ref = firebase.database().ref(`${REF_ELEVES}/${code}/objectifs/${rec.objectif}`);
      const currentSnap = await ref.once('value');
      if (currentSnap.exists()) {
        goalRef = ref;
        snap = currentSnap;
        break;
      }
    }

    if (!goalRef || !snap || !snap.exists()) {
      setUnlockStatus(`Scan enregistré, mais objectif introuvable (${eleveLoginCode} / ${rec.objectif}).`, false);
      return;
    }

    const goal = snap.val() || {};
    const titre = String(goal.titre || rec.objectif || 'objectif').trim();
    const shortTitle = titre.length > 80 ? `${titre.slice(0, 77)}...` : titre;
    const ask = `Valider l'objectif "${shortTitle}" pour ${eleveLoginCode} ?`;
    if (!confirm(ask)) {
      setUnlockStatus('Scan enregistré sans validation finale de l’objectif.', false);
      return;
    }

    const patch = {
      validated_via_qr: true,
      validated_by: 'enseignant_qr',
      validated_at: Date.now(),
      updated_at: Date.now(),
    };
    if (goal.done !== true) {
      patch.done = true;
      patch.date_done = new Date().toISOString();
    }

    await goalRef.update(patch);
    await goalRef.child('historique').push({
      action: 'Validé par enseignant (scan QR cockpit)',
      date: new Date().toISOString(),
    });

    setUnlockStatus(`Objectif validé pour ${eleveLoginCode}.`, true);
    if (selectedAccCode && safeUpper(selectedAccCode) === eleveLoginCode) {
      openEleve(eleveLoginCode);
    }
  }

  async function setAuthState(accCode, autorise) {
    if (!unlocked) {
      setUnlockStatus('Déverrouille le cockpit pour modifier les accès.', false);
      return;
    }
    const c = safeUpper(accCode);
    await firebase
      .database()
      .ref(`${REF_AUTORISATIONS}/${c}`)
      .update({
        autorise: !!autorise,
        updated_at: Date.now(),
      });
  }

  function scheduleTargetCode() {
    return normalizeCode(elScheduleCode ? elScheduleCode.value : '').slice(0, 16);
  }

  function setScheduleCodeValue(code) {
    if (!elScheduleCode) return;
    elScheduleCode.value = safeUpper(code).slice(0, 16);
  }

  async function loadGlobalSchedule() {
    try {
      const snap = await firebase.database().ref(REF_HORAIRES_GLOBAL).once('value');
      if (!snap.exists()) {
        renderScheduleTable(elGlobalScheduleBody, defaultScheduleTemplate());
        setGlobalScheduleStatus('Aucun cadre global enregistré (accès continu par défaut).', '');
        return;
      }
      renderScheduleTable(elGlobalScheduleBody, normalizeSchedule(snap.val()));
      setGlobalScheduleStatus('Cadre global chargé.', 'ok');
    } catch (e) {
      console.error(e);
      setGlobalScheduleStatus('Erreur lors du chargement du cadre global.', 'err');
    }
  }

  async function saveGlobalSchedule() {
    if (!unlocked) {
      setGlobalScheduleStatus('Déverrouille le cockpit pour enregistrer.', 'err');
      return;
    }
    const horaires = collectScheduleTable(elGlobalScheduleBody);
    const validationError = validateSchedule(horaires);
    if (validationError) {
      setGlobalScheduleStatus(validationError, 'err');
      return;
    }
    try {
      await firebase.database().ref(REF_HORAIRES_GLOBAL).set(horaires);
      setGlobalScheduleStatus('Cadre global enregistré.', 'ok');
    } catch (e) {
      console.error(e);
      setGlobalScheduleStatus('Erreur lors de l’enregistrement global.', 'err');
    }
  }

  async function clearGlobalSchedule() {
    if (!unlocked) {
      setGlobalScheduleStatus('Déverrouille le cockpit pour supprimer.', 'err');
      return;
    }
    if (!confirm('Supprimer le cadre horaire global ?')) return;
    try {
      await firebase.database().ref(REF_HORAIRES_GLOBAL).remove();
      renderScheduleTable(elGlobalScheduleBody, defaultScheduleTemplate());
      setGlobalScheduleStatus('Cadre global supprimé (accès continu).', 'ok');
    } catch (e) {
      console.error(e);
      setGlobalScheduleStatus('Erreur lors de la suppression globale.', 'err');
    }
  }

  async function loadCodeSchedule() {
    const code = scheduleTargetCode();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) {
      setCodeScheduleStatus('Saisis un code ACC valide (4 à 16 caractères).', 'err');
      return;
    }
    setScheduleCodeValue(code);
    try {
      const snap = await firebase.database().ref(`${REF_AUTORISATIONS}/${code}`).once('value');
      const auth = snap.val();
      if (!auth) {
        setCodeScheduleStatus(`Code ${code} introuvable dans les autorisations.`, 'err');
        return;
      }
      if (auth.horaires) {
        renderScheduleTable(elCodeScheduleBody, normalizeSchedule(auth.horaires));
        let msg = `Exception horaire chargée pour ${code}.`;
        if (auth.bypass_schedule === true) msg += ' bypass_schedule actif.';
        setCodeScheduleStatus(msg, 'ok');
      } else {
        renderScheduleTable(elCodeScheduleBody, defaultScheduleTemplate());
        let msg = `Aucune exception pour ${code} (règle globale appliquée).`;
        if (auth.bypass_schedule === true) msg += ' bypass_schedule actif.';
        setCodeScheduleStatus(msg, '');
      }
    } catch (e) {
      console.error(e);
      setCodeScheduleStatus('Erreur lors du chargement de l’exception code.', 'err');
    }
  }

  async function saveCodeSchedule() {
    if (!unlocked) {
      setCodeScheduleStatus('Déverrouille le cockpit pour enregistrer.', 'err');
      return;
    }
    const code = scheduleTargetCode();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) {
      setCodeScheduleStatus('Saisis un code ACC valide (4 à 16 caractères).', 'err');
      return;
    }
    setScheduleCodeValue(code);
    const horaires = collectScheduleTable(elCodeScheduleBody);
    const validationError = validateSchedule(horaires);
    if (validationError) {
      setCodeScheduleStatus(validationError, 'err');
      return;
    }
    try {
      const snap = await firebase.database().ref(`${REF_AUTORISATIONS}/${code}`).once('value');
      if (!snap.exists()) {
        setCodeScheduleStatus(`Code ${code} introuvable.`, 'err');
        return;
      }
      await firebase
        .database()
        .ref(`${REF_AUTORISATIONS}/${code}`)
        .update({ horaires, updated_at: Date.now() });
      setCodeScheduleStatus(`Exception enregistrée pour ${code}.`, 'ok');
    } catch (e) {
      console.error(e);
      setCodeScheduleStatus('Erreur lors de l’enregistrement du code.', 'err');
    }
  }

  async function clearCodeSchedule() {
    if (!unlocked) {
      setCodeScheduleStatus('Déverrouille le cockpit pour supprimer.', 'err');
      return;
    }
    const code = scheduleTargetCode();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) {
      setCodeScheduleStatus('Saisis un code ACC valide (4 à 16 caractères).', 'err');
      return;
    }
    if (!confirm(`Supprimer l'exception horaire pour ${code} ?`)) return;
    try {
      await firebase
        .database()
        .ref(`${REF_AUTORISATIONS}/${code}`)
        .update({ horaires: null, updated_at: Date.now() });
      renderScheduleTable(elCodeScheduleBody, defaultScheduleTemplate());
      setCodeScheduleStatus(`Exception supprimée pour ${code}.`, 'ok');
    } catch (e) {
      console.error(e);
      setCodeScheduleStatus('Erreur lors de la suppression du code.', 'err');
    }
  }

  function useSelectedCodeForSchedule() {
    if (!selectedAccCode) {
      setCodeScheduleStatus('Sélectionne d’abord un élève dans la liste.', 'err');
      return;
    }
    setScheduleCodeValue(selectedAccCode);
    loadCodeSchedule();
  }

  function setSpecialStatus(el, label, allowed) {
    if (!el) return;
    el.textContent = `${label} ${allowed ? 'autorisé' : 'non autorisé'}`;
    el.classList.remove('ok', 'err');
    el.classList.add(allowed ? 'ok' : 'err');
  }

  function renderSpecialStatuses() {
    setSpecialStatus(elStatusSpecialProfpse, 'PROFPSE :', getAuthState('PROFPSE'));
    setSpecialStatus(elStatusSpecialInvite, 'INVITE :', getAuthState('INVITE'));
    if (btnSpecialProfpse) btnSpecialProfpse.disabled = !unlocked;
    if (btnSpecialInvite) btnSpecialInvite.disabled = !unlocked;
    renderSpecialCodesManager();
    syncScheduleWriteState();
  }

  function renderSpecialCodesManager() {
    if (!elSpecialCodesList) return;
    elSpecialCodesList.innerHTML = '';
    if (btnGenerateSpecial) btnGenerateSpecial.disabled = !unlocked;
    if (btnCreateSpecial) btnCreateSpecial.disabled = !unlocked;
    if (elSpecialLabel) elSpecialLabel.disabled = !unlocked;
    if (elSpecialCode) elSpecialCode.disabled = !unlocked;

    const entries = Object.keys(autorisationsCache)
      .filter((code) => {
        const upper = safeUpper(code);
        if (isStudentCode(upper)) return false;
        return isSpecialEntry(upper, autorisationsCache[code]);
      })
      .sort()
      .map((code) => ({ code, data: autorisationsCache[code] || {} }));

    if (!entries.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" class="muted">Aucun code spécial enregistré.</td>';
      elSpecialCodesList.appendChild(tr);
      return;
    }

    entries.forEach((entry) => {
      const code = safeUpper(entry.code);
      const data = entry.data || {};
      const label = getSpecialLabel(code, data);
      const allowed = getAuthState(code);
      const isReserved = RESERVED_SPECIAL_CODES.has(code);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(code)}</strong></td>
        <td>${escapeHtml(label)}</td>
        <td><span class="badge ${allowed ? 'ok' : 'no'}">${allowed ? 'Actif' : 'Suspendu'}</span></td>
        <td>
          <button class="btn small ${allowed ? 'danger' : 'success'}" data-action="toggle" ${unlocked ? '' : 'disabled'}>${allowed ? 'Suspendre' : 'Activer'}</button>
          <button class="btn small" data-action="copy">Copier</button>
          <button class="btn small" data-action="delete" ${!unlocked || isReserved ? 'disabled' : ''}>Supprimer</button>
        </td>
      `;

      tr.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
        try {
          await setAuthState(code, !allowed);
        } catch (e) {
          console.error(e);
          setSpecialCreateStatus(`Erreur de mise à jour pour ${code}.`, 'err');
        }
      });

      tr.querySelector('[data-action="copy"]').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code);
          setSpecialCreateStatus(`Code ${code} copié.`, 'ok');
        } catch (_e) {
          setSpecialCreateStatus(`Copie impossible automatiquement pour ${code}.`, 'err');
        }
      });

      tr.querySelector('[data-action="delete"]').addEventListener('click', async () => {
        if (isReserved) return;
        if (!unlocked) return;
        if (!confirm(`Supprimer le code ${code} ?`)) return;
        try {
          await firebase.database().ref(`${REF_AUTORISATIONS}/${code}`).remove();
          setSpecialCreateStatus(`Code ${code} supprimé.`, 'ok');
        } catch (e) {
          console.error(e);
          setSpecialCreateStatus(`Erreur lors de la suppression de ${code}.`, 'err');
        }
      });

      elSpecialCodesList.appendChild(tr);
    });
  }

  async function ensureDefaultSpecialCodes() {
    if (specialDefaultsReady || ensuringSpecialDefaults) return;
    ensuringSpecialDefaults = true;
    try {
      const now = Date.now();
      const prof = autorisationsCache.PROFPSE || null;
      const invite = autorisationsCache.INVITE || null;

      if (!prof) {
        await firebase.database().ref(`${REF_AUTORISATIONS}/PROFPSE`).set({
          autorise: true,
          label: 'Accès personnel enseignant',
          special: true,
          userCode: 'PROFPSE',
          bypass_schedule: true,
          updated_at: now,
        });
      } else {
        const patch = {};
        if (prof.special !== true) patch.special = true;
        if (prof.bypass_schedule !== true) patch.bypass_schedule = true;
        if (!prof.userCode) patch.userCode = 'PROFPSE';
        if (!prof.label) patch.label = 'Accès personnel enseignant';
        if (Object.keys(patch).length) {
          patch.updated_at = now;
          await firebase.database().ref(`${REF_AUTORISATIONS}/PROFPSE`).update(patch);
        }
      }

      if (!invite) {
        await firebase.database().ref(`${REF_AUTORISATIONS}/INVITE`).set({
          autorise: false,
          label: 'Accès invité',
          special: true,
          userCode: 'INVITE',
          bypass_schedule: true,
          updated_at: now,
        });
      } else {
        const patch = {};
        if (invite.special !== true) patch.special = true;
        if (invite.bypass_schedule !== true) patch.bypass_schedule = true;
        if (!invite.userCode) patch.userCode = 'INVITE';
        if (!invite.label) patch.label = 'Accès invité';
        if (Object.keys(patch).length) {
          patch.updated_at = now;
          await firebase.database().ref(`${REF_AUTORISATIONS}/INVITE`).update(patch);
        }
      }
      specialDefaultsReady = true;
    } catch (e) {
      console.error('Impossible de garantir les codes spéciaux par défaut', e);
    } finally {
      ensuringSpecialDefaults = false;
    }
  }

  async function createSpecialCode() {
    if (!unlocked) {
      setSpecialCreateStatus('Déverrouille le cockpit pour créer un code.', 'err');
      return;
    }
    const label = String(elSpecialLabel ? elSpecialLabel.value : '').trim() || 'Code spécial';
    let code = normalizeCode(elSpecialCode ? elSpecialCode.value : '');
    if (!code) code = nextAvailableSpecialCode();
    if (!code) {
      setSpecialCreateStatus('Impossible de générer un code libre.', 'err');
      return;
    }
    if (!/^[A-Z0-9]{4,16}$/.test(code)) {
      setSpecialCreateStatus('Le code doit contenir 4 à 16 caractères alphanumériques.', 'err');
      return;
    }
    if (isStudentCode(code)) {
      setSpecialCreateStatus('Ce code existe déjà pour un élève.', 'err');
      return;
    }
    try {
      await firebase.database().ref(`${REF_AUTORISATIONS}/${code}`).update({
        autorise: true,
        special: true,
        label,
        userCode: code,
        bypass_schedule: true,
        updated_at: Date.now(),
      });
      if (elSpecialCode) elSpecialCode.value = code;
      if (elSpecialLabel) elSpecialLabel.value = '';
      setSpecialCreateStatus(`Code ${code} créé et activé.`, 'ok');
    } catch (e) {
      console.error(e);
      setSpecialCreateStatus('Erreur lors de la création du code spécial.', 'err');
    }
  }

  function setUnlockStatus(message, ok) {
    if (!elUnlockStatus) return;
    elUnlockStatus.textContent = message;
    elUnlockStatus.classList.remove('ok', 'err');
    elUnlockStatus.classList.add(ok ? 'ok' : 'err');
  }

  function decodedUnlockCodes() {
    return UNLOCK_CODES_B64
      .map((v) => {
        try {
          return normalizeCode(atob(v));
        } catch (_e) {
          return '';
        }
      })
      .filter(Boolean);
  }

  function unlockCockpit() {
    const entered = normalizeCode(elTeacherCode ? elTeacherCode.value : '');
    const expectedCodes = decodedUnlockCodes();
    if (!entered) {
      setUnlockStatus('Saisis le code enseignant (PROFPSE, INVITE ou CPS2026).', false);
      return;
    }
    if (!expectedCodes.includes(entered)) {
      setUnlockStatus('Code enseignant incorrect.', false);
      if (elTeacherCode) elTeacherCode.value = '';
      return;
    }
    unlocked = true;
    sessionStorage.setItem(SESSION_UNLOCK_KEY, '1');
    setUnlockStatus('Cockpit déverrouillé.', true);
    if (elTeacherCode) elTeacherCode.value = '';
    renderListeEleves();
    renderSpecialStatuses();
  }

  function renderFilters() {
    if (!elClasseFilter) return;
    const classes = getClasses();
    const prev = elClasseFilter.value || 'ALL';
    elClasseFilter.innerHTML = '<option value="ALL">Toutes les classes</option>';
    classes.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      elClasseFilter.appendChild(opt);
    });
    elClasseFilter.value = classes.includes(prev) || prev === 'ALL' ? prev : 'ALL';
  }

  function renderListeEleves() {
    if (!elListe) return;
    elListe.innerHTML = '';

    const list = filteredEleves();
    if (elCount) {
      elCount.textContent = `${list.length} élève${list.length > 1 ? 's' : ''}`;
    }

    if (!list.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="muted">Aucun élève pour ce filtre.</td>';
      elListe.appendChild(tr);
      return;
    }

    list.forEach((eleve, index) => {
      const accCode = safeUpper(eleve.accCode);
      const allowed = getAuthState(accCode);
      const tr = document.createElement('tr');

      const actionDisabled = unlocked ? '' : 'disabled';
      const toggleClass = allowed ? 'btn danger' : 'btn success';
      const toggleLabel = allowed ? 'Interdire' : 'Autoriser';

      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${escapeHtml(eleve.classe)}</td>
        <td>${escapeHtml(localDisplayName(accCode))}</td>
        <td><strong>${accCode}</strong></td>
        <td><span class="badge ${allowed ? 'ok' : 'no'}">${allowed ? 'Autorisé' : 'Non autorisé'}</span></td>
        <td>
          <button class="${toggleClass} small" data-action="toggle" ${actionDisabled}>${toggleLabel}</button>
          <button class="btn small" data-action="open">Ouvrir</button>
        </td>
      `;

      tr.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
        try {
          await setAuthState(accCode, !allowed);
        } catch (e) {
          console.error(e);
          setUnlockStatus('Erreur lors de la mise à jour des autorisations.', false);
        }
      });

      tr.querySelector('[data-action="open"]').addEventListener('click', () => {
        openEleve(accCode);
      });

      elListe.appendChild(tr);
    });
  }

  function openEleve(accCode) {
    const code = safeUpper(accCode);
    const profile = byAcc.get(code);
    const data = getEleveData(code);

    selectedAccCode = code;
    setScheduleCodeValue(code);

    if (elDetailSection) elDetailSection.style.display = 'block';
    if (elNomEleve) {
      const displayName = localDisplayName(code);
      elNomEleve.textContent = `${displayName !== '—' ? displayName + ' · ' : ''}${code}${profile ? ' · ' + profile.classe : ''}`;
    }

    const objectifs = data.objectifs ? Object.keys(data.objectifs).length : 0;
    const meteo = data.meteo ? Object.keys(data.meteo).length : 0;
    const autorise = getAuthState(code);

    if (elDetailEleve) {
      elDetailEleve.innerHTML = `
        <div><strong>Code ACC :</strong> ${code}</div>
        <div><strong>Élève (local) :</strong> ${escapeHtml(localDisplayName(code))}</div>
        <div><strong>Classe :</strong> ${profile ? profile.classe : '—'}</div>
        <div><strong>Accès :</strong> ${autorise ? 'Autorisé' : 'Non autorisé'}</div>
        <div><strong>Objectifs :</strong> ${objectifs}</div>
        <div><strong>Météo :</strong> ${meteo}</div>
      `;
    }
  }

  function renderValidations(items) {
    if (!elListeValidations) return;
    elListeValidations.innerHTML = '';

    if (!items.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" class="muted">Aucune validation.</td>';
      elListeValidations.appendChild(tr);
      return;
    }

    items.forEach((v) => {
      const tr = document.createElement('tr');
      const eleve = escapeHtml(safeUpper(v.eleve));
      const flux = escapeHtml(String(v.flux || ''));
      const competence = escapeHtml(safeUpper(v.competence || v.type_reconnaissance || ''));
      const when = escapeHtml(fmtDate(v.timestamp || v.created_at));
      tr.innerHTML = `
        <td>${eleve}</td>
        <td>${flux}</td>
        <td>${competence}</td>
        <td>${when}</td>
      `;
      elListeValidations.appendChild(tr);
    });
  }

  function buildExportText(classe) {
    const list = bdd.filter((e) => e.classe === classe);
    const lines = [`Classe ${classe} — Codes d'accès accompagnement :`];
    list.forEach((e, i) => {
      lines.push(`Élève ${i + 1} : ${safeUpper(e.accCode)}`);
    });
    return lines.join('\n');
  }

  function renderExportButtons() {
    if (!elExportButtons) return;
    elExportButtons.innerHTML = '';

    getClasses().forEach((classe) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `📋 Exporter les codes ${classe}`;
      btn.addEventListener('click', () => {
        if (elExportOutput) {
          elExportOutput.value = buildExportText(classe);
        }
        if (elCopyStatus) elCopyStatus.textContent = '';
      });
      elExportButtons.appendChild(btn);
    });
  }

  async function copyExport() {
    if (!elExportOutput || !elExportOutput.value.trim()) {
      if (elCopyStatus) elCopyStatus.textContent = 'Aucun export à copier.';
      return;
    }
    try {
      await navigator.clipboard.writeText(elExportOutput.value);
      if (elCopyStatus) elCopyStatus.textContent = 'Export copié.';
    } catch (_e) {
      if (elCopyStatus) elCopyStatus.textContent = 'Copie impossible automatiquement. Copie manuelle nécessaire.';
    }
  }

  function subscribeAutorisations() {
    firebase.database().ref(REF_AUTORISATIONS).on('value', (snap) => {
      autorisationsCache = snap.val() || {};
      ensureDefaultSpecialCodes();
      renderListeEleves();
      renderSpecialStatuses();
      if (selectedAccCode) openEleve(selectedAccCode);
    });
  }

  function subscribeEleves() {
    firebase.database().ref(REF_ELEVES).on('value', (snap) => {
      elevesCache = snap.val() || {};
      if (selectedAccCode) openEleve(selectedAccCode);
    });
  }

  function subscribeValidations() {
    firebase.database().ref(REF_VALIDATIONS).limitToLast(100).on('value', (snap) => {
      const obj = snap.val() || {};
      const items = Object.keys(obj)
        .map((k) => ({ id: k, ...obj[k] }))
        .sort((a, b) => (b.timestamp || b.created_at || 0) - (a.timestamp || a.created_at || 0));
      renderValidations(items);
    });
  }

  function initQrScanner() {
    const containerId = 'qr-reader';
    const el = document.getElementById(containerId);
    if (!el) return;

    if (!window.isSecureContext && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
      setUnlockStatus('Le scan QR nécessite HTTPS (caméra bloquée en HTTP).', false);
    }

    if (typeof Html5QrcodeScanner === 'undefined') {
      console.warn('Html5QrcodeScanner indisponible');
      return;
    }

    const scanner = new Html5QrcodeScanner(containerId, {
      fps: 10,
      qrbox: 220,
    });
    let cameraErrorNotified = false;

    scanner.render(
      async (decodedText) => {
        if (!unlocked) {
          setUnlockStatus('Déverrouille le cockpit avant de valider un scan.', false);
          return;
        }
        const now = Date.now();
        if (decodedText === lastScanText && now - lastScanAt < SCAN_DUPLICATE_COOLDOWN_MS) {
          return;
        }
        lastScanText = decodedText;
        lastScanAt = now;
        try {
          const payload = JSON.parse(decodedText);
          const fluxNum = Number(payload && payload.flux);
          const rec = {
            eleve: safeUpper(payload && payload.eleve).slice(0, 16),
            flux: fluxNum === 2 ? 2 : 1,
            competence: safeUpper((payload && payload.competence) || (payload && payload.type_reconnaissance) || '').slice(0, 32),
            type_reconnaissance: safeUpper(payload && payload.type_reconnaissance).slice(0, 32),
            objectif: String((payload && payload.objectif) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80),
            cadre: String((payload && payload.cadre) || '').slice(0, 64),
            timestamp: Number(payload && payload.timestamp) || Date.now(),
            created_at: Date.now(),
            source: 'cockpit',
          };
          if (!rec.eleve) {
            setUnlockStatus('QR invalide : code élève manquant.', false);
            return;
          }
          if (rec.flux === 1 && !rec.objectif) {
            setUnlockStatus('QR objectif invalide : identifiant objectif manquant.', false);
            return;
          }

          try {
            await firebase.database().ref(REF_VALIDATIONS).push(rec);
          } catch (writeErr) {
            const message = String(writeErr && writeErr.message ? writeErr.message : '');
            console.error('Erreur Firebase (scan QR)', writeErr);
            if (/permission_denied/i.test(message)) {
              setUnlockStatus('Scan lu, mais refusé par Firebase (permissions).', false);
            } else {
              setUnlockStatus('Scan lu, mais enregistrement Firebase impossible (réseau/serveur).', false);
            }
            return;
          }

          if (rec.flux === 1) {
            await confirmAndMarkGoalFromQr(rec);
          } else {
            setUnlockStatus(`Scan enregistré (${rec.eleve} · flux ${rec.flux}).`, true);
          }
        } catch (e) {
          console.error('Erreur de traitement QR', e);
          if (e instanceof SyntaxError) {
            setUnlockStatus('QR invalide (format JSON attendu).', false);
          } else {
            setUnlockStatus('Erreur pendant le traitement du scan.', false);
          }
        }
      },
      (scanErr) => {
        if (cameraErrorNotified) return;
        const msg = String(scanErr || '').toLowerCase();
        if (msg.includes('notallowed') || msg.includes('permission') || msg.includes('denied')) {
          setUnlockStatus('Caméra refusée : autorise l’accès caméra pour scanner les QR.', false);
          cameraErrorNotified = true;
          return;
        }
        if (msg.includes('secure') || msg.includes('https')) {
          setUnlockStatus('Le scan QR nécessite HTTPS.', false);
          cameraErrorNotified = true;
        }
      }
    );
  }

  function bindEvents() {
    if (btnUnlock) btnUnlock.addEventListener('click', unlockCockpit);
    if (elTeacherCode) {
      elTeacherCode.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') unlockCockpit();
      });
      elTeacherCode.addEventListener('input', (e) => {
        e.target.value = normalizeCode(e.target.value).slice(0, 16);
      });
    }

    if (elClasseFilter) {
      elClasseFilter.addEventListener('change', () => {
        renderListeEleves();
      });
    }

    if (btnResetFilter) {
      btnResetFilter.addEventListener('click', () => {
        if (elClasseFilter) elClasseFilter.value = 'ALL';
        renderListeEleves();
      });
    }

    if (btnCopyExport) {
      btnCopyExport.addEventListener('click', copyExport);
    }

    if (btnLoadGlobalSchedule) {
      btnLoadGlobalSchedule.addEventListener('click', loadGlobalSchedule);
    }

    if (btnSaveGlobalSchedule) {
      btnSaveGlobalSchedule.addEventListener('click', saveGlobalSchedule);
    }

    if (btnClearGlobalSchedule) {
      btnClearGlobalSchedule.addEventListener('click', clearGlobalSchedule);
    }

    if (elScheduleCode) {
      elScheduleCode.addEventListener('input', (e) => {
        e.target.value = normalizeCode(e.target.value).slice(0, 16);
      });
      elScheduleCode.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loadCodeSchedule();
      });
    }

    if (btnUseSelectedCode) {
      btnUseSelectedCode.addEventListener('click', useSelectedCodeForSchedule);
    }

    if (btnLoadCodeSchedule) {
      btnLoadCodeSchedule.addEventListener('click', loadCodeSchedule);
    }

    if (btnSaveCodeSchedule) {
      btnSaveCodeSchedule.addEventListener('click', saveCodeSchedule);
    }

    if (btnClearCodeSchedule) {
      btnClearCodeSchedule.addEventListener('click', clearCodeSchedule);
    }

    if (btnImportRoster) {
      btnImportRoster.addEventListener('click', () => {
        if (!elRosterFile) return;
        if (elRosterFile.files && elRosterFile.files[0]) {
          importRosterCsvFile(elRosterFile.files[0]);
          return;
        }
        elRosterFile.click();
      });
    }

    if (elRosterFile) {
      elRosterFile.addEventListener('change', () => {
        const f = elRosterFile.files && elRosterFile.files[0];
        if (f) importRosterCsvFile(f);
      });
    }

    if (btnClearRoster) {
      btnClearRoster.addEventListener('click', clearLocalRoster);
    }

    if (elSpecialCode) {
      elSpecialCode.addEventListener('input', (e) => {
        e.target.value = normalizeCode(e.target.value).slice(0, 16);
      });
      elSpecialCode.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createSpecialCode();
      });
    }

    if (elSpecialLabel) {
      elSpecialLabel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') createSpecialCode();
      });
    }

    if (btnGenerateSpecial) {
      btnGenerateSpecial.addEventListener('click', () => {
        if (!unlocked) {
          setSpecialCreateStatus('Déverrouille le cockpit pour générer un code.', 'err');
          return;
        }
        const next = nextAvailableSpecialCode();
        if (!next) {
          setSpecialCreateStatus('Aucun code libre disponible.', 'err');
          return;
        }
        if (elSpecialCode) elSpecialCode.value = next;
        setSpecialCreateStatus(`Code proposé : ${next}`, 'ok');
      });
    }

    if (btnCreateSpecial) {
      btnCreateSpecial.addEventListener('click', createSpecialCode);
    }

    if (btnSpecialProfpse) {
      btnSpecialProfpse.addEventListener('click', async () => {
        try {
          await setAuthState('PROFPSE', !getAuthState('PROFPSE'));
        } catch (e) {
          console.error(e);
          setUnlockStatus('Erreur lors de la mise à jour de PROFPSE.', false);
        }
      });
    }

    if (btnSpecialInvite) {
      btnSpecialInvite.addEventListener('click', async () => {
        try {
          await setAuthState('INVITE', !getAuthState('INVITE'));
        } catch (e) {
          console.error(e);
          setUnlockStatus('Erreur lors de la mise à jour de INVITE.', false);
        }
      });
    }
  }

  function boot() {
    loadLocalRoster();
    renderFilters();
    renderExportButtons();
    renderScheduleTable(elGlobalScheduleBody, defaultScheduleTemplate());
    renderScheduleTable(elCodeScheduleBody, defaultScheduleTemplate());
    setGlobalScheduleStatus('Chargement du cadre global…', '');
    setCodeScheduleStatus('Saisis un code ACC puis charge son exception.', '');
    syncScheduleWriteState();
    renderListeEleves();
    renderSpecialStatuses();
    setSpecialCreateStatus('Crée un code démo puis active/suspend selon besoin.', '');
    bindEvents();

    if (unlocked) {
      setUnlockStatus('Cockpit déverrouillé (session active).', true);
    } else {
      setUnlockStatus('Cockpit verrouillé.', false);
    }
    renderSpecialStatuses();

    subscribeAutorisations();
    subscribeEleves();
    subscribeValidations();
    loadGlobalSchedule();
    initQrScanner();
  }

  boot();
})();
