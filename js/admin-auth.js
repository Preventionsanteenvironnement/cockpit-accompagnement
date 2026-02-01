// admin-auth.js - Version V13 : Avec Gestion des Objectifs

const BDD_ELEVES_SECOURS = [
    { userCode: "KA47", classe: "B1AGO1" }, { userCode: "LU83", classe: "B1AGO1" }, { userCode: "MO12", classe: "B1AGO1" },
    { userCode: "QF59", classe: "B1AGO1" }, { userCode: "RA26", classe: "B1AGO1" }, { userCode: "TI74", classe: "B1AGO1" },
    { userCode: "XO88", classe: "B1AGO1" }, { userCode: "VE33", classe: "B1AGO1" }, { userCode: "ZE91", classe: "T_AGO2" },
    { userCode: "PA55", classe: "T_AGO2" }, { userCode: "NI22", classe: "T_AGO2" }
];

let allEleves = BDD_ELEVES_SECOURS; 
let authData = { ELEVES_AUTORISES: {} };
let libraryData = {}; 
let currentEleveCode = null;
let currentEditId = null;
let charts = { radar: null, context: null };

const sanitize = (id) => id.replace(/\./g, '_');
const REF_OFFICIEL = [
    { id: "C1.1", nom: "Accroître sa connaissance de soi", axe: "COG" }, { id: "C1.2", nom: "Savoir penser de façon critique", axe: "COG" },
    { id: "C1.3", nom: "Connaître ses valeurs et besoins", axe: "COG" }, { id: "C1.4", nom: "Prendre des décisions constructives", axe: "COG" },
    { id: "C1.5", nom: "S’auto-évaluer positivement", axe: "COG" }, { id: "C1.6", nom: "Renforcer sa pleine attention", axe: "COG" },
    { id: "E1.1", nom: "Comprendre les émotions", axe: "EMO" }, { id: "E1.2", nom: "Identifier ses émotions", axe: "EMO" },
    { id: "S1.1", nom: "Communiquer de façon efficace", axe: "SOC" }, { id: "S1.2", nom: "Communiquer de façon empathique", axe: "SOC" },
    { id: "S1.3", nom: "Développer des liens prosociaux", axe: "SOC" }
];

// --- INIT ---
async function chargerDonneesAutorisations() {
    try {
        const snap = await firebase.database().ref('accompagnement/autorisations').once('value');
        const fData = snap.val();
        if (fData) { Object.keys(fData).forEach(c => { if(!authData.ELEVES_AUTORISES) authData.ELEVES_AUTORISES={}; if(!authData.ELEVES_AUTORISES[c]) authData.ELEVES_AUTORISES[c]={}; authData.ELEVES_AUTORISES[c].autorise=fData[c].autorise; }); }
        initialiserFiltres(); filtrerTableau();
        document.getElementById('search-input').addEventListener('input', filtrerTableau);
        document.getElementById('filter-classe').addEventListener('change', filtrerTableau);
        document.getElementById('filter-status').addEventListener('change', filtrerTableau);
    } catch (e) { console.error(e); }
}

function initialiserFiltres() {
    const classes = [...new Set(allEleves.map(e => e.classe))].sort();
    const s = document.getElementById('filter-classe'); s.innerHTML = '<option value="ALL">Toutes les classes</option>';
    classes.forEach(c => s.appendChild(new Option(c, c)));
}
function filtrerTableau() {
    const txt = document.getElementById('search-input').value.toLowerCase();
    const cls = document.getElementById('filter-classe').value;
    const sts = document.getElementById('filter-status').value;
    const res = allEleves.filter(e => {
        const auth = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[e.userCode]) ? authData.ELEVES_AUTORISES[e.userCode].autorise : false;
        const mTxt = e.userCode.toLowerCase().includes(txt) || e.classe.toLowerCase().includes(txt);
        const mCls = (cls==="ALL") || (e.classe===cls);
        let mSts = true; if(sts==="AUTHORIZED") mSts=auth; if(sts==="UNAUTHORIZED") mSts=!auth;
        return mTxt && mCls && mSts;
    });
    afficherTableau(res);
}
function afficherTableau(liste) {
    const tb = document.getElementById('liste-eleves'); tb.innerHTML = '';
    document.getElementById('counter-display').innerText = liste.length;
    if(liste.length===0) { tb.innerHTML='<tr><td colspan="4" class="text-center py-5 text-muted">Aucun élève.</td></tr>'; return; }
    liste.forEach(e => {
        const auth = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[e.userCode]) ? authData.ELEVES_AUTORISES[e.userCode].autorise : false;
        tb.innerHTML += `<tr class="align-middle"><td class="ps-4 fw-bold text-dark">${e.userCode}</td><td><span class="badge bg-light text-dark border">${e.classe}</span></td><td>${auth?'<span class="badge bg-success-subtle text-success border-success border">Actif</span>':'<span class="badge bg-secondary-subtle text-secondary border">Bloqué</span>'}</td><td class="text-end pe-4"><button class="btn btn-primary btn-sm rounded-pill px-3" onclick="ouvrirUnivers('${e.userCode}', '${e.classe}')">🚀 Pilotage</button></td></tr>`;
    });
}

// --- UNIVERS ÉLÈVE & OBJECTIFS ---
window.ouvrirUnivers = function(code, classe) {
    currentEleveCode = code;
    document.getElementById('main-list-view').style.display = 'none';
    document.getElementById('student-universe').style.display = 'block';
    document.getElementById('btn-back-list').style.display = 'block';
    document.getElementById('univ-nom').innerText = code;
    document.getElementById('univ-classe').innerText = classe;
    
    // Auth Button
    const auth = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[code]) ? authData.ELEVES_AUTORISES[code].autorise : false;
    updateBoutonActionUnivers(auth);
    
    // Live Data
    const db = firebase.database().ref(`accompagnement/eleves/${code}`);
    db.off();
    db.on('value', (snap) => {
        const data = snap.val() || { competences_validees: {}, objectifs: {} };
        renderUniversCharts(data);
        renderTimeline(data.competences_validees);
        renderObjectifs(data.objectifs); // NOUVEAU
    });
};

window.fermerUnivers = function() {
    document.getElementById('student-universe').style.display = 'none';
    document.getElementById('main-list-view').style.display = 'block';
    document.getElementById('btn-back-list').style.display = 'none';
    if(currentEleveCode) firebase.database().ref(`accompagnement/eleves/${currentEleveCode}`).off();
    currentEleveCode = null;
};

// --- GESTION OBJECTIFS ---
function renderObjectifs(objData) {
    const list = document.getElementById('univ-objectifs-list');
    list.innerHTML = '';
    const keys = objData ? Object.keys(objData) : [];
    
    if(keys.length === 0) {
        document.getElementById('no-obj-msg').style.display = 'block';
        return;
    }
    document.getElementById('no-obj-msg').style.display = 'none';

    keys.forEach(key => {
        const obj = objData[key];
        const statusClass = obj.done ? 'done' : 'todo';
        const icon = obj.done ? '✅' : '⏳';
        
        const div = document.createElement('div');
        div.className = `objective-item ${statusClass}`;
        div.innerHTML = `
            <div class="d-flex justify-content-between pe-4">
                <strong>${obj.titre}</strong>
                <small class="text-muted">${icon}</small>
            </div>
            <div class="small text-muted fst-italic mt-1">${obj.mesure || ''}</div>
            <i class="fas fa-trash delete-obj" onclick="supprimerObjectif('${key}')"></i>
        `;
        list.appendChild(div);
    });
}

window.ajouterObjectif = async function() {
    const titre = prompt("Quel est l'objectif ? (ex: Lever la main 1 fois)");
    if(!titre) return;
    const mesure = prompt("Critère de réussite / Détail ? (ex: En cours d'Anglais)");
    
    const newObjRef = firebase.database().ref(`accompagnement/eleves/${currentEleveCode}/objectifs`).push();
    await newObjRef.set({
        titre: titre,
        mesure: mesure,
        done: false,
        date: new Date().toISOString()
    });
}

window.supprimerObjectif = async function(key) {
    if(confirm("Supprimer cet objectif ?")) {
        await firebase.database().ref(`accompagnement/eleves/${currentEleveCode}/objectifs/${key}`).remove();
    }
}

// --- CHARTS (Sans changement) ---
function renderUniversCharts(d) {
    const s = { "COG": 0, "EMO": 0, "SOC": 0 }; const c = { "COURS": 0, "ATELIER": 0, "STAGE": 0, "AUTRE": 0 }; let t = 0;
    Object.keys(d.competences_validees||{}).forEach(k => {
        const i = d.competences_validees[k];
        if(i.valide) {
            const ax = REF_OFFICIEL.find(r => sanitize(r.id)===k.replace('_','.'))?.axe || "COG";
            s[ax]++; t++; c[i.contexte||"AUTRE"]++;
        }
    });
    document.getElementById('univ-total-valid').innerText = t;
    if(charts.radar) charts.radar.destroy();
    charts.radar = new Chart(document.getElementById('univRadarChart'), { type: 'radar', data: { labels: ['Cognitif', 'Social', 'Émotionnel'], datasets: [{ label: 'Niveau', data: [s.COG, s.SOC, s.EMO], backgroundColor: 'rgba(79, 70, 229, 0.2)', borderColor: '#4f46e5' }] } });
    if(charts.context) charts.context.destroy();
    charts.context = new Chart(document.getElementById('univContextChart'), { type: 'doughnut', data: { labels: ['Cours', 'Atelier', 'Stage', 'Autre'], datasets: [{ data: [c.COURS, c.ATELIER, c.STAGE, c.AUTRE], backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#6b7280'] }] } });
}

function renderTimeline(d) {
    const el = document.getElementById('univ-timeline'); el.innerHTML='';
    if(!d) { el.innerHTML='<div class="text-muted p-2">Vide</div>'; return; }
    let a=[]; Object.keys(d).forEach(k=>{ if(d[k].valide) a.push({...d[k], nom: k}) });
    a.sort((x,y)=>new Date(y.date)-new Date(x.date));
    a.forEach(i => {
        el.innerHTML += `<div class="timeline-item"><div class="timeline-date">${new Date(i.date).toLocaleDateString()}</div><div class="card p-2 shadow-sm"><small><strong>${i.nom}</strong> ${"⭐".repeat(i.niveau)}</small><br><em class="small text-muted">${i.preuve}</em></div></div>`;
    });
}

function updateBoutonActionUnivers(auth) {
    const b = document.getElementById('univ-btn-action');
    if(auth) { b.innerText="Bloquer"; b.className="btn btn-outline-danger rounded-pill px-4"; b.onclick=()=>setAuth(true); }
    else { b.innerText="Autoriser"; b.className="btn btn-success rounded-pill px-4"; b.onclick=()=>setAuth(false); }
}
async function setAuth(val) {
    await firebase.database().ref(`accompagnement/autorisations/${currentEleveCode}`).update({autorise: !val});
    authData.ELEVES_AUTORISES[currentEleveCode] = { autorise: !val };
    filtrerTableau();
}

// --- EDITEUR & PARAMETRES (Compactés pour la place) ---
window.ouvrirBibliotheque = async function() {
    const m = new bootstrap.Modal(document.getElementById('modalLibrary'));
    const s = await firebase.database().ref('accompagnement/contenu_pedagogique').once('value');
    libraryData = s.val() || {};
    const lc = document.getElementById('lib-list-comp'); lc.innerHTML = '';
    REF_OFFICIEL.forEach(r => {
        const id = sanitize(r.id); const ok = libraryData[id]?'✅':'📝';
        const a = document.createElement('a'); a.className="list-group-item list-group-item-action"; a.innerHTML=`<b>${r.id}</b> ${ok}<br><small>${r.nom}</small>`;
        a.onclick=()=>{ chargerEditeur(r, id); }; lc.appendChild(a);
    });
    document.getElementById('lib-empty-state').style.display='block'; document.getElementById('lib-editor-area').style.display='none'; m.show();
}
function chargerEditeur(r, id) {
    currentEditId = id; document.getElementById('lib-empty-state').style.display='none'; document.getElementById('lib-editor-area').style.display='block';
    document.getElementById('lib-edit-title').innerText = r.id;
    const d = libraryData[id]||{};
    document.getElementById('edit-titre-eleve').value=d.titre_eleve||"";
    document.getElementById('edit-science').value=d.explication_scientifique||"";
    document.getElementById('edit-pourquoi').value=d.pourquoi_scolaire||"";
    document.getElementById('edit-lien').value=d.lien_externe||"";
    document.getElementById('edit-outils').value=(d.boite_a_outils||[]).join('\n');
}
window.sauvegarderBibliotheque = async function() {
    if(!currentEditId) return;
    const d = {
        titre_eleve: document.getElementById('edit-titre-eleve').value,
        explication_scientifique: document.getElementById('edit-science').value,
        pourquoi_scolaire: document.getElementById('edit-pourquoi').value,
        lien_externe: document.getElementById('edit-lien').value,
        boite_a_outils: document.getElementById('edit-outils').value.split('\n')
    };
    libraryData[currentEditId] = d;
    await firebase.database().ref(`accompagnement/contenu_pedagogique/${currentEditId}`).set(d);
    alert("✅");
}
window.ouvrirParametres=async()=>{ new bootstrap.Modal(document.getElementById('modalParams')).show(); }
window.sauvegarderParams=async()=>{
    const d = { ouverture: document.getElementById('cfg-ouverture').value, fermeture: document.getElementById('cfg-fermeture').value, maintenance: document.getElementById('cfg-maintenance').checked, jours: [1,2,3,4,5] };
    await firebase.database().ref('accompagnement/config/horaires').set(d); alert("OK");
}
window.onload = chargerDonneesAutorisations;
