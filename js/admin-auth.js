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

  // Obfuscation simple du code enseignant ("CPS2026")
  const VALIDATION_CODE_B64 = 'Q1BTMjAyNg==';
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

  function safeUpper(v) {
    return String(v || '').trim().toUpperCase();
  }

  function escapeHtml(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
  }

  function setUnlockStatus(message, ok) {
    if (!elUnlockStatus) return;
    elUnlockStatus.textContent = message;
    elUnlockStatus.classList.remove('ok', 'err');
    elUnlockStatus.classList.add(ok ? 'ok' : 'err');
  }

  function decodedValidationCode() {
    try {
      return atob(VALIDATION_CODE_B64);
    } catch (_e) {
      return '';
    }
  }

  function unlockCockpit() {
    const expected = decodedValidationCode();
    const entered = safeUpper(elTeacherCode ? elTeacherCode.value : '');
    if (!entered) {
      setUnlockStatus('Saisis le code enseignant.', false);
      return;
    }
    if (entered !== safeUpper(expected)) {
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
      tr.innerHTML = `
        <td>${safeUpper(v.eleve)}</td>
        <td>${v.flux || ''}</td>
        <td>${safeUpper(v.competence || v.type_reconnaissance || '')}</td>
        <td>${fmtDate(v.timestamp || v.created_at)}</td>
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

    if (typeof Html5QrcodeScanner === 'undefined') {
      console.warn('Html5QrcodeScanner indisponible');
      return;
    }

    const scanner = new Html5QrcodeScanner(containerId, {
      fps: 10,
      qrbox: 220,
    });

    scanner.render(
      async (decodedText) => {
        if (!unlocked) {
          setUnlockStatus('Déverrouille le cockpit avant de valider un scan.', false);
          return;
        }
        try {
          const payload = JSON.parse(decodedText);
          const rec = {
            ...payload,
            eleve: safeUpper(payload.eleve),
            created_at: Date.now(),
            source: 'cockpit',
          };
          await firebase.database().ref(REF_VALIDATIONS).push(rec);
        } catch (e) {
          console.error('QR invalide', e);
        }
      },
      () => {
        // Ignore errors while scanning continuously.
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
        e.target.value = safeUpper(e.target.value).slice(0, 16);
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
    renderListeEleves();
    renderSpecialStatuses();
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
    initQrScanner();
  }

  boot();
})();
