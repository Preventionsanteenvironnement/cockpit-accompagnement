// admin-auth.js - Version V3 : Supervision Temps Réel
// Avec bouton "Voir" (Œil) et Graphique intégré

let allEleves = [];
let authData = {};
let currentModalChart = null; // Pour stocker le graphique actif

// Données du référentiel (Hardcodées pour éviter tout bug de chargement)
const REF_DATA = { "axes": [ { "id": "COG", "nom": "Compétences Cognitives", "phases": [ { "id": 1, "competences_generales": [ { "id": "C1", "nom": "Conscience de soi", "competences_specifiques": [ { "id": "C1.1", "nom": "Accroître sa connaissance de soi" }, { "id": "C1.2", "nom": "Savoir penser de façon critique" }, { "id": "C1.3", "nom": "Connaître ses valeurs et besoins" }, { "id": "C1.4", "nom": "Prendre des décisions constructives" }, { "id": "C1.5", "nom": "S’auto-évaluer positivement" }, { "id": "C1.6", "nom": "Renforcer sa pleine attention" } ] } ] } ] }, { "id": "EMO", "nom": "Compétences Émotionnelles", "phases": [ { "id": 1, "competences_generales": [ { "id": "E1", "nom": "Conscience des émotions", "competences_specifiques": [ { "id": "E1.1", "nom": "Comprendre les émotions" }, { "id": "E1.2", "nom": "Identifier ses émotions" } ] } ] } ] }, { "id": "SOC", "nom": "Compétences Sociales", "phases": [ { "id": 1, "competences_generales": [ { "id": "S1", "nom": "Relations constructives", "competences_specifiques": [ { "id": "S1.1", "nom": "Communiquer de façon efficace" }, { "id": "S1.2", "nom": "Communiquer de façon empathique" }, { "id": "S1.3", "nom": "Développer des liens prosociaux" } ] } ] } ] } ] };

async function chargerDonneesAutorisations() {
    try {
        const statusMsg = document.getElementById('status-message');
        
        // 1. Chargement BDD Élèves
        if (typeof window.BDD_ELEVES === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://preventionsanteenvironnement.github.io/PSE/data_eleves.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error("Erreur chargement BDD Élèves"));
                document.head.appendChild(script);
            });
        }
        allEleves = window.BDD_ELEVES; 

        // 2. Chargement config locale (si besoin)
        try {
            const responseAuth = await fetch('data/config/autorisations.json');
            authData = await responseAuth.json();
        } catch(e) { console.log("Pas de config locale, pas grave."); }

        // 3. Init Filtres
        initialiserFiltres();
        filtrerTableau();
        statusMsg.style.display = 'none';

        // 4. Écouteurs
        document.getElementById('search-input').addEventListener('input', filtrerTableau);
        document.getElementById('filter-classe').addEventListener('change', filtrerTableau);
        document.getElementById('filter-status').addEventListener('change', filtrerTableau);

    } catch (error) {
        console.error("Erreur :", error);
        document.getElementById('status-message').innerText = "Erreur de chargement.";
    }
}

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
    counter.innerText = `${liste.length} élèves`;

    if (liste.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Aucun résultat.</td></tr>';
        return;
    }

    liste.forEach(eleve => {
        const code = eleve.userCode;
        const estAutorise = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[code]) ? authData.ELEVES_AUTORISES[code].autorise : false;

        const ligne = `
            <tr>
                <td>
                    <strong>${code}</strong> <small class="text-muted">(${eleve.classe})</small>
                </td>
                <td>
                    <span class="badge ${estAutorise ? 'bg-success' : 'bg-secondary'}">
                        ${estAutorise ? 'Autorisé' : 'Bloqué'}
                    </span>
                </td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-2" onclick="voirEleve('${code}')" title="Voir le profil">
                        👁️ Voir
                    </button>
                    <button class="btn btn-sm ${estAutorise ? 'btn-outline-danger' : 'btn-primary'}" 
                            onclick="basculerAutorisation('${code}', ${estAutorise})">
                        ${estAutorise ? 'Retirer' : 'Activer'}
                    </button>
                </td>
            </tr>
        `;
        tbody.innerHTML += ligne;
    });
}

// --- PARTIE 1 : GESTION AUTORISATION ---
async function basculerAutorisation(code, statutActuel) {
    const nouveauStatut = !statutActuel;
    if (!authData.ELEVES_AUTORISES) authData.ELEVES_AUTORISES = {};
    if (!authData.ELEVES_AUTORISES[code]) authData.ELEVES_AUTORISES[code] = {};
    authData.ELEVES_AUTORISES[code].autorise = nouveauStatut;
    filtrerTableau(); 

    try {
        await firebase.database().ref(`accompagnement/autorisations/${code}`).update({
            autorise: nouveauStatut,
            date_modif: new Date().toISOString()
        });
    } catch (e) { alert("Erreur Firebase: " + e); }
}

// --- PARTIE 2 : SUPERVISION (LE COEUR DU SUJET) ---
window.voirEleve = function(code) {
    // 1. Ouvrir la modale
    const modal = new bootstrap.Modal(document.getElementById('modalEleve'));
    document.getElementById('modal-eleve-titre').innerText = code;
    modal.show();

    // 2. Écouter Firebase pour CET élève en temps réel
    const dbRef = firebase.database().ref(`accompagnement/eleves/${code}`);
    
    // On coupe l'écoute quand on ferme la modale pour économiser
    const modalEl = document.getElementById('modalEleve');
    modalEl.addEventListener('hidden.bs.modal', function () {
        dbRef.off(); 
    }, { once: true });

    dbRef.on('value', (snapshot) => {
        const data = snapshot.val() || { competences_validees: {} };
        mettreAJourGraphiqueAdmin(data);
        afficherListeCompetences(data.competences_validees || {});
    });
};

function mettreAJourGraphiqueAdmin(userData) {
    const scores = { "COG": 0, "EMO": 0, "SOC": 0 };
    const totals = { "COG": 0, "EMO": 0, "SOC": 0 };

    REF_DATA.axes.forEach(axe => {
        axe.phases.forEach(phase => {
            phase.competences_generales.forEach(cg => {
                cg.competences_specifiques.forEach(cs => {
                    totals[axe.id]++;
                    if (userData.competences_validees && userData.competences_validees[cs.id]) {
                        scores[axe.id]++;
                    }
                });
            });
        });
    });

    const dataPercent = [
        totals["COG"] ? Math.round((scores["COG"] / totals["COG"]) * 100) : 0,
        totals["SOC"] ? Math.round((scores["SOC"] / totals["SOC"]) * 100) : 0,
        totals["EMO"] ? Math.round((scores["EMO"] / totals["EMO"]) * 100) : 0
    ];

    const ctx = document.getElementById('adminRadarChart').getContext('2d');
    
    if (currentModalChart) {
        currentModalChart.data.datasets[0].data = dataPercent;
        currentModalChart.update();
    } else {
        currentModalChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Cognitif', 'Social', 'Émotionnel'],
                datasets: [{
                    label: 'Niveau Élève',
                    data: dataPercent,
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                scales: { r: { suggestedMin: 0, suggestedMax: 100 } },
                plugins: { legend: { display: false } }
            }
        });
    }
}

function afficherListeCompetences(validees) {
    const container = document.getElementById('modal-liste-competences');
    container.innerHTML = '';
    
    let vide = true;
    REF_DATA.axes.forEach(axe => {
        axe.phases.forEach(phase => {
            phase.competences_generales.forEach(cg => {
                cg.competences_specifiques.forEach(cs => {
                    if (validees[cs.id]) {
                        vide = false;
                        const item = document.createElement('div');
                        item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
                        item.innerHTML = `
                            <div>
                                <strong>${cs.nom}</strong>
                                <br><small class="text-muted">${cg.nom}</small>
                            </div>
                            <span class="badge bg-success rounded-pill">Validé</span>
                        `;
                        container.appendChild(item);
                    }
                });
            });
        });
    });

    if (vide) {
        container.innerHTML = '<div class="text-center p-3 text-muted">Aucune compétence validée pour l\'instant.</div>';
    }
}

window.onload = chargerDonneesAutorisations;
