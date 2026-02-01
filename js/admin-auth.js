// admin-auth.js - Version V18 (Compatible Nouveau Système Objectifs)

const BDD_ELEVES_SECOURS = [
    { userCode: "KA47", classe: "B1AGO1" }, { userCode: "LU83", classe: "B1AGO1" }, { userCode: "MO12", classe: "B1AGO1" },
    { userCode: "QF59", classe: "B1AGO1" }, { userCode: "RA26", classe: "B1AGO1" }, { userCode: "TI74", classe: "B1AGO1" },
    { userCode: "XO88", classe: "B1AGO1" }, { userCode: "VE33", classe: "B1AGO1" }, { userCode: "ZE91", classe: "T_AGO2" },
    { userCode: "PA55", classe: "T_AGO2" }, { userCode: "NI22", classe: "T_AGO2" }
];

let allEleves = BDD_ELEVES_SECOURS; 
let authData = { ELEVES_AUTORISES: {} };
let currentEleveCode = null;
let charts = { radar: null, context: null };

// --- CHARGEMENT ---
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

// --- UNIVERS ÉLÈVE ---
window.ouvrirUnivers = function(code, classe) {
    currentEleveCode = code;
    document.getElementById('main-list-view').style.display = 'none';
    document.getElementById('student-universe').style.display = 'block';
    document.getElementById('btn-back-list').style.display = 'block';
    document.getElementById('univ-nom').innerText = code;
    document.getElementById('univ-classe').innerText = classe;
    
    const auth = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[code]) ? authData.ELEVES_AUTORISES[code].autorise : false;
    updateBoutonActionUnivers(auth);
    
    const db = firebase.database().ref(`accompagnement/eleves/${code}`);
    db.off();
    db.on('value', (snap) => {
        const data = snap.val() || { competences_validees: {}, objectifs: {} };
        renderUniversCharts(data);
        renderObjectifs(data.objectifs);
    });
};

window.fermerUnivers = function() {
    document.getElementById('student-universe').style.display = 'none';
    document.getElementById('main-list-view').style.display = 'block';
    document.getElementById('btn-back-list').style.display = 'none';
    if(currentEleveCode) firebase.database().ref(`accompagnement/eleves/${currentEleveCode}`).off();
    currentEleveCode = null;
};

// --- OBJECTIFS V18 ---
function renderObjectifs(objData) {
    const list = document.getElementById('univ-objectifs-list'); list.innerHTML = '';
    const keys = objData ? Object.keys(objData) : [];
    if(keys.length === 0) { document.getElementById('no-obj-msg').style.display = 'block'; return; }
    document.getElementById('no-obj-msg').style.display = 'none';

    keys.forEach(key => {
        const obj = objData[key];
        const icon = obj.done ? '✅' : '⏳';
        
        let typeBadge = "";
        if(obj.type === 'COG') typeBadge = '<span class="badge bg-primary">Cog</span>';
        if(obj.type === 'EMO') typeBadge = '<span class="badge bg-danger">Emo</span>';
        if(obj.type === 'SOC') typeBadge = '<span class="badge bg-info">Soc</span>';

        const div = document.createElement('div');
        div.className = `objective-item ${obj.done ? 'done' : ''}`;
        div.innerHTML = `
            <div class="d-flex justify-content-between pe-4">
                <strong>${obj.titre} ${typeBadge}</strong>
                <small>${icon}</small>
            </div>
            <div class="small text-muted mt-1">
                ${obj.context || 'Autre'} • ${obj.detail || ''} • 📅 ${obj.date_cible || '?'}
            </div>
            <i class="fas fa-trash delete-obj" onclick="supprimerObjectif('${key}')"></i>
        `;
        list.appendChild(div);
    });
}

window.ajouterObjectif = async function() {
    alert("Pour l'instant, passez par l'application élève pour créer des objectifs V18 complexes.");
}

window.supprimerObjectif = async function(key) {
    if(confirm("Supprimer ?")) { await firebase.database().ref(`accompagnement/eleves/${currentEleveCode}/objectifs/${key}`).remove(); }
}

// --- CHARTS (Simplifiés pour V18) ---
function renderUniversCharts(d) {
    // Calcul simplifié basé sur les objectifs validés
    const s = { "COG": 0, "EMO": 0, "SOC": 0 };
    let t = 0;
    
    // On compte les objectifs validés
    Object.values(d.objectifs || {}).forEach(obj => {
        if(obj.done && obj.type && s[obj.type] !== undefined) {
            s[obj.type]++;
            t++;
        }
    });

    document.getElementById('univ-total-valid').innerText = t;
    
    if(charts.radar) charts.radar.destroy();
    charts.radar = new Chart(document.getElementById('univRadarChart'), {
        type: 'bar', // Bar est plus lisible pour des quantités
        data: { 
            labels: ['Cognitif', 'Social', 'Émotionnel'], 
            datasets: [{ 
                label: 'Réussites', 
                data: [s.COG, s.SOC, s.EMO], 
                backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899'] 
            }] 
        },
        options: { scales: { y: { beginAtZero: true, suggestedMax: 5 } } }
    });
}

function updateBoutonActionUnivers(auth) {
    const b = document.getElementById('univ-btn-action');
    const n = b.cloneNode(true); b.parentNode.replaceChild(n, b);
    if(auth) { n.innerText="Bloquer"; n.className="btn btn-outline-danger rounded-pill px-4"; n.onclick=()=>setAuth(true); }
    else { n.innerText="Autoriser"; n.className="btn btn-success rounded-pill px-4"; n.onclick=()=>setAuth(false); }
}
async function setAuth(val) {
    await firebase.database().ref(`accompagnement/autorisations/${currentEleveCode}`).update({autorise: !val});
    authData.ELEVES_AUTORISES[currentEleveCode] = { autorise: !val };
    filtrerTableau();
}

window.ouvrirBibliotheque = function() { alert("La bibliothèque est maintenant intégrée en dur dans l'App V18."); }
window.ouvrirParametres=async()=>{ new bootstrap.Modal(document.getElementById('modalParams')).show(); }
window.sauvegarderParams=async()=>{
    const d = { ouverture: document.getElementById('cfg-ouverture').value, fermeture: document.getElementById('cfg-fermeture').value, maintenance: document.getElementById('cfg-maintenance').checked, jours: [1,2,3,4,5] };
    await firebase.database().ref('accompagnement/config/horaires').set(d); alert("OK");
}
window.onload = chargerDonneesAutorisations;
