// admin-auth.js - Version V8 : Cockpit "Univers Élève"

let allEleves = [];
let authData = { ELEVES_AUTORISES: {} };
let charts = { radar: null, context: null }; // Stockage des graphiques
let currentEleveCode = null;

const sanitize = (id) => id.replace(/\./g, '_');

// Référentiel (Identique au reste du projet)
const REF_DATA = { "axes": [ { "id": "COG", "nom": "Compétences Cognitives", "phases": [ { "id": 1, "competences_generales": [ { "id": "C1", "nom": "Conscience de soi", "competences_specifiques": [ { "id": "C1.1", "nom": "Accroître sa connaissance de soi" }, { "id": "C1.2", "nom": "Savoir penser de façon critique" }, { "id": "C1.3", "nom": "Connaître ses valeurs et besoins" }, { "id": "C1.4", "nom": "Prendre des décisions constructives" }, { "id": "C1.5", "nom": "S’auto-évaluer positivement" }, { "id": "C1.6", "nom": "Renforcer sa pleine attention" } ] } ] } ] }, { "id": "EMO", "nom": "Compétences Émotionnelles", "phases": [ { "id": 1, "competences_generales": [ { "id": "E1", "nom": "Conscience des émotions", "competences_specifiques": [ { "id": "E1.1", "nom": "Comprendre les émotions" }, { "id": "E1.2", "nom": "Identifier ses émotions" } ] } ] } ] }, { "id": "SOC", "nom": "Compétences Sociales", "phases": [ { "id": 1, "competences_generales": [ { "id": "S1", "nom": "Relations constructives", "competences_specifiques": [ { "id": "S1.1", "nom": "Communiquer de façon efficace" }, { "id": "S1.2", "nom": "Communiquer de façon empathique" }, { "id": "S1.3", "nom": "Développer des liens prosociaux" } ] } ] } ] } ] };

// --- 1. CHARGEMENT INITIAL ---
async function chargerDonneesAutorisations() {
    try {
        // Chargement liste BDD
        if (typeof window.BDD_ELEVES === 'undefined') {
            await new Promise((resolve) => {
                const script = document.createElement('script');
                script.src = 'https://preventionsanteenvironnement.github.io/PSE/data_eleves.js';
                script.onload = resolve;
                document.head.appendChild(script);
            });
        }
        allEleves = window.BDD_ELEVES; 

        // Chargement Statuts Firebase
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
        
        // Écouteurs filtres
        document.getElementById('search-input').addEventListener('input', filtrerTableau);
        document.getElementById('filter-classe').addEventListener('change', filtrerTableau);
        document.getElementById('filter-status').addEventListener('change', filtrerTableau);

    } catch (error) { console.error(error); }
}

// --- 2. GESTION DE LA LISTE (ACCUEIL) ---
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
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Aucun élève trouvé.</td></tr>';
        return;
    }

    liste.forEach(eleve => {
        const code = eleve.userCode;
        const estAutorise = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[code]) ? authData.ELEVES_AUTORISES[code].autorise : false;

        const ligne = `
            <tr>
                <td class="ps-4">
                    <div class="fw-bold text-dark">${code}</div>
                </td>
                <td><span class="badge bg-light text-dark border">${eleve.classe}</span></td>
                <td>
                    <span class="badge ${estAutorise ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'} border ${estAutorise ? 'border-success' : 'border-secondary'}">
                        ${estAutorise ? 'Actif' : 'Inactif'}
                    </span>
                </td>
                <td class="text-end pe-4">
                    <button class="btn btn-primary btn-action shadow-sm" onclick="ouvrirUnivers('${code}', '${eleve.classe}')">
                        🚀 Entrer
                    </button>
                </td>
            </tr>
        `;
        tbody.innerHTML += ligne;
    });
}

// --- 3. L'UNIVERS ÉLÈVE (LE COEUR DU SYSTÈME) ---

window.ouvrirUnivers = function(code, classe) {
    currentEleveCode = code;
    
    // 1. Bascule d'interface
    document.getElementById('main-list-view').style.display = 'none';
    document.getElementById('student-universe').style.display = 'block';
    document.getElementById('btn-back-list').style.display = 'block';

    // 2. Remplissage Infos
    document.getElementById('univ-nom').innerText = `Élève ${code}`;
    document.getElementById('univ-classe').innerText = classe;
    document.getElementById('univ-code').innerText = code;
    
    // Bouton Action (Activer/Désactiver)
    const estAutorise = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[code]) ? authData.ELEVES_AUTORISES[code].autorise : false;
    updateBoutonActionUnivers(estAutorise);

    // 3. Connexion Temps Réel Firebase
    const dbRef = firebase.database().ref(`accompagnement/eleves/${code}`);
    dbRef.off(); // On nettoie les anciens écouteurs
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

// --- 4. VISUALISATIONS (GRAPHIQUES) ---

function renderUniversCharts(userData) {
    const scores = { "COG": 0, "EMO": 0, "SOC": 0 };
    const totals = { "COG": 0, "EMO": 0, "SOC": 0 };
    let totalValid = 0;
    let lastDate = null;

    // Calculs Données
    REF_DATA.axes.forEach(axe => {
        axe.phases.forEach(phase => {
            phase.competences_generales.forEach(cg => {
                cg.competences_specifiques.forEach(cs => {
                    totals[axe.id]++;
                    const safeId = sanitize(cs.id);
                    if (userData.competences_validees && userData.competences_validees[safeId] && userData.competences_validees[safeId].valide) {
                        scores[axe.id]++;
                        totalValid++;
                        const d = new Date(userData.competences_validees[safeId].date);
                        if(!lastDate || d > lastDate) lastDate = d;
                    }
                });
            });
        });
    });

    // Mise à jour Stats Texte
    document.getElementById('univ-total-valid').innerText = totalValid;
    document.getElementById('univ-last-date').innerText = lastDate ? lastDate.toLocaleDateString() : "Jamais";

    // 1. CHART RADAR (Compétences)
    const radarCtx = document.getElementById('univRadarChart').getContext('2d');
    if(charts.radar) charts.radar.destroy();
    
    charts.radar = new Chart(radarCtx, {
        type: 'radar',
        data: {
            labels: ['Cognitif', 'Social', 'Émotionnel'],
            datasets: [{
                label: 'Niveau',
                data: [
                    Math.round((scores["COG"]/totals["COG"])*100) || 0,
                    Math.round((scores["SOC"]/totals["SOC"])*100) || 0,
                    Math.round((scores["EMO"]/totals["EMO"])*100) || 0
                ],
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                borderColor: '#4f46e5',
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#4f46e5'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { r: { suggestedMin: 0, suggestedMax: 100 } },
            plugins: { legend: { display: false } }
        }
    });

    // 2. CHART DOUGHNUT (Contextes - Simulation car pas encore de données contexte précises, on met des placeholders intelligents)
    // Pour l'instant, comme on n'a pas encore le champ "contexte" dans la base, on va simuler une répartition équilibrée pour montrer le potentiel visuel
    const contextCtx = document.getElementById('univContextChart').getContext('2d');
    if(charts.context) charts.context.destroy();

    charts.context = new Chart(contextCtx, {
        type: 'doughnut',
        data: {
            labels: ['Cours', 'Atelier', 'Stage', 'Autre'],
            datasets: [{
                data: [30, 40, 20, 10], // Données simulées pour l'exemple visuel (à connecter plus tard)
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#6b7280'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right' } }
        }
    });
}

function renderTimeline(validees) {
    const container = document.getElementById('univ-timeline');
    container.innerHTML = '';

    if(!validees) {
        container.innerHTML = '<div class="text-muted fst-italic">Aucune activité récente.</div>';
        return;
    }

    // On transforme l'objet en tableau pour trier par date
    let actions = [];
    REF_DATA.axes.forEach(axe => {
        axe.phases.forEach(phase => {
            phase.competences_generales.forEach(cg => {
                cg.competences_specifiques.forEach(cs => {
                    const safeId = sanitize(cs.id);
                    if(validees[safeId] && validees[safeId].valide) {
                        actions.push({
                            nom: cs.nom,
                            date: new Date(validees[safeId].date),
                            niveau: validees[safeId].niveau,
                            preuve: validees[safeId].preuve
                        });
                    }
                });
            });
        });
    });

    // Tri du plus récent au plus ancien
    actions.sort((a, b) => b.date - a.date);

    actions.forEach(action => {
        const dateStr = action.date.toLocaleDateString() + ' à ' + action.date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        const etoiles = "⭐".repeat(action.niveau || 1);
        
        const div = document.createElement('div');
        div.className = 'timeline-item';
        div.innerHTML = `
            <div class="timeline-date">${dateStr}</div>
            <div class="timeline-content shadow-sm">
                <div class="d-flex justify-content-between">
                    <strong>${action.nom}</strong>
                    <span>${etoiles}</span>
                </div>
                <div class="text-muted small mt-1 fst-italic">"${action.preuve || '...'}"</div>
            </div>
        `;
        container.appendChild(div);
    });
}

// --- 5. LOGIQUE BOUTONS ---

function updateBoutonActionUnivers(estAutorise) {
    const btn = document.getElementById('univ-btn-action');
    if(estAutorise) {
        btn.innerText = "Bloquer l'accès";
        btn.className = "btn btn-outline-danger rounded-pill px-4";
        btn.onclick = () => basculerAutorisation(currentEleveCode, true);
    } else {
        btn.innerText = "Autoriser l'accès";
        btn.className = "btn btn-success rounded-pill px-4";
        btn.onclick = () => basculerAutorisation(currentEleveCode, false);
    }
}

async function basculerAutorisation(code, statutActuel) {
    const nouveauStatut = !statutActuel;
    // Update Local
    if (!authData.ELEVES_AUTORISES) authData.ELEVES_AUTORISES = {};
    if (!authData.ELEVES_AUTORISES[code]) authData.ELEVES_AUTORISES[code] = {};
    authData.ELEVES_AUTORISES[code].autorise = nouveauStatut;

    // Update Visuel Liste
    filtrerTableau();
    // Update Visuel Univers
    if(currentEleveCode === code) updateBoutonActionUnivers(nouveauStatut);

    // Update Firebase
    try {
        await firebase.database().ref(`accompagnement/autorisations/${code}`).update({ autorise: nouveauStatut });
    } catch (e) { alert("Erreur connexion: " + e); }
}

// Paramètres (Télécommande)
window.ouvrirParametres = async function() {
    const modal = new bootstrap.Modal(document.getElementById('modalParams'));
    try {
        const snap = await firebase.database().ref('accompagnement/config/horaires').once('value');
        const config = snap.val() || {};
        document.getElementById('cfg-ouverture').value = config.ouverture || 8;
        document.getElementById('cfg-fermeture').value = config.fermeture || 18;
        document.getElementById('cfg-maintenance').checked = config.maintenance || false;
        const jours = config.jours || [1,2,3,4,5];
        document.querySelectorAll('.day-check').forEach(chk => {
            chk.checked = jours.includes(parseInt(chk.value));
        });
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
