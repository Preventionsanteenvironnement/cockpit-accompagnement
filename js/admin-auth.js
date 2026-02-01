// Cockpit accompagnement
// - Liste eleves (auto depuis RTDB)
// - Autorisation eleve (accompagnement/autorisations/<code>)
// - Validations depuis scan QR (accompagnement/validations)

(function () {
  const DB_ROOT = 'accompagnement';
  const REF_ELEVES = `${DB_ROOT}/eleves`;
  const REF_AUTORISATIONS = `${DB_ROOT}/autorisations`;
  const REF_VALIDATIONS = `${DB_ROOT}/validations`;

  const elListe = document.getElementById('liste-eleves');
  const elSecEleve = document.getElementById('sec-eleve');
  const elNomEleve = document.getElementById('nom-eleve');
  const elDetailEleve = document.getElementById('detail-eleve');
  const elListeValidations = document.getElementById('liste-validations');

  if (typeof firebase === 'undefined' || !firebase.apps?.length) {
    console.error('Firebase non initialise');
    return;
  }

  // --- Etat ---
  let autorisationsCache = {}; // { CODE: {autorise:true,...} }
  let elevesCache = {};        // { CODE: {...data} }
  let selectedEleve = null;

  // --- Utils ---
  function safeUpper(v) {
    return String(v || '').trim().toUpperCase();
  }

  function fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  function getAuthState(code) {
    const c = safeUpper(code);
    const a = autorisationsCache[c];
    return !!(a && a.autorise === true);
  }

  function setAuthState(code, autorise) {
    const c = safeUpper(code);
    return firebase
      .database()
      .ref(`${REF_AUTORISATIONS}/${c}`)
      .update({
        autorise: !!autorise,
        updated_at: Date.now(),
      });
  }

  // --- Rendering ---
  function renderListeEleves(codes) {
    if (!elListe) return;
    elListe.innerHTML = '';

    if (!codes.length) {
      elListe.innerHTML = `<div class="text-muted">Aucun eleve detecte dans la base.</div>`;
      return;
    }

    codes.forEach((code) => {
      const c = safeUpper(code);
      const allowed = getAuthState(c);

      const card = document.createElement('div');
      card.className = 'card mb-2';
      card.style.cursor = 'pointer';

      card.innerHTML = `
        <div class="card-body d-flex align-items-center justify-content-between" style="gap:12px;">
          <div>
            <div style="font-weight:700;">${c}</div>
            <div class="small ${allowed ? 'text-success' : 'text-danger'}">
              ${allowed ? 'Autorise' : 'Non autorise'}
            </div>
          </div>
          <div class="d-flex" style="gap:8px;">
            <button class="btn btn-sm ${allowed ? 'btn-outline-danger' : 'btn-outline-success'}" data-action="toggle">
              ${allowed ? 'Interdire' : 'Autoriser'}
            </button>
            <button class="btn btn-sm btn-outline-primary" data-action="open">Ouvrir</button>
          </div>
        </div>
      `;

      // Click boutons
      card.querySelector('[data-action="toggle"]').addEventListener('click', async (e) => {
        e.stopPropagation();
        const next = !getAuthState(c);
        await setAuthState(c, next);
      });

      card.querySelector('[data-action="open"]').addEventListener('click', (e) => {
        e.stopPropagation();
        openEleve(c);
      });

      // Click carte
      card.addEventListener('click', () => openEleve(c));

      elListe.appendChild(card);
    });
  }

  function openEleve(code) {
    const c = safeUpper(code);
    selectedEleve = c;
    if (elSecEleve) elSecEleve.style.display = 'block';
    if (elNomEleve) elNomEleve.textContent = c;

    const data = elevesCache[c] || {};
    const objectifs = data.objectifs ? Object.keys(data.objectifs).length : 0;
    const meteo = data.meteo ? Object.keys(data.meteo).length : 0;
    const autorise = getAuthState(c);

    if (elDetailEleve) {
      elDetailEleve.innerHTML = `
        <div><strong>Autorisation :</strong> ${autorise ? 'Autorise' : 'Non autorise'}</div>
        <div><strong>Objectifs :</strong> ${objectifs}</div>
        <div><strong>Meteo :</strong> ${meteo}</div>
      `;
    }
  }

  function renderValidations(items) {
    if (!elListeValidations) return;
    elListeValidations.innerHTML = '';

    if (!items.length) {
      elListeValidations.innerHTML = `<tr><td colspan="4" class="text-muted">Aucune validation</td></tr>`;
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

  // --- Data subscriptions ---
  function subscribeAutorisations() {
    firebase.database().ref(REF_AUTORISATIONS).on('value', (snap) => {
      autorisationsCache = snap.val() || {};
      // re-render list if already loaded
      const codes = Object.keys(elevesCache).sort();
      if (codes.length) renderListeEleves(codes);
      if (selectedEleve) openEleve(selectedEleve);
    });
  }

  function subscribeEleves() {
    firebase.database().ref(REF_ELEVES).on('value', (snap) => {
      elevesCache = snap.val() || {};
      const codes = Object.keys(elevesCache).sort();
      renderListeEleves(codes);
      if (selectedEleve && elevesCache[selectedEleve]) openEleve(selectedEleve);
    });
  }

  function subscribeValidations() {
    firebase.database().ref(REF_VALIDATIONS).limitToLast(50).on('value', (snap) => {
      const obj = snap.val() || {};
      const items = Object.keys(obj)
        .map((k) => ({ id: k, ...obj[k] }))
        .sort((a, b) => (b.timestamp || b.created_at || 0) - (a.timestamp || a.created_at || 0));
      renderValidations(items);
    });
  }

  // --- QR Scan ---
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
      qrbox: 250,
    });

    scanner.render(
      async (decodedText) => {
        try {
          const p = JSON.parse(decodedText);
          // Normalisation minimale
          const rec = {
            ...p,
            eleve: safeUpper(p.eleve),
            created_at: Date.now(),
          };
          await firebase.database().ref(REF_VALIDATIONS).push(rec);
        } catch (e) {
          console.error('QR invalide', e);
        }
      },
      (err) => {
        // erreurs scan ignorees
      }
    );
  }

  // --- Boot ---
  subscribeAutorisations();
  subscribeEleves();
  subscribeValidations();
  initQrScanner();
})();
