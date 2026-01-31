// admin-auth.js - Version V2 avec Filtres et Recherche

// Variables globales pour stocker les données
let allEleves = [];
let authData = {};

async function chargerDonneesAutorisations() {
    try {
        const listeEleves = document.getElementById('liste-eleves');
        const statusMsg = document.getElementById('status-message');
        
        // 1. Chargement de la BDD Élèves (data_eleves.js) depuis le site PSE
        if (typeof window.BDD_ELEVES === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://preventionsanteenvironnement.github.io/PSE/data_eleves.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error("Impossible de trouver le fichier data_eleves.js"));
                document.head.appendChild(script);
            });
        }

        allEleves = window.BDD_ELEVES; 

        // 2. Chargement des autorisations (config locale)
        const responseAuth = await fetch('data/config/autorisations.json');
        authData = await responseAuth.json();

        // 3. IMPORTANT : On remplit le menu déroulant des classes
        initialiserFiltres();

        // 4. On affiche tout le monde au démarrage
        filtrerTableau();

        statusMsg.style.display = 'none';

        // 5. On active les "écouteurs" (dès qu'on touche un filtre, ça met à jour)
        document.getElementById('search-input').addEventListener('input', filtrerTableau);
        document.getElementById('filter-classe').addEventListener('change', filtrerTableau);
        document.getElementById('filter-status').addEventListener('change', filtrerTableau);

    } catch (error) {
        console.error("Erreur :", error);
        document.getElementById('status-message').innerHTML = `<strong>Erreur :</strong> ${error.message}`;
        document.getElementById('status-message').classList.replace('alert-info', 'alert-danger');
    }
}

// Fonction qui trouve toutes les classes uniques (B1AGO1, etc.) et remplit le menu
function initialiserFiltres() {
    // On extrait la liste des classes sans doublons
    const classes = [...new Set(allEleves.map(e => e.classe))].sort();
    const selectClasse = document.getElementById('filter-classe');
    
    // On vide le menu pour être sûr (sauf l'option "Toutes")
    selectClasse.innerHTML = '<option value="ALL">Toutes les classes</option>';

    classes.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls;
        option.innerText = cls;
        selectClasse.appendChild(option);
    });
}

// Fonction centrale qui décide qui afficher selon les filtres choisis
function filtrerTableau() {
    const searchText = document.getElementById('search-input').value.toLowerCase();
    const selectedClasse = document.getElementById('filter-classe').value;
    const selectedStatus = document.getElementById('filter-status').value;

    const resultats = allEleves.filter(eleve => {
        const code = eleve.userCode;
        // On regarde si on a une info Firebase locale pour cet élève, sinon false
        const estAutorise = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[code]) 
                            ? authData.ELEVES_AUTORISES[code].autorise 
                            : false;

        // 1. Filtre Recherche (Nom ou Code)
        const matchSearch = code.toLowerCase().includes(searchText) || eleve.classe.toLowerCase().includes(searchText);
        
        // 2. Filtre Classe
        const matchClasse = (selectedClasse === "ALL") || (eleve.classe === selectedClasse);
        
        // 3. Filtre Statut
        let matchStatus = true;
        if (selectedStatus === "AUTHORIZED") matchStatus = estAutorise;
        if (selectedStatus === "UNAUTHORIZED") matchStatus = !estAutorise;

        return matchSearch && matchClasse && matchStatus;
    });

    afficherTableau(resultats);
}

// Fonction d'affichage pur (dessine le tableau)
function afficherTableau(liste) {
    const tbody = document.getElementById('liste-eleves');
    const counter = document.getElementById('counter-display');
    tbody.innerHTML = '';
    
    counter.innerText = `${liste.length} élèves`;

    if (liste.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Aucun élève ne correspond aux filtres.</td></tr>';
        return;
    }

    liste.forEach(eleve => {
        const code = eleve.userCode;
        const estAutorise = (authData.ELEVES_AUTORISES && authData.ELEVES_AUTORISES[code]) 
                            ? authData.ELEVES_AUTORISES[code].autorise 
                            : false;

        const ligne = `
            <tr>
                <td><strong>${code}</strong> <small class="text-muted">(${eleve.classe})</small></td>
                <td>
                    <span class="badge ${estAutorise ? 'bg-success' : 'bg-secondary'}">
                        ${estAutorise ? 'Autorisé' : 'Non autorisé'}
                    </span>
                </td>
                <td>
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

// Action sur le bouton (Envoi vers Firebase)
async function basculerAutorisation(code, statutActuel) {
    const nouveauStatut = !statutActuel;
    
    // Mise à jour locale immédiate pour que l'interface soit réactive
    if (!authData.ELEVES_AUTORISES) authData.ELEVES_AUTORISES = {};
    if (!authData.ELEVES_AUTORISES[code]) authData.ELEVES_AUTORISES[code] = {};
    authData.ELEVES_AUTORISES[code].autorise = nouveauStatut;

    // On rafraichit le tableau tout de suite
    filtrerTableau(); 

    try {
        await firebase.database().ref(`accompagnement/autorisations/${code}`).set({
            autorise: nouveauStatut,
            date_modification: new Date().toISOString(),
            parcours: "Standard"
        });
        console.log(`Sauvegarde réussie pour ${code}`);
    } catch (error) {
        alert("Erreur Firebase : " + error);
        // On annule le changement si ça a planté
        authData.ELEVES_AUTORISES[code].autorise = statutActuel;
        filtrerTableau();
    }
}

window.onload = chargerDonneesAutorisations;
