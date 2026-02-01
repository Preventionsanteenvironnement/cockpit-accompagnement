// admin-auth.js - Version V11 CORRIGÉE : Liste de Secours & Éditeur

// --- 1. LISTE DE SECOURS (Pour éviter le "0 élèves") ---
// Cette liste s'affiche IMMÉDIATEMENT, sans attendre le chargement.
const BDD_ELEVES_SECOURS = [
    { userCode: "KA47", classe: "B1AGO1" },
    { userCode: "LU83", classe: "B1AGO1" },
    { userCode: "MO12", classe: "B1AGO1" },
    { userCode: "QF59", classe: "B1AGO1" },
    { userCode: "RA26", classe: "B1AGO1" },
    { userCode: "TI74", classe: "B1AGO1" },
    { userCode: "XO88", classe: "B1AGO1" },
    { userCode: "VE33", classe: "B1AGO1" },
    { userCode: "ZE91", classe: "T_AGO2" },
    { userCode: "PA55", classe: "T_AGO2" },
    { userCode: "NI22", classe: "T_AGO2" }
];

let allEleves = BDD_ELEVES_SECOURS; 
let authData = { ELEVES_AUTORISES: {} };
let libraryData = {}; 
let currentEleveCode = null;
let currentEditId = null;
let charts = { radar: null, context: null };

const sanitize = (id) => id.replace(/\./g, '_');

const REF_OFFICIEL = [
    { id: "C1.1", nom: "Accroître sa connaissance de soi", axe: "COG" },
    { id: "C1.2", nom: "Savoir penser de façon critique", axe: "COG" },
    { id: "C1.3", nom: "Connaître ses valeurs et besoins", axe: "COG" },
    { id: "C1.4", nom: "Prendre des décisions constructives", axe: "COG" },
    { id: "C1.5", nom: "S’auto-évaluer positivement", axe: "COG" },
    { id: "C1.6", nom: "Renforcer sa pleine attention", axe: "COG" },
    { id: "E1.1", nom: "Comprendre les émotions", axe: "EMO" },
    { id: "E1.2", nom: "Identifier ses émotions", axe: "EMO" },
    { id: "S1.1", nom: "Communiquer de façon efficace", axe: "SOC" },
    { id: "S1.2", nom: "Communiquer de façon empathique", axe: "SOC" },
    { id: "S1.3", nom: "Développer des liens prosociaux", axe: "SOC" }
];

// --- 2. CHARGEMENT ---
async function chargerDonneesAutorisations() {
    try {
        // On récupère les autorisations Firebase
        const snapshot = await firebase.database().ref('accompagnement/autorisations').once('value');
        const firebaseData = snapshot.val();
        if (firebaseData) {
            Object.keys(firebaseData).forEach(code => {
                if (!authData.ELEVES_AUTORISES) authData.ELEVES_AUTORISES = {};
                if (!authData.ELEVES_AUTORISES[code]) authData.ELEVES_AUTORISES[code] = {};
                authData.ELEVES_AUTORISES[code].autorise = firebaseData[code].autorise;
            });
        }

        initialiserFiltres();
        filtrerTableau();
        
        // Listeners
        document.getElementById('search-input').addEventListener('input', filtrerTableau);
        document.getElementById('filter-classe').addEventListener('change', filtrerTableau);
        document.getElementById('filter-status').addEventListener('change', filtrerTableau);

    } catch (error) { console.error("Erreur Init:", error); }
}

// --- 3. LISTE & DASHBOARD ---
function initialiserFiltres() {
    const classes = [...new Set(allEleves.map(e => e.classe))].sort();
    const selectClasse = document.getElementById('filter-classe');
    selectClasse.innerHTML = '<option value="ALL">Toutes les classes</option>';
    classes.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls; option.innerText = cls;
        selectClasse.appendChild(option);
    });
}

function filtrerTableau() {
    const searchText = document.getElementById('search-input').value.toLowerCase();
    const selectedClasse = document.getElementById('filter-classe').value;
    const selectedStatus = document.getElementById('filter-status').value;

    const resultats = allEleves.filter(eleve => {
        const code = eleve.userCode;
        const estAutorise = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[code]) ? authData.ELEVES_AUTORISES[code].autorise : false;
        
        const matchSearch = code.toLowerCase().includes(searchText) || eleve.classe.toLowerCase().includes(searchText);
        const matchClasse = (selectedClasse === "ALL") || (eleve.classe === selectedClasse);
        let matchStatus = true;
        if (selectedStatus === "AUTHORIZED") matchStatus = estAutorise;
        if (selectedStatus === "UNAUTHORIZED") matchStatus = !estAutorise;

        return matchSearch && matchClasse && matchStatus;
    });
    afficherTableau(resultats);
}

function afficherTableau(liste) {
    const tbody = document.getElementById('liste-eleves');
    const counter = document.getElementById('counter-display');
    tbody.innerHTML = '';
    counter.innerText = liste.length;

    if (liste.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-5"><h4 class="fw-light">Aucun élève trouvé...</h4></td></tr>';
        return;
    }

    liste.forEach(eleve => {
        const code = eleve.userCode;
        const estAutorise = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[code]) ? authData.ELEVES_AUTORISES[code].autorise : false;

        const ligne = `
            <tr class="align-middle">
                <td class="ps-4">
                    <div class="d-flex align-items-center">
                        <div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width:40px; height:40px; font-weight:bold;">${code.substring(0,2)}</div>
                        <div><div class="fw-bold text-dark" style="font-size:1.1rem;">${code}</div></div>
                    </div>
                </td>
                <td><span class="badge bg-white text-dark border shadow-sm px-3 py-2">${eleve.classe}</span></td>
                <td>
                    ${estAutorise 
                        ? '<span class="badge bg-success-subtle text-success border border-success px-3 py-2">✅ Autorisé</span>' 
                        : '<span class="badge bg-secondary-subtle text-secondary border border-secondary px-3 py-2">⛔ Bloqué</span>'}
                </td>
                <td class="text-end pe-4">
                    <button class="btn btn-primary px-4 py-2 rounded-pill shadow-sm" onclick="ouvrirUnivers('${code}', '${eleve.classe}')">
                        🚀 Pilotage
                    </button>
                </td>
            </tr>
        `;
        tbody.innerHTML += ligne;
    });
}

// --- 4. UNIVERS ÉLÈVE ---
window.ouvrirUnivers = function(code, classe) {
    currentEleveCode = code;
    document.getElementById('main-list-view').style.display = 'none';
    document.getElementById('student-universe').style.display = 'block';
    document.getElementById('btn-back-list').style.display = 'block';
    
    document.getElementById('univ-nom').innerText = code;
    document.getElementById('univ-classe').innerText = classe;
    
    const estAutorise = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[code]) ? authData.ELEVES_AUTORISES[code].autorise : false;
    updateBoutonActionUnivers(estAutorise);
    
    const dbRef = firebase.database().ref(`accompagnement/eleves/${code}`);
    dbRef.off();
    dbRef.on('value', (snapshot) => {
        const data = snapshot.val() || { competences_validees: {} };
        renderUniversCharts(data);
        renderTimeline(data.competences_validees);
    });
};

window.fermerUnivers = function() {
    document.getElementById('student-universe').style.display = 'none';
    document.getElementById('main-list-view').style.display = 'block';
    document.getElementById('btn-back-list').style.display = 'none';
    if(currentEleveCode) firebase.database().ref(`accompagnement/eleves/${currentEleveCode}`).off();
    currentEleveCode = null;
};

// --- 5. CHARTS & TIMELINE ---
function renderUniversCharts(userData) {
    const scores = { "COG": 0, "EMO": 0, "SOC": 0 };
    const contexts = { "COURS": 0, "ATELIER": 0, "STAGE": 0, "AUTRE": 0 };
    let totalValid = 0;
    
    Object.keys(userData.competences_validees || {}).forEach(key => {
        const item = userData.competences_validees[key];
        if(item.valide) {
            const axe = REF_OFFICIEL.find(r => sanitize(r.id) === key.replace('_','.'))?.axe || "COG";
            scores[axe]++;
            totalValid++;
            const lieu = item.contexte || "AUTRE";
            if(contexts[lieu] !== undefined) contexts[lieu]++; else contexts["AUTRE"]++;
        }
    });

    document.getElementById('univ-total-valid').innerText = totalValid;

    // Radar
    const radarCtx = document.getElementById('univRadarChart').getContext('2d');
    if(charts.radar) charts.radar.destroy();
    charts.radar = new Chart(radarCtx, {
        type: 'radar',
        data: {
            labels: ['Cognitif', 'Social', 'Émotionnel'],
            datasets: [{ label: 'Niveau', data: [scores["COG"]*10, scores["SOC"]*10, scores["EMO"]*10], backgroundColor: 'rgba(79, 70, 229, 0.2)', borderColor: '#4f46e5', borderWidth: 3 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { r: { suggestedMin: 0, suggestedMax: 100 } }, plugins: { legend: { display: false } } }
    });

    // Donut
    const contextCtx = document.getElementById('univContextChart').getContext('2d');
    if(charts.context) charts.context.destroy();
    charts.context = new Chart(contextCtx, {
        type: 'doughnut',
        data: {
            labels: ['Cours', 'Atelier', 'Stage', 'Autre'],
            datasets: [{ data: [contexts["COURS"], contexts["ATELIER"], contexts["STAGE"], contexts["AUTRE"]], backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#6b7280'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
}

function renderTimeline(validees) {
    const container = document.getElementById('univ-timeline');
    container.innerHTML = '';
    if(!validees) { container.innerHTML = '<div class="text-muted p-4 text-center">Aucune activité récente.</div>'; return; }
    
    let actions = [];
    Object.keys(validees).forEach(key => {
        const item = validees[key];
        const ref = REF_OFFICIEL.find(r => sanitize(r.id) === key.replace('_','.'));
        const nom = ref ? ref.nom : key;
        if(item.valide) actions.push({ ...item, nom: nom });
    });

    actions.sort((a, b) => new Date(b.date) - new Date(a.date));

    actions.forEach(action => {
        const dateObj = new Date(action.date);
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const div = document.createElement('div');
        div.className = 'timeline-item';
        div.innerHTML = `
            <div class="timeline-date">${dateStr}</div>
            <div class="card border-0 shadow-sm mb-2">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <h6 class="mb-0 text-primary fw-bold">${action.nom}</h6>
                        <span class="badge bg-warning text-dark">${"⭐".repeat(action.niveau)}</span>
                    </div>
                    <span class="badge bg-light text-dark border mb-2">${action.contexte || 'Général'}</span>
                    <p class="mb-0 small fst-italic text-muted">"${action.preuve}"</p>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function updateBoutonActionUnivers(estAutorise) {
    const btn = document.getElementById('univ-btn-action');
    if(estAutorise) { btn.innerText = "Bloquer l'accès"; btn.className = "btn btn-outline-danger rounded-pill px-4"; btn.onclick = () => basculerAutorisation(currentEleveCode, true); } 
    else { btn.innerText = "Autoriser l'accès"; btn.className = "btn btn-success rounded-pill px-4"; btn.onclick = () => basculerAutorisation(currentEleveCode, false); }
}

async function basculerAutorisation(code, statutActuel) {
    const nouveauStatut = !statutActuel;
    if (!authData.ELEVES_AUTORISES) authData.ELEVES_AUTORISES = {};
    if (!authData.ELEVES_AUTORISES[code]) authData.ELEVES_AUTORISES[code] = {};
    authData.ELEVES_AUTORISES[code].autorise = nouveauStatut;
    filtrerTableau(); 
    if(currentEleveCode === code) updateBoutonActionUnivers(nouveauStatut);
    try { await firebase.database().ref(`accompagnement/autorisations/${code}`).update({ autorise: nouveauStatut }); } catch (e) { alert("Erreur connexion: " + e); }
}

// --- 6. ÉDITEUR BIBLIOTHÈQUE ---
window.ouvrirBibliotheque = async function() {
    const modal = new bootstrap.Modal(document.getElementById('modalLibrary'));
    try {
        const snap = await firebase.database().ref('accompagnement/contenu_pedagogique').once('value');
        libraryData = snap.val() || {};
    } catch(e) { console.error("Erreur lib", e); }

    const listContainer = document.getElementById('lib-list-comp');
    listContainer.innerHTML = '';
    
    REF_OFFICIEL.forEach(ref => {
        const safeId = sanitize(ref.id);
        const hasContent = libraryData[safeId] ? '✅' : '📝';
        const item = document.createElement('a');
        item.href = "#";
        item.className = "list-group-item list-group-item-action border-0 mb-1 rounded";
        item.innerHTML = `<div class="d-flex justify-content-between"><strong>${ref.id}</strong> <span>${hasContent}</span></div><small class="text-muted">${ref.nom}</small>`;
        item.onclick = (e) => {
            e.preventDefault();
            chargerEditeur(ref, safeId);
            document.querySelectorAll('#lib-list-comp a').forEach(a => a.classList.remove('active', 'bg-primary', 'text-white'));
            item.classList.add('active', 'bg-primary', 'text-white');
        };
        listContainer.appendChild(item);
    });

    document.getElementById('lib-empty-state').style.display = 'block';
    document.getElementById('lib-editor-area').style.display = 'none';
    modal.show();
}

function chargerEditeur(ref, safeId) {
    currentEditId = safeId;
    document.getElementById('lib-empty-state').style.display = 'none';
    document.getElementById('lib-editor-area').style.display = 'block';
    document.getElementById('lib-edit-title').innerText = `${ref.id} - ${ref.nom}`;
    const data = libraryData[safeId] || {};
    document.getElementById('edit-titre-eleve').value = data.titre_eleve || "";
    document.getElementById('edit-science').value = data.explication_scientifique || "";
    document.getElementById('edit-pourquoi').value = data.pourquoi_scolaire || "";
    let outilsTxt = "";
    if(Array.isArray(data.boite_a_outils)) outilsTxt = data.boite_a_outils.join('\n'); else outilsTxt = data.boite_a_outils || "";
    document.getElementById('edit-outils').value = outilsTxt;
}

window.sauvegarderBibliotheque = async function() {
    if(!currentEditId) return;
    const outilsArray = document.getElementById('edit-outils').value.split('\n').filter(line => line.trim() !== "");
    const dataToSave = {
        titre_eleve: document.getElementById('edit-titre-eleve').value,
        explication_scientifique: document.getElementById('edit-science').value,
        pourquoi_scolaire: document.getElementById('edit-pourquoi').value,
        boite_a_outils: outilsArray
    };
    libraryData[currentEditId] = dataToSave;
    try {
        await firebase.database().ref(`accompagnement/contenu_pedagogique/${currentEditId}`).set(dataToSave);
        alert("✅ Sauvegardé !");
    } catch(e) { alert("Erreur : " + e); }
}

// Paramètres
window.ouvrirParametres = async function() {
    const modal = new bootstrap.Modal(document.getElementById('modalParams'));
    try {
        const snap = await firebase.database().ref('accompagnement/config/horaires').once('value');
        const config = snap.val() || {};
        document.getElementById('cfg-ouverture').value = config.ouverture || 8;
        document.getElementById('cfg-fermeture').value = config.fermeture || 18;
        document.getElementById('cfg-maintenance').checked = config.maintenance || false;
        const jours = config.jours || [1,2,3,4,5];
        document.querySelectorAll('.day-check').forEach(chk => { chk.checked = jours.includes(parseInt(chk.value)); });
    } catch(e) {}
    modal.show();
}

window.sauvegarderParams = async function() {
    const ouverture = parseInt(document.getElementById('cfg-ouverture').value);
    const fermeture = parseInt(document.getElementById('cfg-fermeture').value);
    const maintenance = document.getElementById('cfg-maintenance').checked;
    const jours = [];
    document.querySelectorAll('.day-check:checked').forEach(chk => jours.push(parseInt(chk.value)));
    try {
        await firebase.database().ref('accompagnement/config/horaires').set({ ouverture, fermeture, jours, maintenance });
        alert("Configuration appliquée.");
        bootstrap.Modal.getInstance(document.getElementById('modalParams')).hide();
    } catch(e) { alert("Erreur : " + e); }
}

window.onload = chargerDonneesAutorisations;
