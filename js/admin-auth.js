// Cockpit accompagnement (enseignant)
// - Registre eleves dynamique dans Firebase (autorisations avec is_student)
// - Import CSV → generation de codes → ecriture Firebase
// - Gestion codes : modifier, activer/desactiver, supprimer, masse
// - Codes partages (PROFPSE, INVITE, custom)
// - Bibliotheque personnalisee
// - Cadre horaire d'acces
// - Scan QR + journal validations

(function () {
  'use strict';

  // ═══════════════════════════════════════════
  // CONSTANTS & FIREBASE REFERENCES
  // ═══════════════════════════════════════════
  const DB_ROOT = 'accompagnement';
  const REF_ELEVES = DB_ROOT + '/eleves';
  const REF_AUTORISATIONS = DB_ROOT + '/autorisations';
  const REF_VALIDATIONS = DB_ROOT + '/validations';
  const REF_HORAIRES_GLOBAL = DB_ROOT + '/config/horaires_global';
  const REF_CUSTOM_GLOBAL = DB_ROOT + '/bibliotheque_custom/global';
  const REF_CUSTOM_PAR_ELEVE = DB_ROOT + '/bibliotheque_custom/par_eleve';
  const REF_TEACHER_CODES = DB_ROOT + '/config/teacher_codes';
  const REF_STUDENT_REGISTRY = DB_ROOT + '/config/student_registry';

  // Codes de deverrouillage obfusques (CPS2026, PROFPSE, INVITE)
  var UNLOCK_CODES_B64 = ['Q1BTMjAyNg==', 'UFJPRlBTRQ==', 'SU5WSVRF'];
  var SESSION_UNLOCK_KEY = 'cockpit_teacher_unlock';

  var STUDENT_CODE_LETTERS = 'ABCDEFGHJKMNPQRSTVWXYZ';
  var STUDENT_CODE_DIGITS = '23456789';
  var SPECIAL_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  var SPECIAL_CODE_DIGITS = '23456789';
  var RESERVED_SPECIAL_CODES = new Set(['PROFPSE', 'INVITE']);
  var SCAN_DUPLICATE_COOLDOWN_MS = 3000;

  var CPS_COMPETENCES = [
    { code: 'C1.1', nom: 'Accroitre sa connaissance de soi' },
    { code: 'C1.2', nom: 'Penser de facon critique' },
    { code: 'C1.3', nom: 'Connaitre ses valeurs et buts' },
    { code: 'C1.4', nom: 'Prendre des decisions constructives' },
    { code: 'C1.5', nom: "S'auto-evaluer positivement" },
    { code: 'C1.6', nom: 'Renforcer sa pleine attention' },
    { code: 'E1.1', nom: 'Comprendre les emotions' },
    { code: 'E1.2', nom: 'Identifier ses emotions' },
    { code: 'E2.2', nom: 'Exprimer ses emotions de facon constructive' },
    { code: 'E2.3', nom: 'Gerer son stress' },
    { code: 'S1.1', nom: 'Communiquer de facon efficace' },
    { code: 'S1.2', nom: 'Communiquer de facon empathique' },
    { code: 'S1.3', nom: 'Developper des liens prosociaux' },
    { code: 'S2.1', nom: "S'affirmer et resister a la pression" },
    { code: 'S2.2', nom: 'Resoudre les conflits' },
  ];

  var SCHEDULE_DAYS = [
    { key: 'lundi', label: 'Lundi' },
    { key: 'mardi', label: 'Mardi' },
    { key: 'mercredi', label: 'Mercredi' },
    { key: 'jeudi', label: 'Jeudi' },
    { key: 'vendredi', label: 'Vendredi' },
    { key: 'samedi', label: 'Samedi' },
    { key: 'dimanche', label: 'Dimanche' },
  ];

  // ═══════════════════════════════════════════
  // DOM ELEMENTS
  // ═══════════════════════════════════════════
  var elListe = document.getElementById('liste-eleves');
  var elClasseFilter = document.getElementById('classe-filter');
  var elCount = document.getElementById('table-count');
  var elDetailSection = document.getElementById('sec-eleve');
  var elNomEleve = document.getElementById('nom-eleve');
  var elDetailEleve = document.getElementById('detail-eleve');
  var elListeValidations = document.getElementById('liste-validations');
  var elUnlockStatus = document.getElementById('unlock-status');
  var elTeacherCode = document.getElementById('teacher-code');
  var btnUnlock = document.getElementById('btn-unlock');
  var btnChangeTeacherCode = document.getElementById('btn-change-teacher-code');
  var btnResetFilter = document.getElementById('btn-reset-filter');
  var btnAddStudent = document.getElementById('btn-add-student');
  var elBulkActions = document.getElementById('bulk-actions');
  var elBulkLabel = document.getElementById('bulk-label');
  var btnBulkActivate = document.getElementById('btn-bulk-activate');
  var btnBulkDeactivate = document.getElementById('btn-bulk-deactivate');
  var btnBulkExport = document.getElementById('btn-bulk-export');
  var elCsvDropZone = document.getElementById('csv-drop-zone');
  var elCsvFileInput = document.getElementById('csv-file-input');
  var elCsvPreview = document.getElementById('csv-preview');
  var elCsvPreviewContent = document.getElementById('csv-preview-content');
  var btnCsvImport = document.getElementById('btn-csv-import');
  var btnCsvCancel = document.getElementById('btn-csv-cancel');
  var elCsvStatus = document.getElementById('csv-status');
  var elSpecialLabel = document.getElementById('special-label');
  var elSpecialCode = document.getElementById('special-code');
  var btnGenerateSpecial = document.getElementById('btn-generate-special');
  var btnCreateSpecial = document.getElementById('btn-create-special');
  var elSpecialCodesList = document.getElementById('special-codes-list');
  var elSpecialCreateStatus = document.getElementById('special-create-status');
  var elGlobalScheduleBody = document.getElementById('global-schedule-body');
  var elCodeScheduleBody = document.getElementById('code-schedule-body');
  var btnLoadGlobalSchedule = document.getElementById('btn-load-global-schedule');
  var btnSaveGlobalSchedule = document.getElementById('btn-save-global-schedule');
  var btnClearGlobalSchedule = document.getElementById('btn-clear-global-schedule');
  var elGlobalScheduleStatus = document.getElementById('status-global-schedule');
  var elScheduleCode = document.getElementById('schedule-code');
  var btnUseSelectedCode = document.getElementById('btn-use-selected-code');
  var btnLoadCodeSchedule = document.getElementById('btn-load-code-schedule');
  var btnSaveCodeSchedule = document.getElementById('btn-save-code-schedule');
  var btnClearCodeSchedule = document.getElementById('btn-clear-code-schedule');
  var elCodeScheduleStatus = document.getElementById('status-code-schedule');
  var elCustomGlobalText = document.getElementById('custom-global-text');
  var elCustomGlobalCompetence = document.getElementById('custom-global-competence');
  var elCustomGlobalContext = document.getElementById('custom-global-context');
  var btnCustomGlobalAdd = document.getElementById('btn-custom-global-add');
  var elCustomGlobalStatus = document.getElementById('status-custom-global');
  var elCustomGlobalList = document.getElementById('custom-global-list');
  var elCustomEleveSelect = document.getElementById('custom-eleve-select');
  var elCustomEleveBadge = document.getElementById('custom-eleve-badge');
  var elCustomEleveText = document.getElementById('custom-eleve-text');
  var elCustomEleveCompetence = document.getElementById('custom-eleve-competence');
  var elCustomEleveContext = document.getElementById('custom-eleve-context');
  var btnCustomEleveAdd = document.getElementById('btn-custom-eleve-add');
  var elCustomEleveStatus = document.getElementById('status-custom-eleve');
  var elCustomEleveList = document.getElementById('custom-eleve-list');
  var elModalOverlay = document.getElementById('modal-overlay');
  var elModalContent = document.getElementById('modal-content');

  // ═══════════════════════════════════════════
  // STATE & CACHES
  // ═══════════════════════════════════════════
  if (typeof firebase === 'undefined' || !firebase.apps || !firebase.apps.length) {
    console.error('Firebase non initialise');
    return;
  }

  var registreCache = {};       // { code: { code, classe, prenom, nom, created_at } }
  var autorisationsCache = {};  // { code: { autorise, special, label, ... } }
  var elevesCache = {};         // { code: { objectifs, meteo, ... } }
  var teacherCodesCache = [];   // Array of custom teacher codes from Firebase
  var selectedAccCode = null;
  var unlocked = sessionStorage.getItem(SESSION_UNLOCK_KEY) === '1';
  var ensuringSpecialDefaults = false;
  var specialDefaultsReady = false;
  var lastScanText = '';
  var lastScanAt = 0;
  var customGlobalCache = {};
  var customEleveCache = {};
  var customEleveSubPath = '';
  var customEleveSubHandler = null;
  var csvPendingRows = null;    // Rows parsed from CSV, waiting for import confirmation

  // ═══════════════════════════════════════════
  // UTILITY FUNCTIONS
  // ═══════════════════════════════════════════
  function safeUpper(v) {
    return String(v || '').trim().toUpperCase();
  }

  function normalizeCode(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  }

  function escapeHtml(v) {
    return String(v || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('fr-FR');
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function setStatus(el, message, type) {
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('ok', 'err');
    if (type === 'ok') el.classList.add('ok');
    if (type === 'err') el.classList.add('err');
  }

  function setUnlockStatus(message, ok) {
    setStatus(elUnlockStatus, message, ok ? 'ok' : 'err');
  }

  function setSpecialCreateStatus(message, type) {
    setStatus(elSpecialCreateStatus, message, type);
  }

  function setCsvStatus(message, type) {
    setStatus(elCsvStatus, message, type);
  }

  function normalizeContext(v) {
    var raw = String(v || '').trim().toLowerCase();
    if (raw === 'scolaire') return 'Scolaire';
    if (raw === 'pfmp') return 'PFMP';
    if (raw === 'recherche') return 'Recherche';
    return 'Autre';
  }

  function normalizeCompetenceCode(v) {
    return String(v || '').toUpperCase().replace(/[^A-Z0-9.]/g, '').trim();
  }

  function findCompetence(code) {
    var c = normalizeCompetenceCode(code);
    return CPS_COMPETENCES.find(function (it) { return it.code === c; }) || null;
  }

  function normalizeCustomText(v) {
    return String(v || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeTime(v, fallback) {
    var s = String(v || '').trim();
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(s) ? s : fallback;
  }

  function timeToMinutes(v) {
    var parts = String(v || '00:00').split(':').map(function (x) { return Number(x); });
    return parts[0] * 60 + parts[1];
  }

  // ═══════════════════════════════════════════
  // CODE GENERATION
  // ═══════════════════════════════════════════
  function generateStudentCode() {
    var letters = STUDENT_CODE_LETTERS;
    var digits = STUDENT_CODE_DIGITS;
    var code, attempts = 0;
    do {
      code = letters[Math.floor(Math.random() * letters.length)] +
             letters[Math.floor(Math.random() * letters.length)] +
             digits[Math.floor(Math.random() * digits.length)] +
             digits[Math.floor(Math.random() * digits.length)];
      attempts++;
    } while ((registreCache[code] || autorisationsCache[code]) && attempts < 1000);
    return attempts < 1000 ? code : '';
  }

  function generateSpecialCodeCandidate(length) {
    length = length || 6;
    var code = '';
    for (var i = 0; i < length; i++) {
      if (i % 2 === 0) {
        code += SPECIAL_CODE_LETTERS[Math.floor(Math.random() * SPECIAL_CODE_LETTERS.length)];
      } else {
        code += SPECIAL_CODE_DIGITS[Math.floor(Math.random() * SPECIAL_CODE_DIGITS.length)];
      }
    }
    return code;
  }

  function isStudentCode(code) {
    return !!registreCache[safeUpper(code)];
  }

  function nextAvailableSpecialCode() {
    for (var i = 0; i < 800; i++) {
      var candidate = generateSpecialCodeCandidate(6);
      if (isStudentCode(candidate)) continue;
      if (autorisationsCache[candidate]) continue;
      return candidate;
    }
    return '';
  }

  // ═══════════════════════════════════════════
  // MODAL MANAGEMENT
  // ═══════════════════════════════════════════
  function showModal(html) {
    if (elModalContent) elModalContent.innerHTML = html;
    if (elModalOverlay) elModalOverlay.classList.remove('hidden');
  }

  function closeModal() {
    if (elModalOverlay) elModalOverlay.classList.add('hidden');
    if (elModalContent) elModalContent.innerHTML = '';
  }

  // Helper: write each path individually (Firebase rules restrict multi-path updates)
  function scopedUpdate(updates) {
    var promises = [];
    Object.keys(updates).forEach(function (path) {
      var ref = firebase.database().ref(path);
      if (updates[path] === null) {
        promises.push(ref.remove());
      } else {
        promises.push(ref.set(updates[path]));
      }
    });
    return Promise.all(promises);
  }

  // Build registreCache from student_registry snapshot
  function rebuildRegistreFromRegistry(snapshot) {
    registreCache = {};
    var data = snapshot || {};
    Object.keys(data).forEach(function (code) {
      var entry = data[code];
      if (entry) {
        registreCache[code] = {
          code: code,
          classe: entry.classe || '',
          prenom: entry.prenom || '',
          nom: entry.nom || '',
          autorise: entry.autorise !== false,
          created_at: entry.created_at || 0
        };
      }
    });
  }

  // ═══════════════════════════════════════════
  // CSV PARSING & IMPORT
  // ═══════════════════════════════════════════
  function normalizeHeader(v) {
    return String(v || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  }

  function parseCsvLine(line, delimiter) {
    var values = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
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
    var semi = (headerLine.match(/;/g) || []).length;
    var comma = (headerLine.match(/,/g) || []).length;
    return semi >= comma ? ';' : ',';
  }

  function processCsvFile(file) {
    if (!file) return;
    file.text().then(function (text) {
      var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
      if (lines.length < 2) {
        setCsvStatus('CSV vide ou incomplet.', 'err');
        return;
      }

      var delimiter = detectDelimiter(lines[0]);
      var headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
      var idxClasse = headers.findIndex(function (h) { return ['classe', 'class'].indexOf(h) >= 0; });
      var idxPrenom = headers.findIndex(function (h) { return ['prenom', 'firstname', 'first_name'].indexOf(h) >= 0; });
      var idxNom = headers.findIndex(function (h) { return ['nom', 'lastname', 'last_name'].indexOf(h) >= 0; });
      var idxCode = headers.findIndex(function (h) { return ['code', 'acccode', 'codeacc', 'code_acc'].indexOf(h) >= 0; });

      if (idxClasse < 0 || idxPrenom < 0 || idxNom < 0) {
        setCsvStatus('En-tetes CSV attendus : classe, prenom, nom (code optionnel).', 'err');
        return;
      }

      var rows = [];
      for (var i = 1; i < lines.length; i++) {
        var cols = parseCsvLine(lines[i], delimiter);
        var classe = String(cols[idxClasse] || '').trim();
        var prenom = String(cols[idxPrenom] || '').trim();
        var nom = String(cols[idxNom] || '').trim();
        if (!classe || (!prenom && !nom)) continue;
        rows.push({
          classe: classe,
          prenom: prenom,
          nom: nom,
          code: idxCode >= 0 ? normalizeCode(cols[idxCode] || '') : ''
        });
      }

      if (!rows.length) {
        setCsvStatus('Aucune ligne eleve exploitable dans le CSV.', 'err');
        return;
      }

      // Build preview
      csvPendingRows = rows;
      var classCounts = {};
      rows.forEach(function (r) {
        classCounts[r.classe] = (classCounts[r.classe] || 0) + 1;
      });

      var html = '<strong>Apercu : ' + rows.length + ' eleve' + (rows.length > 1 ? 's' : '') +
        ', ' + Object.keys(classCounts).length + ' classe' + (Object.keys(classCounts).length > 1 ? 's' : '') + '</strong>';
      html += '<div class="classe-summary">';
      Object.keys(classCounts).sort().forEach(function (c) {
        html += '<span class="classe-chip">' + escapeHtml(c) + ' : ' + classCounts[c] + '</span>';
      });
      html += '</div>';

      if (elCsvPreviewContent) elCsvPreviewContent.innerHTML = html;
      if (elCsvPreview) elCsvPreview.classList.remove('hidden');
      setCsvStatus('', '');
    }).catch(function (e) {
      console.error(e);
      setCsvStatus('Erreur lors de la lecture du CSV.', 'err');
    });
  }

  function importCsvToFirebase() {
    if (!csvPendingRows || !csvPendingRows.length) {
      setCsvStatus('Aucune donnee a importer.', 'err');
      return;
    }
    if (!unlocked) {
      setCsvStatus('Deverrouille le cockpit pour importer.', 'err');
      return;
    }

    var rows = csvPendingRows;
    var updates = {};
    var now = Date.now();
    var generated = 0;
    var reused = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var code = row.code || '';
      if (!code) {
        code = generateStudentCode();
        if (!code) {
          setCsvStatus('Impossible de generer un code unique (trop de collisions).', 'err');
          return;
        }
        generated++;
      } else {
        if (registreCache[code]) {
          reused++;
          continue; // Skip existing codes
        }
      }

      // Write to student registry (source of truth)
      updates[REF_STUDENT_REGISTRY + '/' + code] = {
        classe: row.classe,
        prenom: row.prenom || '',
        nom: row.nom || '',
        autorise: true,
        created_at: now,
        created_by: 'csv_import',
        updated_at: now
      };
      // Write to autorisations (for student app backward compat)
      updates[REF_AUTORISATIONS + '/' + code] = {
        autorise: true,
        is_student: true
      };
    }

    var newCount = Object.keys(updates).filter(function (k) { return k.indexOf(REF_STUDENT_REGISTRY) === 0; }).length;
    if (newCount === 0) {
      setCsvStatus('Tous les codes existent deja. Rien a importer.', 'err');
      csvPendingRows = null;
      if (elCsvPreview) elCsvPreview.classList.add('hidden');
      return;
    }

    scopedUpdate(updates).then(function () {
      var msg = newCount + ' eleve' + (newCount > 1 ? 's' : '') + ' importe' + (newCount > 1 ? 's' : '') + '.';
      if (generated > 0) msg += ' ' + generated + ' code' + (generated > 1 ? 's' : '') + ' genere' + (generated > 1 ? 's' : '') + '.';
      if (reused > 0) msg += ' ' + reused + ' deja existant' + (reused > 1 ? 's' : '') + '.';
      setCsvStatus(msg, 'ok');
      csvPendingRows = null;
      if (elCsvPreview) elCsvPreview.classList.add('hidden');
      if (elCsvFileInput) elCsvFileInput.value = '';
    }).catch(function (e) {
      console.error(e);
      setCsvStatus('Erreur Firebase lors de l\'import.', 'err');
    });
  }

  function cancelCsvImport() {
    csvPendingRows = null;
    if (elCsvPreview) elCsvPreview.classList.add('hidden');
    if (elCsvFileInput) elCsvFileInput.value = '';
    setCsvStatus('', '');
  }

  // ═══════════════════════════════════════════
  // STUDENT CRUD
  // ═══════════════════════════════════════════
  function showAddStudentModal() {
    if (!unlocked) {
      setUnlockStatus('Deverrouille le cockpit pour ajouter un eleve.', false);
      return;
    }
    var suggestedCode = generateStudentCode();
    showModal(
      '<h3>Ajouter un eleve</h3>' +
      '<div class="form-group"><label>Classe</label><input class="input" id="modal-classe" type="text" placeholder="Ex: B1AGO1" maxlength="20"></div>' +
      '<div class="form-group"><label>Prenom</label><input class="input" id="modal-prenom" type="text" placeholder="Prenom" maxlength="60"></div>' +
      '<div class="form-group"><label>Nom</label><input class="input" id="modal-nom" type="text" placeholder="Nom" maxlength="60"></div>' +
      '<div class="form-group"><label>Code (auto-genere, modifiable)</label><input class="input" id="modal-code" type="text" value="' + escapeHtml(suggestedCode) + '" maxlength="16"></div>' +
      '<p class="status" id="modal-status"></p>' +
      '<div class="modal-actions">' +
        '<button class="btn" id="modal-cancel">Annuler</button>' +
        '<button class="btn success" id="modal-confirm">Creer</button>' +
      '</div>'
    );

    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm').addEventListener('click', function () {
      var classe = String(document.getElementById('modal-classe').value || '').trim();
      var prenom = String(document.getElementById('modal-prenom').value || '').trim();
      var nom = String(document.getElementById('modal-nom').value || '').trim();
      var code = normalizeCode(document.getElementById('modal-code').value || '');
      var statusEl = document.getElementById('modal-status');

      if (!classe) { setStatus(statusEl, 'La classe est obligatoire.', 'err'); return; }
      if (!prenom && !nom) { setStatus(statusEl, 'Le prenom ou le nom est obligatoire.', 'err'); return; }
      if (!code || code.length < 2) { setStatus(statusEl, 'Le code doit faire au moins 2 caracteres.', 'err'); return; }
      if (registreCache[code]) { setStatus(statusEl, 'Ce code existe deja.', 'err'); return; }

      var now = Date.now();
      var updates = {};
      // Write to student registry (source of truth)
      updates[REF_STUDENT_REGISTRY + '/' + code] = {
        classe: classe,
        prenom: prenom,
        nom: nom,
        autorise: true,
        created_at: now,
        created_by: 'enseignant',
        updated_at: now
      };
      // Write to autorisations (for student app backward compat)
      updates[REF_AUTORISATIONS + '/' + code] = {
        autorise: true,
        is_student: true
      };

      scopedUpdate(updates).then(function () {
        closeModal();
        setUnlockStatus('Eleve ' + code + ' cree.', true);
      }).catch(function (e) {
        console.error(e);
        setStatus(statusEl, 'Erreur Firebase.', 'err');
      });
    });
  }

  function showChangeCodeModal(oldCode) {
    if (!unlocked) return;
    var student = registreCache[oldCode];
    if (!student) return;
    var newSuggested = generateStudentCode();

    showModal(
      '<h3>Modifier le code</h3>' +
      '<p class="muted">Eleve : ' + escapeHtml(student.prenom || '') + ' ' + escapeHtml(student.nom || '') + ' (' + escapeHtml(student.classe) + ')</p>' +
      '<p class="muted">Code actuel : <strong>' + escapeHtml(oldCode) + '</strong></p>' +
      '<div class="form-group"><label>Nouveau code</label><input class="input" id="modal-new-code" type="text" value="' + escapeHtml(newSuggested) + '" maxlength="16"></div>' +
      '<p class="status" id="modal-status"></p>' +
      '<div class="modal-actions">' +
        '<button class="btn" id="modal-cancel">Annuler</button>' +
        '<button class="btn primary" id="modal-confirm">Changer le code</button>' +
      '</div>'
    );

    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm').addEventListener('click', function () {
      var newCode = normalizeCode(document.getElementById('modal-new-code').value || '');
      var statusEl = document.getElementById('modal-status');

      if (!newCode || newCode.length < 2) { setStatus(statusEl, 'Code trop court.', 'err'); return; }
      if (newCode === oldCode) { setStatus(statusEl, 'Meme code qu\'avant.', 'err'); return; }
      if (registreCache[newCode] || autorisationsCache[newCode]) { setStatus(statusEl, 'Ce code est deja utilise.', 'err'); return; }

      setStatus(statusEl, 'Migration en cours...', '');

      changeStudentCode(oldCode, newCode).then(function () {
        closeModal();
        setUnlockStatus('Code ' + oldCode + ' → ' + newCode + ' migre.', true);
      }).catch(function (e) {
        console.error(e);
        setStatus(statusEl, 'Erreur : ' + (e.message || 'Firebase'), 'err');
      });
    });
  }

  function changeStudentCode(oldCode, newCode) {
    var student = registreCache[oldCode];
    if (!student) return Promise.reject(new Error('Eleve introuvable'));

    var old = safeUpper(oldCode);
    var nw = safeUpper(newCode);
    var now = Date.now();
    var updates = {};

    // 1. Move student registry entry
    var regEntry = {};
    Object.keys(student).forEach(function (k) { regEntry[k] = student[k]; });
    regEntry.code = nw;
    regEntry.updated_at = now;
    updates[REF_STUDENT_REGISTRY + '/' + nw] = regEntry;
    updates[REF_STUDENT_REGISTRY + '/' + old] = null;

    // 2. Move autorisation entry (for student app backward compat)
    updates[REF_AUTORISATIONS + '/' + nw] = {
      autorise: student.autorise !== false,
      is_student: true
    };
    updates[REF_AUTORISATIONS + '/' + old] = null;

    // 3. Copy eleve data (objectives etc.)
    var dataCode = getEleveDataCode(old);
    var eleveData = elevesCache[dataCode] || elevesCache[old];
    if (eleveData) {
      updates[REF_ELEVES + '/' + nw] = eleveData;
      updates[REF_ELEVES + '/' + dataCode] = null;
      if (dataCode !== old) updates[REF_ELEVES + '/' + old] = null;
    }

    return scopedUpdate(updates);
  }

  function deleteStudent(code) {
    if (!unlocked) return;
    if (!registreCache[code]) return;
    if (!confirm('Supprimer l\'eleve ' + code + ' ? Ses donnees seront perdues.')) return;

    var dataCode = getEleveDataCode(code);
    var updates = {};
    updates[REF_STUDENT_REGISTRY + '/' + code] = null;
    updates[REF_AUTORISATIONS + '/' + code] = null;
    updates[REF_ELEVES + '/' + code] = null;
    if (dataCode && dataCode !== code) {
      updates[REF_ELEVES + '/' + dataCode] = null;
    }

    scopedUpdate(updates).then(function () {
      setUnlockStatus('Eleve ' + code + ' supprime.', true);
      if (selectedAccCode === code) {
        selectedAccCode = null;
        if (elDetailSection) elDetailSection.style.display = 'none';
      }
    }).catch(function (e) {
      console.error(e);
      setUnlockStatus('Erreur lors de la suppression.', false);
    });
  }


  // ═══════════════════════════════════════════
  // AUTH STATE
  // ═══════════════════════════════════════════
  function getAuthState(code) {
    var c = safeUpper(code);
    // Check student registry first (source of truth for students)
    var reg = registreCache[c];
    if (reg) return reg.autorise !== false;
    // Fall back to autorisationsCache for special codes
    var a = autorisationsCache[c];
    return !!(a && a.autorise === true);
  }

  function setAuthState(accCode, autorise) {
    if (!unlocked) {
      setUnlockStatus('Deverrouille le cockpit pour modifier les acces.', false);
      return Promise.resolve();
    }
    var c = safeUpper(accCode);
    var now = Date.now();
    var updates = {};
    // Always write to autorisations (for student app + special codes)
    updates[REF_AUTORISATIONS + '/' + c + '/autorise'] = !!autorise;
    updates[REF_AUTORISATIONS + '/' + c + '/updated_at'] = now;
    // Also write to student registry if this is a student
    if (registreCache[c]) {
      updates[REF_STUDENT_REGISTRY + '/' + c + '/autorise'] = !!autorise;
      updates[REF_STUDENT_REGISTRY + '/' + c + '/updated_at'] = now;
    }
    return scopedUpdate(updates);
  }

  function getEleveDataCode(code) {
    return safeUpper(code);
  }

  function getEleveData(code) {
    var c = safeUpper(code);
    var dataCode = getEleveDataCode(c);
    return elevesCache[c] || elevesCache[dataCode] || {};
  }

  // ═══════════════════════════════════════════
  // TEACHER CODE MANAGEMENT
  // ═══════════════════════════════════════════
  function decodedUnlockCodes() {
    return UNLOCK_CODES_B64.map(function (v) {
      try { return normalizeCode(atob(v)); } catch (_e) { return ''; }
    }).filter(Boolean);
  }

  function isValidTeacherCode(entered) {
    var norm = normalizeCode(entered);
    if (!norm) return false;
    // Check Firebase custom codes first
    if (teacherCodesCache.some(function (c) { return normalizeCode(c) === norm; })) return true;
    // Fallback to hardcoded codes
    if (decodedUnlockCodes().indexOf(norm) >= 0) return true;
    return false;
  }

  function unlockCockpit() {
    var entered = normalizeCode(elTeacherCode ? elTeacherCode.value : '');
    if (!entered) {
      setUnlockStatus('Saisis le code enseignant.', false);
      return;
    }
    if (!isValidTeacherCode(entered)) {
      setUnlockStatus('Code enseignant incorrect.', false);
      if (elTeacherCode) elTeacherCode.value = '';
      return;
    }
    unlocked = true;
    sessionStorage.setItem(SESSION_UNLOCK_KEY, '1');
    setUnlockStatus('Cockpit deverrouille.', true);
    if (elTeacherCode) elTeacherCode.value = '';
    if (btnChangeTeacherCode) btnChangeTeacherCode.style.display = '';
    renderListeEleves();
    renderSpecialStatuses();
    syncWriteStates();
  }

  function showChangeTeacherCodeModal() {
    if (!unlocked) return;
    showModal(
      '<h3>Modifier le code enseignant</h3>' +
      '<div class="form-group"><label>Ancien code</label><input class="input" id="modal-old-code" type="password" maxlength="32"></div>' +
      '<div class="form-group"><label>Nouveau code (min. 6 caracteres)</label><input class="input" id="modal-new-code" type="text" maxlength="32"></div>' +
      '<div class="form-group"><label>Confirmer le nouveau code</label><input class="input" id="modal-confirm-code" type="text" maxlength="32"></div>' +
      '<p class="status" id="modal-status"></p>' +
      '<div class="modal-actions">' +
        '<button class="btn" id="modal-cancel">Annuler</button>' +
        '<button class="btn primary" id="modal-confirm">Modifier</button>' +
      '</div>'
    );

    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-confirm').addEventListener('click', function () {
      var oldCode = String(document.getElementById('modal-old-code').value || '').trim();
      var newCode = String(document.getElementById('modal-new-code').value || '').trim();
      var confirmCode = String(document.getElementById('modal-confirm-code').value || '').trim();
      var statusEl = document.getElementById('modal-status');

      if (!isValidTeacherCode(oldCode)) {
        setStatus(statusEl, 'Ancien code incorrect.', 'err');
        return;
      }
      if (newCode.length < 6) {
        setStatus(statusEl, 'Le nouveau code doit faire au moins 6 caracteres.', 'err');
        return;
      }
      if (newCode !== confirmCode) {
        setStatus(statusEl, 'Les deux codes ne correspondent pas.', 'err');
        return;
      }

      firebase.database().ref(REF_TEACHER_CODES).set({
        codes: [newCode],
        updated_at: Date.now()
      }).then(function () {
        teacherCodesCache = [newCode];
        closeModal();
        setUnlockStatus('Code enseignant modifie.', true);
      }).catch(function (e) {
        console.error(e);
        setStatus(statusEl, 'Erreur Firebase.', 'err');
      });
    });
  }

  // ═══════════════════════════════════════════
  // SPECIAL CODES (PROFPSE, INVITE, CUSTOM)
  // ═══════════════════════════════════════════
  function isSpecialEntry(code, data) {
    var c = safeUpper(code);
    if (RESERVED_SPECIAL_CODES.has(c)) return true;
    return !!(data && data.special === true);
  }

  function getSpecialLabel(code, data) {
    if (data && data.label) return String(data.label);
    if (code === 'PROFPSE') return 'Acces personnel enseignant';
    if (code === 'INVITE') return 'Acces invite';
    return 'Code special';
  }

  function ensureDefaultSpecialCodes() {
    if (specialDefaultsReady || ensuringSpecialDefaults) return;
    ensuringSpecialDefaults = true;

    var now = Date.now();
    var prof = autorisationsCache.PROFPSE || null;
    var invite = autorisationsCache.INVITE || null;
    var promises = [];

    if (!prof) {
      promises.push(firebase.database().ref(REF_AUTORISATIONS + '/PROFPSE').set({
        autorise: true, label: 'Acces personnel enseignant', special: true,
        userCode: 'PROFPSE', bypass_schedule: true, updated_at: now
      }));
    } else {
      var patch = {};
      if (prof.special !== true) patch.special = true;
      if (prof.bypass_schedule !== true) patch.bypass_schedule = true;
      if (!prof.userCode) patch.userCode = 'PROFPSE';
      if (!prof.label) patch.label = 'Acces personnel enseignant';
      if (Object.keys(patch).length) {
        patch.updated_at = now;
        promises.push(firebase.database().ref(REF_AUTORISATIONS + '/PROFPSE').update(patch));
      }
    }

    if (!invite) {
      promises.push(firebase.database().ref(REF_AUTORISATIONS + '/INVITE').set({
        autorise: false, label: 'Acces invite', special: true,
        userCode: 'INVITE', bypass_schedule: true, updated_at: now
      }));
    } else {
      var patchI = {};
      if (invite.special !== true) patchI.special = true;
      if (invite.bypass_schedule !== true) patchI.bypass_schedule = true;
      if (!invite.userCode) patchI.userCode = 'INVITE';
      if (!invite.label) patchI.label = 'Acces invite';
      if (Object.keys(patchI).length) {
        patchI.updated_at = now;
        promises.push(firebase.database().ref(REF_AUTORISATIONS + '/INVITE').update(patchI));
      }
    }

    Promise.all(promises).then(function () {
      specialDefaultsReady = true;
    }).catch(function (e) {
      console.error('Impossible de garantir les codes speciaux par defaut', e);
    }).finally(function () {
      ensuringSpecialDefaults = false;
    });
  }

  function createSpecialCode() {
    if (!unlocked) {
      setSpecialCreateStatus('Deverrouille le cockpit pour creer un code.', 'err');
      return;
    }
    var label = String(elSpecialLabel ? elSpecialLabel.value : '').trim() || 'Code special';
    var code = normalizeCode(elSpecialCode ? elSpecialCode.value : '');
    if (!code) code = nextAvailableSpecialCode();
    if (!code) {
      setSpecialCreateStatus('Impossible de generer un code libre.', 'err');
      return;
    }
    if (!/^[A-Z0-9]{4,16}$/.test(code)) {
      setSpecialCreateStatus('Le code doit contenir 4 a 16 caracteres alphanumeriques.', 'err');
      return;
    }
    if (isStudentCode(code)) {
      setSpecialCreateStatus('Ce code existe deja pour un eleve.', 'err');
      return;
    }

    firebase.database().ref(REF_AUTORISATIONS + '/' + code).update({
      autorise: true, special: true, label: label,
      userCode: code, bypass_schedule: true, updated_at: Date.now()
    }).then(function () {
      // Subscribe to this new special code for live updates
      subscribeSpecialCode(code);
      if (elSpecialCode) elSpecialCode.value = code;
      if (elSpecialLabel) elSpecialLabel.value = '';
      setSpecialCreateStatus('Code ' + code + ' cree et active.', 'ok');
    }).catch(function (e) {
      console.error(e);
      setSpecialCreateStatus('Erreur lors de la creation du code special.', 'err');
    });
  }

  function renderSpecialCodesManager() {
    if (!elSpecialCodesList) return;
    elSpecialCodesList.innerHTML = '';
    if (btnGenerateSpecial) btnGenerateSpecial.disabled = !unlocked;
    if (btnCreateSpecial) btnCreateSpecial.disabled = !unlocked;
    if (elSpecialLabel) elSpecialLabel.disabled = !unlocked;
    if (elSpecialCode) elSpecialCode.disabled = !unlocked;

    var entries = Object.keys(autorisationsCache)
      .filter(function (code) {
        var upper = safeUpper(code);
        if (isStudentCode(upper)) return false;
        return isSpecialEntry(upper, autorisationsCache[code]);
      })
      .sort()
      .map(function (code) { return { code: safeUpper(code), data: autorisationsCache[code] || {} }; });

    if (!entries.length) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" class="muted">Aucun code special enregistre.</td>';
      elSpecialCodesList.appendChild(tr);
      return;
    }

    entries.forEach(function (entry) {
      var code = entry.code;
      var data = entry.data;
      var label = getSpecialLabel(code, data);
      var allowed = getAuthState(code);
      var isReserved = RESERVED_SPECIAL_CODES.has(code);
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + escapeHtml(code) + '</strong></td>' +
        '<td>' + escapeHtml(label) + '</td>' +
        '<td><span class="badge ' + (allowed ? 'ok' : 'no') + '">' + (allowed ? 'Actif' : 'Suspendu') + '</span></td>' +
        '<td>' +
          '<button class="btn small ' + (allowed ? 'danger' : 'success') + '" data-action="toggle" ' + (unlocked ? '' : 'disabled') + '>' + (allowed ? 'Suspendre' : 'Activer') + '</button> ' +
          '<button class="btn small" data-action="copy">Copier</button> ' +
          '<button class="btn small" data-action="delete" ' + (!unlocked || isReserved ? 'disabled' : '') + '>Supprimer</button>' +
        '</td>';

      tr.querySelector('[data-action="toggle"]').addEventListener('click', function () {
        setAuthState(code, !allowed).catch(function (e) {
          console.error(e);
          setSpecialCreateStatus('Erreur de mise a jour pour ' + code + '.', 'err');
        });
      });

      tr.querySelector('[data-action="copy"]').addEventListener('click', function () {
        navigator.clipboard.writeText(code).then(function () {
          setSpecialCreateStatus('Code ' + code + ' copie.', 'ok');
        }).catch(function () {
          setSpecialCreateStatus('Copie impossible automatiquement.', 'err');
        });
      });

      tr.querySelector('[data-action="delete"]').addEventListener('click', function () {
        if (isReserved || !unlocked) return;
        if (!confirm('Supprimer le code ' + code + ' ?')) return;
        firebase.database().ref(REF_AUTORISATIONS + '/' + code).remove().then(function () {
          setSpecialCreateStatus('Code ' + code + ' supprime.', 'ok');
        }).catch(function (e) {
          console.error(e);
          setSpecialCreateStatus('Erreur lors de la suppression de ' + code + '.', 'err');
        });
      });

      elSpecialCodesList.appendChild(tr);
    });
  }

  function renderSpecialStatuses() {
    renderSpecialCodesManager();
    syncWriteStates();
    renderCustomGlobalList();
    renderCustomEleveList();
  }

  // ═══════════════════════════════════════════
  // SCHEDULE MANAGEMENT
  // ═══════════════════════════════════════════
  function defaultScheduleTemplate() {
    var base = {};
    SCHEDULE_DAYS.forEach(function (d) {
      base[d.key] = { actif: true, debut: '00:00', fin: '23:59' };
    });
    return base;
  }

  function normalizeSchedule(raw) {
    var base = defaultScheduleTemplate();
    if (!raw || typeof raw !== 'object') return base;
    SCHEDULE_DAYS.forEach(function (d) {
      var current = raw[d.key] || {};
      base[d.key] = {
        actif: current.actif === true,
        debut: normalizeTime(current.debut, '00:00'),
        fin: normalizeTime(current.fin, '23:59')
      };
    });
    return base;
  }

  function renderScheduleTable(bodyEl, scheduleObj) {
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    SCHEDULE_DAYS.forEach(function (d) {
      var day = scheduleObj[d.key] || { actif: true, debut: '00:00', fin: '23:59' };
      var tr = document.createElement('tr');
      tr.dataset.day = d.key;
      tr.innerHTML =
        '<td>' + escapeHtml(d.label) + '</td>' +
        '<td><input type="checkbox" class="schedule-active" ' + (day.actif ? 'checked' : '') + '></td>' +
        '<td><input type="time" class="input schedule-time schedule-start" value="' + escapeHtml(day.debut) + '"></td>' +
        '<td><input type="time" class="input schedule-time schedule-end" value="' + escapeHtml(day.fin) + '"></td>';
      bodyEl.appendChild(tr);
    });
  }

  function collectScheduleTable(bodyEl) {
    var out = {};
    if (!bodyEl) return out;
    bodyEl.querySelectorAll('tr[data-day]').forEach(function (tr) {
      var day = tr.dataset.day;
      if (!day) return;
      var active = !!tr.querySelector('.schedule-active');
      active = active && tr.querySelector('.schedule-active').checked;
      var debut = normalizeTime(tr.querySelector('.schedule-start') ? tr.querySelector('.schedule-start').value : '', '00:00');
      var fin = normalizeTime(tr.querySelector('.schedule-end') ? tr.querySelector('.schedule-end').value : '', '23:59');
      out[day] = { actif: active, debut: debut, fin: fin };
    });
    return out;
  }

  function validateSchedule(horaires) {
    for (var i = 0; i < SCHEDULE_DAYS.length; i++) {
      var day = SCHEDULE_DAYS[i];
      var slot = horaires[day.key];
      if (!slot || slot.actif !== true) continue;
      if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(slot.debut) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(slot.fin)) {
        return 'Format horaire invalide pour ' + day.label + '.';
      }
      if (timeToMinutes(slot.fin) <= timeToMinutes(slot.debut)) {
        return 'La fin doit etre apres le debut pour ' + day.label + '.';
      }
    }
    return '';
  }

  function scheduleTargetCode() {
    return normalizeCode(elScheduleCode ? elScheduleCode.value : '').slice(0, 16);
  }

  function setScheduleCodeValue(code) {
    if (elScheduleCode) elScheduleCode.value = safeUpper(code).slice(0, 16);
  }

  function loadGlobalSchedule() {
    firebase.database().ref(REF_HORAIRES_GLOBAL).once('value').then(function (snap) {
      if (!snap.exists()) {
        renderScheduleTable(elGlobalScheduleBody, defaultScheduleTemplate());
        setStatus(elGlobalScheduleStatus, 'Aucun cadre global enregistre (acces continu).', '');
        return;
      }
      renderScheduleTable(elGlobalScheduleBody, normalizeSchedule(snap.val()));
      setStatus(elGlobalScheduleStatus, 'Cadre global charge.', 'ok');
    }).catch(function (e) {
      console.error(e);
      setStatus(elGlobalScheduleStatus, 'Erreur lors du chargement.', 'err');
    });
  }

  function saveGlobalSchedule() {
    if (!unlocked) { setStatus(elGlobalScheduleStatus, 'Deverrouille le cockpit.', 'err'); return; }
    var horaires = collectScheduleTable(elGlobalScheduleBody);
    var err = validateSchedule(horaires);
    if (err) { setStatus(elGlobalScheduleStatus, err, 'err'); return; }
    firebase.database().ref(REF_HORAIRES_GLOBAL).set(horaires).then(function () {
      setStatus(elGlobalScheduleStatus, 'Cadre global enregistre.', 'ok');
    }).catch(function (e) {
      console.error(e);
      setStatus(elGlobalScheduleStatus, 'Erreur d\'enregistrement.', 'err');
    });
  }

  function clearGlobalSchedule() {
    if (!unlocked) { setStatus(elGlobalScheduleStatus, 'Deverrouille le cockpit.', 'err'); return; }
    if (!confirm('Supprimer le cadre horaire global ?')) return;
    firebase.database().ref(REF_HORAIRES_GLOBAL).remove().then(function () {
      renderScheduleTable(elGlobalScheduleBody, defaultScheduleTemplate());
      setStatus(elGlobalScheduleStatus, 'Cadre global supprime (acces continu).', 'ok');
    }).catch(function (e) {
      console.error(e);
      setStatus(elGlobalScheduleStatus, 'Erreur lors de la suppression.', 'err');
    });
  }

  function loadCodeSchedule() {
    var code = scheduleTargetCode();
    if (!/^[A-Z0-9]{2,16}$/.test(code)) {
      setStatus(elCodeScheduleStatus, 'Saisis un code valide.', 'err');
      return;
    }
    setScheduleCodeValue(code);
    firebase.database().ref(REF_AUTORISATIONS + '/' + code).once('value').then(function (snap) {
      var auth = snap.val();
      if (!auth) {
        setStatus(elCodeScheduleStatus, 'Code ' + code + ' introuvable.', 'err');
        return;
      }
      if (auth.horaires) {
        renderScheduleTable(elCodeScheduleBody, normalizeSchedule(auth.horaires));
        setStatus(elCodeScheduleStatus, 'Exception chargee pour ' + code + '.', 'ok');
      } else {
        renderScheduleTable(elCodeScheduleBody, defaultScheduleTemplate());
        setStatus(elCodeScheduleStatus, 'Aucune exception pour ' + code + '.', '');
      }
    }).catch(function (e) {
      console.error(e);
      setStatus(elCodeScheduleStatus, 'Erreur de chargement.', 'err');
    });
  }

  function saveCodeSchedule() {
    if (!unlocked) { setStatus(elCodeScheduleStatus, 'Deverrouille le cockpit.', 'err'); return; }
    var code = scheduleTargetCode();
    if (!/^[A-Z0-9]{2,16}$/.test(code)) { setStatus(elCodeScheduleStatus, 'Code invalide.', 'err'); return; }
    setScheduleCodeValue(code);
    var horaires = collectScheduleTable(elCodeScheduleBody);
    var err = validateSchedule(horaires);
    if (err) { setStatus(elCodeScheduleStatus, err, 'err'); return; }
    firebase.database().ref(REF_AUTORISATIONS + '/' + code).once('value').then(function (snap) {
      if (!snap.exists()) { setStatus(elCodeScheduleStatus, 'Code ' + code + ' introuvable.', 'err'); return; }
      return firebase.database().ref(REF_AUTORISATIONS + '/' + code).update({ horaires: horaires, updated_at: Date.now() });
    }).then(function () {
      setStatus(elCodeScheduleStatus, 'Exception enregistree pour ' + code + '.', 'ok');
    }).catch(function (e) {
      console.error(e);
      setStatus(elCodeScheduleStatus, 'Erreur d\'enregistrement.', 'err');
    });
  }

  function clearCodeSchedule() {
    if (!unlocked) { setStatus(elCodeScheduleStatus, 'Deverrouille le cockpit.', 'err'); return; }
    var code = scheduleTargetCode();
    if (!/^[A-Z0-9]{2,16}$/.test(code)) { setStatus(elCodeScheduleStatus, 'Code invalide.', 'err'); return; }
    if (!confirm('Supprimer l\'exception pour ' + code + ' ?')) return;
    firebase.database().ref(REF_AUTORISATIONS + '/' + code).update({ horaires: null, updated_at: Date.now() }).then(function () {
      renderScheduleTable(elCodeScheduleBody, defaultScheduleTemplate());
      setStatus(elCodeScheduleStatus, 'Exception supprimee pour ' + code + '.', 'ok');
    }).catch(function (e) {
      console.error(e);
      setStatus(elCodeScheduleStatus, 'Erreur de suppression.', 'err');
    });
  }

  function useSelectedCodeForSchedule() {
    if (!selectedAccCode) { setStatus(elCodeScheduleStatus, 'Selectionne un eleve d\'abord.', 'err'); return; }
    setScheduleCodeValue(selectedAccCode);
    loadCodeSchedule();
  }

  // ═══════════════════════════════════════════
  // CUSTOM LIBRARY
  // ═══════════════════════════════════════════
  function populateCompetenceSelect(el) {
    if (!el) return;
    var prev = normalizeCompetenceCode(el.value || CPS_COMPETENCES[0].code || '');
    el.innerHTML = '';
    CPS_COMPETENCES.forEach(function (comp) {
      var opt = document.createElement('option');
      opt.value = comp.code;
      opt.textContent = comp.code + ' — ' + comp.nom;
      opt.dataset.nom = comp.nom;
      el.appendChild(opt);
    });
    if (Array.from(el.options).some(function (o) { return o.value === prev; })) {
      el.value = prev;
    } else if (el.options.length) {
      el.selectedIndex = 0;
    }
  }

  function selectedCustomEleveCode() {
    return safeUpper(elCustomEleveSelect ? elCustomEleveSelect.value : '');
  }

  function renderCustomEleveOptions() {
    if (!elCustomEleveSelect) return;
    var prev = selectedCustomEleveCode();
    elCustomEleveSelect.innerHTML = '';

    var entries = Object.values(registreCache).sort(function (a, b) {
      var c = (a.classe || '').localeCompare(b.classe || '', 'fr');
      if (c !== 0) return c;
      return (a.code || '').localeCompare(b.code || '', 'fr');
    });

    entries.forEach(function (row) {
      var code = safeUpper(row.code);
      if (!code) return;
      var label = code + ' · ' + (row.classe || '');
      if (row.prenom || row.nom) label += ' · ' + ((row.prenom || '') + ' ' + (row.nom || '')).trim();
      var opt = document.createElement('option');
      opt.value = code;
      opt.textContent = label;
      elCustomEleveSelect.appendChild(opt);
    });

    if (!elCustomEleveSelect.options.length) {
      if (elCustomEleveBadge) elCustomEleveBadge.textContent = 'Code : —';
      return;
    }
    if (prev && Array.from(elCustomEleveSelect.options).some(function (o) { return safeUpper(o.value) === prev; })) {
      elCustomEleveSelect.value = prev;
    } else {
      elCustomEleveSelect.selectedIndex = 0;
    }
    refreshCustomEleveSelection();
  }

  function refreshCustomEleveBadge(code) {
    if (!elCustomEleveBadge) return;
    var c = safeUpper(code);
    elCustomEleveBadge.textContent = c ? 'Code : ' + c : 'Code : —';
  }

  function customRowsFromObject(obj) {
    return Object.keys(obj || {}).map(function (id) {
      return { id: id, data: obj[id] || {} };
    }).sort(function (a, b) {
      var ta = Number(a.data.created_at || a.data.updated_at || 0);
      var tb = Number(b.data.created_at || b.data.updated_at || 0);
      return tb - ta;
    });
  }

  function customEntryRef(scope, id, accCode) {
    if (scope === 'global') return firebase.database().ref(REF_CUSTOM_GLOBAL + '/' + id);
    return firebase.database().ref(REF_CUSTOM_PAR_ELEVE + '/' + safeUpper(accCode) + '/' + id);
  }

  function addCustomEntry(scope) {
    if (!unlocked) {
      setStatus(scope === 'global' ? elCustomGlobalStatus : elCustomEleveStatus, 'Deverrouille le cockpit.', 'err');
      return;
    }
    var isGlobal = scope === 'global';
    var textEl = isGlobal ? elCustomGlobalText : elCustomEleveText;
    var compEl = isGlobal ? elCustomGlobalCompetence : elCustomEleveCompetence;
    var ctxEl = isGlobal ? elCustomGlobalContext : elCustomEleveContext;
    var statusEl = isGlobal ? elCustomGlobalStatus : elCustomEleveStatus;

    var texte = normalizeCustomText(textEl ? textEl.value : '');
    if (!texte) { setStatus(statusEl, 'Le texte est obligatoire.', 'err'); return; }
    var compCode = normalizeCompetenceCode(compEl ? compEl.value : '');
    var comp = findCompetence(compCode);
    if (!comp) { setStatus(statusEl, 'Competence invalide.', 'err'); return; }
    var contexte = normalizeContext(ctxEl ? ctxEl.value : '');
    var now = Date.now();
    var payload = {
      texte: texte, competence_code: comp.code, competence_nom: comp.nom,
      contexte: contexte, actif: true, cree_par: 'enseignant',
      date_creation: todayISO(), created_at: now, updated_at: now
    };

    var ref;
    if (isGlobal) {
      ref = firebase.database().ref(REF_CUSTOM_GLOBAL).push();
    } else {
      var accCode = selectedCustomEleveCode();
      if (!/^[A-Z0-9]{2,16}$/.test(accCode)) { setStatus(statusEl, 'Selectionne un eleve valide.', 'err'); return; }
      ref = firebase.database().ref(REF_CUSTOM_PAR_ELEVE + '/' + accCode).push();
    }

    ref.set(payload).then(function () {
      if (textEl) textEl.value = '';
      setStatus(statusEl, 'Savoir-faire enregistre.', 'ok');
    }).catch(function (e) {
      console.error(e);
      setStatus(statusEl, 'Erreur Firebase.', 'err');
    });
  }

  function toggleCustomEntry(scope, id, nextState, accCode, statusEl) {
    if (!unlocked) { setStatus(statusEl, 'Deverrouille le cockpit.', 'err'); return; }
    customEntryRef(scope, id, accCode).update({
      actif: !!nextState, updated_at: Date.now()
    }).then(function () {
      setStatus(statusEl, nextState ? 'Active.' : 'Desactive.', 'ok');
    }).catch(function (e) {
      console.error(e);
      setStatus(statusEl, 'Erreur de mise a jour.', 'err');
    });
  }

  function saveCustomText(scope, id, textValue, accCode, statusEl) {
    if (!unlocked) { setStatus(statusEl, 'Deverrouille le cockpit.', 'err'); return Promise.resolve(false); }
    var texte = normalizeCustomText(textValue);
    if (!texte) { setStatus(statusEl, 'Le texte ne peut pas etre vide.', 'err'); return Promise.resolve(false); }
    return customEntryRef(scope, id, accCode).update({
      texte: texte, updated_at: Date.now()
    }).then(function () {
      setStatus(statusEl, 'Texte mis a jour.', 'ok');
      return true;
    }).catch(function (e) {
      console.error(e);
      setStatus(statusEl, 'Erreur de mise a jour.', 'err');
      return false;
    });
  }

  function renderCustomRows(tbody, rows, scope, accCode, statusEl) {
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!rows.length) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="5" class="muted">Aucun savoir-faire personnalise.</td>';
      tbody.appendChild(tr);
      return;
    }

    rows.forEach(function (entry) {
      var id = entry.id;
      var data = entry.data || {};
      var texte = String(data.texte || '').trim();
      var code = normalizeCompetenceCode(data.competence_code || '');
      var nom = String(data.competence_nom || '').trim();
      var contexte = normalizeContext(data.contexte || '');
      var actif = data.actif === true;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><textarea class="input custom-text-inline" rows="3" disabled>' + escapeHtml(texte) + '</textarea></td>' +
        '<td><strong>' + escapeHtml(code || '—') + '</strong><br><span class="muted">' + escapeHtml(nom || '—') + '</span></td>' +
        '<td>' + escapeHtml(contexte) + '</td>' +
        '<td><span class="badge ' + (actif ? 'ok' : 'no') + '">' + (actif ? 'Actif' : 'Inactif') + '</span></td>' +
        '<td><div class="custom-actions">' +
          '<button class="btn small" data-action="toggle" ' + (unlocked ? '' : 'disabled') + '>' + (actif ? '&#128308; Desactiver' : '&#128994; Activer') + '</button>' +
          '<button class="btn small" data-action="edit" ' + (unlocked ? '' : 'disabled') + '>&#9999;&#65039; Modifier</button>' +
          '<button class="btn small hidden" data-action="cancel" ' + (unlocked ? '' : 'disabled') + '>Annuler</button>' +
        '</div></td>';

      var textArea = tr.querySelector('.custom-text-inline');
      var btnToggle = tr.querySelector('[data-action="toggle"]');
      var btnEdit = tr.querySelector('[data-action="edit"]');
      var btnCancel = tr.querySelector('[data-action="cancel"]');
      var originalText = texte;

      if (btnToggle) btnToggle.addEventListener('click', function () {
        toggleCustomEntry(scope, id, !actif, accCode, statusEl);
      });

      if (btnEdit && textArea) btnEdit.addEventListener('click', function () {
        if (textArea.disabled) {
          textArea.disabled = false;
          textArea.focus();
          textArea.selectionStart = textArea.value.length;
          btnEdit.textContent = '💾 Enregistrer';
          if (btnCancel) btnCancel.classList.remove('hidden');
          return;
        }
        saveCustomText(scope, id, textArea.value, accCode, statusEl).then(function (saved) {
          if (saved) {
            textArea.disabled = true;
            btnEdit.textContent = '✏️ Modifier';
            if (btnCancel) btnCancel.classList.add('hidden');
          }
        });
      });

      if (btnCancel && textArea) btnCancel.addEventListener('click', function () {
        textArea.value = originalText;
        textArea.disabled = true;
        btnCancel.classList.add('hidden');
        if (btnEdit) btnEdit.textContent = '✏️ Modifier';
      });

      tbody.appendChild(tr);
    });
  }

  function renderCustomGlobalList() {
    renderCustomRows(elCustomGlobalList, customRowsFromObject(customGlobalCache), 'global', '', elCustomGlobalStatus);
  }

  function renderCustomEleveList() {
    renderCustomRows(elCustomEleveList, customRowsFromObject(customEleveCache), 'eleve', selectedCustomEleveCode(), elCustomEleveStatus);
  }

  function unsubscribeCustomEleve() {
    if (customEleveSubPath && customEleveSubHandler) {
      firebase.database().ref(customEleveSubPath).off('value', customEleveSubHandler);
    }
    customEleveSubPath = '';
    customEleveSubHandler = null;
  }

  function subscribeCustomEleve(accCode) {
    var code = safeUpper(accCode);
    unsubscribeCustomEleve();
    if (!/^[A-Z0-9]{2,16}$/.test(code)) {
      customEleveCache = {};
      renderCustomEleveList();
      return;
    }
    var path = REF_CUSTOM_PAR_ELEVE + '/' + code;
    customEleveSubPath = path;
    customEleveSubHandler = function (snap) {
      customEleveCache = snap.val() || {};
      renderCustomEleveList();
    };
    firebase.database().ref(path).on('value', customEleveSubHandler);
  }

  function refreshCustomEleveSelection() {
    var code = selectedCustomEleveCode();
    refreshCustomEleveBadge(code);
    subscribeCustomEleve(code);
  }

  function subscribeCustomGlobal() {
    firebase.database().ref(REF_CUSTOM_GLOBAL).on('value', function (snap) {
      customGlobalCache = snap.val() || {};
      renderCustomGlobalList();
    });
  }

  // ═══════════════════════════════════════════
  // QR SCANNER
  // ═══════════════════════════════════════════
  function confirmAndMarkGoalFromQr(rec) {
    if (!rec || rec.flux !== 1 || !rec.eleve || !rec.objectif) return Promise.resolve();

    var eleveCode = safeUpper(rec.eleve);
    var candidateCodes = [getEleveDataCode(eleveCode), eleveCode]
      .map(safeUpper).filter(Boolean)
      .filter(function (code, idx, arr) { return arr.indexOf(code) === idx; });

    var goalRef = null;
    var snapVal = null;

    function tryCode(i) {
      if (i >= candidateCodes.length) {
        setUnlockStatus('Scan enregistre, mais objectif introuvable (' + eleveCode + ').', false);
        return Promise.resolve();
      }
      var ref = firebase.database().ref(REF_ELEVES + '/' + candidateCodes[i] + '/objectifs/' + rec.objectif);
      return ref.once('value').then(function (snap) {
        if (snap.exists()) {
          goalRef = ref;
          snapVal = snap.val() || {};
          return;
        }
        return tryCode(i + 1);
      });
    }

    return tryCode(0).then(function () {
      if (!goalRef || !snapVal) return;

      var titre = String(snapVal.titre || rec.objectif || 'objectif').trim();
      var shortTitle = titre.length > 80 ? titre.slice(0, 77) + '...' : titre;
      if (!confirm('Valider l\'objectif "' + shortTitle + '" pour ' + eleveCode + ' ?')) {
        setUnlockStatus('Scan enregistre sans validation finale.', false);
        return;
      }

      var patch = {
        validated_via_qr: true, validated_by: 'enseignant_qr',
        validated_at: Date.now(), updated_at: Date.now()
      };
      if (snapVal.done !== true) {
        patch.done = true;
        patch.date_done = new Date().toISOString();
      }

      return goalRef.update(patch).then(function () {
        return goalRef.child('historique').push({
          action: 'Valide par enseignant (scan QR cockpit)',
          date: new Date().toISOString()
        });
      }).then(function () {
        setUnlockStatus('Objectif valide pour ' + eleveCode + '.', true);
        if (selectedAccCode && safeUpper(selectedAccCode) === eleveCode) openEleve(eleveCode);
      });
    });
  }

  function initQrScanner() {
    var containerId = 'qr-reader';
    var el = document.getElementById(containerId);
    if (!el) return;

    if (!window.isSecureContext && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
      setUnlockStatus('Le scan QR necessite HTTPS.', false);
    }

    if (typeof Html5QrcodeScanner === 'undefined') {
      console.warn('Html5QrcodeScanner indisponible');
      return;
    }

    var scanner = new Html5QrcodeScanner(containerId, { fps: 10, qrbox: 220 });
    var cameraErrorNotified = false;

    scanner.render(
      function (decodedText) {
        if (!unlocked) { setUnlockStatus('Deverrouille le cockpit avant de scanner.', false); return; }
        var now = Date.now();
        if (decodedText === lastScanText && now - lastScanAt < SCAN_DUPLICATE_COOLDOWN_MS) return;
        lastScanText = decodedText;
        lastScanAt = now;

        try {
          var payload = JSON.parse(decodedText);
          var fluxNum = Number(payload && payload.flux);
          var rec = {
            eleve: safeUpper(payload && payload.eleve).slice(0, 16),
            flux: fluxNum === 2 ? 2 : 1,
            competence: safeUpper((payload && payload.competence) || (payload && payload.type_reconnaissance) || '').slice(0, 32),
            type_reconnaissance: safeUpper(payload && payload.type_reconnaissance).slice(0, 32),
            objectif: String((payload && payload.objectif) || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80),
            cadre: String((payload && payload.cadre) || '').slice(0, 64),
            timestamp: Number(payload && payload.timestamp) || Date.now(),
            created_at: Date.now(),
            source: 'cockpit'
          };
          if (!rec.eleve) { setUnlockStatus('QR invalide : code eleve manquant.', false); return; }
          if (rec.flux === 1 && !rec.objectif) { setUnlockStatus('QR objectif invalide.', false); return; }

          firebase.database().ref(REF_VALIDATIONS).push(rec).then(function () {
            if (rec.flux === 1) {
              return confirmAndMarkGoalFromQr(rec);
            } else {
              setUnlockStatus('Scan enregistre (' + rec.eleve + ' · flux ' + rec.flux + ').', true);
            }
          }).catch(function (writeErr) {
            var message = String(writeErr && writeErr.message ? writeErr.message : '');
            console.error('Erreur Firebase (scan QR)', writeErr);
            if (/permission_denied/i.test(message)) {
              setUnlockStatus('Scan refuse par Firebase (permissions).', false);
            } else {
              setUnlockStatus('Scan enregistrement impossible.', false);
            }
          });
        } catch (e) {
          console.error('Erreur de traitement QR', e);
          if (e instanceof SyntaxError) {
            setUnlockStatus('QR invalide (format JSON attendu).', false);
          } else {
            setUnlockStatus('Erreur pendant le traitement du scan.', false);
          }
        }
      },
      function (scanErr) {
        if (cameraErrorNotified) return;
        var msg = String(scanErr || '').toLowerCase();
        if (msg.indexOf('notallowed') >= 0 || msg.indexOf('permission') >= 0 || msg.indexOf('denied') >= 0) {
          setUnlockStatus('Camera refusee : autorise l\'acces camera.', false);
          cameraErrorNotified = true;
        }
        if (msg.indexOf('secure') >= 0 || msg.indexOf('https') >= 0) {
          setUnlockStatus('Le scan QR necessite HTTPS.', false);
          cameraErrorNotified = true;
        }
      }
    );
  }

  // ═══════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════
  function getClasses() {
    var set = new Set();
    Object.values(registreCache).forEach(function (e) { if (e.classe) set.add(e.classe); });
    return Array.from(set).sort();
  }

  function filteredStudents() {
    var current = elClasseFilter ? elClasseFilter.value : 'ALL';
    var entries = Object.values(registreCache);
    if (current && current !== 'ALL') {
      entries = entries.filter(function (e) { return e.classe === current; });
    }
    return entries.sort(function (a, b) {
      var c = (a.classe || '').localeCompare(b.classe || '', 'fr');
      if (c !== 0) return c;
      var n = (a.nom || '').localeCompare(b.nom || '', 'fr');
      if (n !== 0) return n;
      return (a.code || '').localeCompare(b.code || '', 'fr');
    });
  }

  function renderFilters() {
    if (!elClasseFilter) return;
    var classes = getClasses();
    var prev = elClasseFilter.value || 'ALL';
    elClasseFilter.innerHTML = '<option value="ALL">Toutes les classes</option>';
    classes.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      elClasseFilter.appendChild(opt);
    });
    elClasseFilter.value = (classes.indexOf(prev) >= 0 || prev === 'ALL') ? prev : 'ALL';
    renderBulkActions();
  }

  function renderBulkActions() {
    var current = elClasseFilter ? elClasseFilter.value : 'ALL';
    if (current === 'ALL' || !elBulkActions) {
      if (elBulkActions) elBulkActions.classList.add('hidden');
      return;
    }
    elBulkActions.classList.remove('hidden');
    if (elBulkLabel) {
      var count = Object.values(registreCache).filter(function (e) { return e.classe === current; }).length;
      elBulkLabel.textContent = 'Classe ' + current + ' (' + count + ' eleves)';
    }
  }

  function displayName(entry) {
    if (!entry) return '—';
    var full = ((entry.prenom || '') + ' ' + (entry.nom || '')).trim();
    return full || '—';
  }

  function renderListeEleves() {
    if (!elListe) return;
    elListe.innerHTML = '';

    var list = filteredStudents();
    if (elCount) elCount.textContent = list.length + ' eleve' + (list.length > 1 ? 's' : '');
    if (btnAddStudent) btnAddStudent.disabled = !unlocked;

    if (!list.length) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="muted">Aucun eleve. Importez un CSV ou ajoutez manuellement.</td>';
      elListe.appendChild(tr);
      return;
    }

    list.forEach(function (entry, index) {
      var code = safeUpper(entry.code);
      var allowed = getAuthState(code);
      var tr = document.createElement('tr');
      var actionDisabled = unlocked ? '' : 'disabled';

      tr.innerHTML =
        '<td>' + (index + 1) + '</td>' +
        '<td>' + escapeHtml(entry.classe || '') + '</td>' +
        '<td>' + escapeHtml(displayName(entry)) + '</td>' +
        '<td><strong>' + escapeHtml(code) + '</strong></td>' +
        '<td><span class="badge ' + (allowed ? 'ok' : 'no') + '">' + (allowed ? 'Autorise' : 'Non autorise') + '</span></td>' +
        '<td>' +
          '<button class="btn small ' + (allowed ? 'danger' : 'success') + '" data-action="toggle" ' + actionDisabled + '>' + (allowed ? 'Interdire' : 'Autoriser') + '</button> ' +
          '<button class="btn small" data-action="modify" ' + actionDisabled + '>&#9999;&#65039;</button> ' +
          '<button class="btn small" data-action="delete" ' + actionDisabled + '>&#128465;&#65039;</button> ' +
          '<button class="btn small" data-action="open">Ouvrir</button>' +
        '</td>';

      tr.querySelector('[data-action="toggle"]').addEventListener('click', function () {
        setAuthState(code, !allowed).catch(function (e) {
          console.error(e);
          setUnlockStatus('Erreur de mise a jour.', false);
        });
      });

      tr.querySelector('[data-action="modify"]').addEventListener('click', function () {
        showChangeCodeModal(code);
      });

      tr.querySelector('[data-action="delete"]').addEventListener('click', function () {
        deleteStudent(code);
      });

      tr.querySelector('[data-action="open"]').addEventListener('click', function () {
        openEleve(code);
      });

      elListe.appendChild(tr);
    });
  }

  function openEleve(code) {
    var c = safeUpper(code);
    var entry = registreCache[c];
    var data = getEleveData(c);

    selectedAccCode = c;
    setScheduleCodeValue(c);
    if (elCustomEleveSelect && Array.from(elCustomEleveSelect.options).some(function (o) { return safeUpper(o.value) === c; })) {
      elCustomEleveSelect.value = c;
      refreshCustomEleveSelection();
    }

    if (elDetailSection) elDetailSection.style.display = 'block';
    if (elNomEleve) {
      var name = entry ? displayName(entry) : '—';
      elNomEleve.textContent = (name !== '—' ? name + ' · ' : '') + c + (entry ? ' · ' + entry.classe : '');
    }

    var objectifs = data.objectifs ? Object.keys(data.objectifs).length : 0;
    var meteo = data.meteo ? Object.keys(data.meteo).length : 0;
    var autorise = getAuthState(c);

    if (elDetailEleve) {
      elDetailEleve.innerHTML =
        '<div><strong>Code :</strong> ' + c + '</div>' +
        '<div><strong>Eleve :</strong> ' + escapeHtml(entry ? displayName(entry) : '—') + '</div>' +
        '<div><strong>Classe :</strong> ' + (entry ? escapeHtml(entry.classe) : '—') + '</div>' +
        '<div><strong>Acces :</strong> ' + (autorise ? 'Autorise' : 'Non autorise') + '</div>' +
        '<div><strong>Objectifs :</strong> ' + objectifs + '</div>' +
        '<div><strong>Meteo :</strong> ' + meteo + '</div>';
    }
  }

  function renderValidations(items) {
    if (!elListeValidations) return;
    elListeValidations.innerHTML = '';
    if (!items.length) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="4" class="muted">Aucune validation.</td>';
      elListeValidations.appendChild(tr);
      return;
    }
    items.forEach(function (v) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + escapeHtml(safeUpper(v.eleve)) + '</td>' +
        '<td>' + escapeHtml(String(v.flux || '')) + '</td>' +
        '<td>' + escapeHtml(safeUpper(v.competence || v.type_reconnaissance || '')) + '</td>' +
        '<td>' + escapeHtml(fmtDate(v.timestamp || v.created_at)) + '</td>';
      elListeValidations.appendChild(tr);
    });
  }

  // ═══════════════════════════════════════════
  // BULK ACTIONS
  // ═══════════════════════════════════════════
  function bulkActivate() {
    if (!unlocked) return;
    var current = elClasseFilter ? elClasseFilter.value : 'ALL';
    if (current === 'ALL') return;
    var codes = Object.values(registreCache).filter(function (e) { return e.classe === current; }).map(function (e) { return e.code; });
    if (!codes.length) return;
    if (!confirm('Activer l\'acces pour ' + codes.length + ' eleves de ' + current + ' ?')) return;

    var now = Date.now();
    var updates = {};
    codes.forEach(function (c) {
      updates[REF_STUDENT_REGISTRY + '/' + c + '/autorise'] = true;
      updates[REF_STUDENT_REGISTRY + '/' + c + '/updated_at'] = now;
      updates[REF_AUTORISATIONS + '/' + c + '/autorise'] = true;
      updates[REF_AUTORISATIONS + '/' + c + '/updated_at'] = now;
    });
    scopedUpdate(updates).then(function () {
      setUnlockStatus(codes.length + ' eleves actives.', true);
    }).catch(function (e) {
      console.error(e);
      setUnlockStatus('Erreur lors de l\'activation en masse.', false);
    });
  }

  function bulkDeactivate() {
    if (!unlocked) return;
    var current = elClasseFilter ? elClasseFilter.value : 'ALL';
    if (current === 'ALL') return;
    var codes = Object.values(registreCache).filter(function (e) { return e.classe === current; }).map(function (e) { return e.code; });
    if (!codes.length) return;
    if (!confirm('Desactiver l\'acces pour ' + codes.length + ' eleves de ' + current + ' ?')) return;

    var now = Date.now();
    var updates = {};
    codes.forEach(function (c) {
      updates[REF_STUDENT_REGISTRY + '/' + c + '/autorise'] = false;
      updates[REF_STUDENT_REGISTRY + '/' + c + '/updated_at'] = now;
      updates[REF_AUTORISATIONS + '/' + c + '/autorise'] = false;
      updates[REF_AUTORISATIONS + '/' + c + '/updated_at'] = now;
    });
    scopedUpdate(updates).then(function () {
      setUnlockStatus(codes.length + ' eleves desactives.', true);
    }).catch(function (e) {
      console.error(e);
      setUnlockStatus('Erreur lors de la desactivation en masse.', false);
    });
  }

  function bulkExport() {
    var current = elClasseFilter ? elClasseFilter.value : 'ALL';
    if (current === 'ALL') return;

    var entries = Object.values(registreCache)
      .filter(function (e) { return e.classe === current; })
      .sort(function (a, b) {
        return (a.nom || '').localeCompare(b.nom || '', 'fr') || (a.code || '').localeCompare(b.code || '', 'fr');
      });

    if (!entries.length) return;

    var lines = ['Classe ' + current + ' — Codes d\'acces accompagnement :'];
    entries.forEach(function (e, i) {
      var name = displayName(e);
      lines.push((i + 1) + '. ' + (name !== '—' ? name + ' : ' : 'Eleve ' + (i + 1) + ' : ') + e.code);
    });
    var text = lines.join('\n');

    showModal(
      '<h3>Export codes — ' + escapeHtml(current) + '</h3>' +
      '<textarea class="textarea" id="modal-export-text" readonly style="min-height:200px;">' + escapeHtml(text) + '</textarea>' +
      '<div class="modal-actions">' +
        '<button class="btn" id="modal-cancel">Fermer</button>' +
        '<button class="btn primary" id="modal-copy">Copier</button>' +
      '</div>'
    );

    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-copy').addEventListener('click', function () {
      var ta = document.getElementById('modal-export-text');
      if (ta) {
        navigator.clipboard.writeText(ta.value).then(function () {
          setUnlockStatus('Export copie.', true);
          closeModal();
        }).catch(function () {
          ta.select();
          setUnlockStatus('Selection faite. Copie manuellement (Ctrl+C).', true);
        });
      }
    });
  }

  // ═══════════════════════════════════════════
  // SYNC WRITE STATES
  // ═══════════════════════════════════════════
  function syncWriteStates() {
    if (btnSaveGlobalSchedule) btnSaveGlobalSchedule.disabled = !unlocked;
    if (btnClearGlobalSchedule) btnClearGlobalSchedule.disabled = !unlocked;
    if (btnSaveCodeSchedule) btnSaveCodeSchedule.disabled = !unlocked;
    if (btnClearCodeSchedule) btnClearCodeSchedule.disabled = !unlocked;
    if (btnCustomGlobalAdd) btnCustomGlobalAdd.disabled = !unlocked;
    if (btnCustomEleveAdd) btnCustomEleveAdd.disabled = !unlocked;
    if (btnAddStudent) btnAddStudent.disabled = !unlocked;
    if (btnBulkActivate) btnBulkActivate.disabled = !unlocked;
    if (btnBulkDeactivate) btnBulkDeactivate.disabled = !unlocked;
    if (btnCsvImport) btnCsvImport.disabled = !unlocked;
    if (btnChangeTeacherCode) btnChangeTeacherCode.style.display = unlocked ? '' : 'none';
  }

  // ═══════════════════════════════════════════
  // SUBSCRIPTIONS
  // ═══════════════════════════════════════════
  function subscribeStudentRegistry() {
    firebase.database().ref(REF_STUDENT_REGISTRY).on('value', function (snap) {
      rebuildRegistreFromRegistry(snap.val() || {});
      renderFilters();
      renderListeEleves();
      renderSpecialStatuses();
      renderCustomEleveOptions();
      if (selectedAccCode) openEleve(selectedAccCode);
    });
  }

  // Subscribe to individual special code entries in autorisations
  // (Firebase rules allow reading individual entries, not the whole collection)
  function subscribeSpecialCode(code) {
    firebase.database().ref(REF_AUTORISATIONS + '/' + code).on('value', function (snap) {
      var val = snap.val();
      if (val) {
        autorisationsCache[code] = val;
      } else {
        delete autorisationsCache[code];
      }
      ensureDefaultSpecialCodes();
      renderSpecialStatuses();
    });
  }

  function subscribeAllSpecialCodes() {
    // Subscribe to reserved special codes
    RESERVED_SPECIAL_CODES.forEach(function (code) {
      subscribeSpecialCode(code);
    });
    // Also subscribe to any custom special codes we discover
    // Custom special codes will be subscribed when created via createSpecialCode()
  }

  function subscribeEleves() {
    firebase.database().ref(REF_ELEVES).on('value', function (snap) {
      elevesCache = snap.val() || {};
      if (selectedAccCode) openEleve(selectedAccCode);
    });
  }

  function subscribeValidations() {
    firebase.database().ref(REF_VALIDATIONS).limitToLast(100).on('value', function (snap) {
      var obj = snap.val() || {};
      var items = Object.keys(obj).map(function (k) {
        return Object.assign({ id: k }, obj[k]);
      }).sort(function (a, b) {
        return (b.timestamp || b.created_at || 0) - (a.timestamp || a.created_at || 0);
      });
      renderValidations(items);
    });
  }

  function loadTeacherCodes() {
    firebase.database().ref(REF_TEACHER_CODES).on('value', function (snap) {
      var data = snap.val();
      teacherCodesCache = (data && Array.isArray(data.codes)) ? data.codes : [];
    });
  }

  // ═══════════════════════════════════════════
  // EVENT BINDING
  // ═══════════════════════════════════════════
  function bindEvents() {
    // Unlock
    if (btnUnlock) btnUnlock.addEventListener('click', unlockCockpit);
    if (elTeacherCode) {
      elTeacherCode.addEventListener('keydown', function (e) { if (e.key === 'Enter') unlockCockpit(); });
      elTeacherCode.addEventListener('input', function (e) { e.target.value = normalizeCode(e.target.value).slice(0, 16); });
    }
    if (btnChangeTeacherCode) btnChangeTeacherCode.addEventListener('click', showChangeTeacherCodeModal);

    // CSV import
    if (elCsvDropZone) {
      elCsvDropZone.addEventListener('click', function () { if (elCsvFileInput) elCsvFileInput.click(); });
      elCsvDropZone.addEventListener('dragover', function (e) { e.preventDefault(); elCsvDropZone.classList.add('drag-over'); });
      elCsvDropZone.addEventListener('dragleave', function () { elCsvDropZone.classList.remove('drag-over'); });
      elCsvDropZone.addEventListener('drop', function (e) {
        e.preventDefault();
        elCsvDropZone.classList.remove('drag-over');
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) processCsvFile(file);
      });
    }
    if (elCsvFileInput) elCsvFileInput.addEventListener('change', function () {
      var f = elCsvFileInput.files && elCsvFileInput.files[0];
      if (f) processCsvFile(f);
    });
    if (btnCsvImport) btnCsvImport.addEventListener('click', importCsvToFirebase);
    if (btnCsvCancel) btnCsvCancel.addEventListener('click', cancelCsvImport);

    // Students
    if (btnAddStudent) btnAddStudent.addEventListener('click', showAddStudentModal);
    if (elClasseFilter) elClasseFilter.addEventListener('change', function () {
      renderListeEleves();
      renderBulkActions();
    });
    if (btnResetFilter) btnResetFilter.addEventListener('click', function () {
      if (elClasseFilter) elClasseFilter.value = 'ALL';
      renderListeEleves();
      renderBulkActions();
    });

    // Bulk actions
    if (btnBulkActivate) btnBulkActivate.addEventListener('click', bulkActivate);
    if (btnBulkDeactivate) btnBulkDeactivate.addEventListener('click', bulkDeactivate);
    if (btnBulkExport) btnBulkExport.addEventListener('click', bulkExport);

    // Special codes
    if (elSpecialCode) {
      elSpecialCode.addEventListener('input', function (e) { e.target.value = normalizeCode(e.target.value).slice(0, 16); });
      elSpecialCode.addEventListener('keydown', function (e) { if (e.key === 'Enter') createSpecialCode(); });
    }
    if (elSpecialLabel) elSpecialLabel.addEventListener('keydown', function (e) { if (e.key === 'Enter') createSpecialCode(); });
    if (btnGenerateSpecial) btnGenerateSpecial.addEventListener('click', function () {
      if (!unlocked) { setSpecialCreateStatus('Deverrouille le cockpit.', 'err'); return; }
      var next = nextAvailableSpecialCode();
      if (!next) { setSpecialCreateStatus('Aucun code libre.', 'err'); return; }
      if (elSpecialCode) elSpecialCode.value = next;
      setSpecialCreateStatus('Code propose : ' + next, 'ok');
    });
    if (btnCreateSpecial) btnCreateSpecial.addEventListener('click', createSpecialCode);

    // Schedule
    if (btnLoadGlobalSchedule) btnLoadGlobalSchedule.addEventListener('click', loadGlobalSchedule);
    if (btnSaveGlobalSchedule) btnSaveGlobalSchedule.addEventListener('click', saveGlobalSchedule);
    if (btnClearGlobalSchedule) btnClearGlobalSchedule.addEventListener('click', clearGlobalSchedule);
    if (elScheduleCode) {
      elScheduleCode.addEventListener('input', function (e) { e.target.value = normalizeCode(e.target.value).slice(0, 16); });
      elScheduleCode.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadCodeSchedule(); });
    }
    if (btnUseSelectedCode) btnUseSelectedCode.addEventListener('click', useSelectedCodeForSchedule);
    if (btnLoadCodeSchedule) btnLoadCodeSchedule.addEventListener('click', loadCodeSchedule);
    if (btnSaveCodeSchedule) btnSaveCodeSchedule.addEventListener('click', saveCodeSchedule);
    if (btnClearCodeSchedule) btnClearCodeSchedule.addEventListener('click', clearCodeSchedule);

    // Custom library
    if (btnCustomGlobalAdd) btnCustomGlobalAdd.addEventListener('click', function () { addCustomEntry('global'); });
    if (btnCustomEleveAdd) btnCustomEleveAdd.addEventListener('click', function () { addCustomEntry('eleve'); });
    if (elCustomEleveSelect) elCustomEleveSelect.addEventListener('change', refreshCustomEleveSelection);

    // Modal close on overlay click
    if (elModalOverlay) elModalOverlay.addEventListener('click', function (e) {
      if (e.target === elModalOverlay) closeModal();
    });
  }

  // ═══════════════════════════════════════════
  // BOOT
  // ═══════════════════════════════════════════
  function boot() {
    populateCompetenceSelect(elCustomGlobalCompetence);
    populateCompetenceSelect(elCustomEleveCompetence);
    renderScheduleTable(elGlobalScheduleBody, defaultScheduleTemplate());
    renderScheduleTable(elCodeScheduleBody, defaultScheduleTemplate());
    setStatus(elGlobalScheduleStatus, 'Chargement du cadre global...', '');
    setStatus(elCodeScheduleStatus, 'Saisis un code puis charge son exception.', '');
    renderListeEleves();
    renderSpecialStatuses();
    renderCustomGlobalList();
    renderCustomEleveList();
    syncWriteStates();
    setSpecialCreateStatus('', '');

    if (unlocked) {
      setUnlockStatus('Cockpit deverrouille (session active).', true);
      if (btnChangeTeacherCode) btnChangeTeacherCode.style.display = '';
    } else {
      setUnlockStatus('Cockpit verrouille.', false);
    }

    bindEvents();

    // Subscriptions Firebase
    loadTeacherCodes();
    subscribeStudentRegistry();
    subscribeAllSpecialCodes();
    subscribeEleves();
    subscribeValidations();
    subscribeCustomGlobal();
    refreshCustomEleveSelection();
    loadGlobalSchedule();
    initQrScanner();
  }

  boot();
})();
