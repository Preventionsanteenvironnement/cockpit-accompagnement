// admin-auth.js - Version Spéciale pour data_eleves.js

async function chargerDonneesAutorisations() {
    try {
        const listeEleves = document.getElementById('liste-eleves');
        const statusMsg = document.getElementById('status-message');
        
        // 1. On charge votre fichier spécifique "data_eleves.js" depuis le site PSE
        // C'est ici que ça bloquait avant : on change la méthode de lecture.
        if (typeof window.BDD_ELEVES === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                // L'adresse exacte de votre fichier (vérifiée sur votre capture)
                script.src = 'https://preventionsanteenvironnement.github.io/PSE/data_eleves.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error("Impossible de trouver le fichier data_eleves.js sur le site PSE."));
                document.head.appendChild(script);
            });
        }

        // On récupère les données de votre fichier
        const dataLife = window.BDD_ELEVES; 
        console.log("Élèves trouvés :", dataLife.length);

        // 2. On charge les autorisations du cockpit
        const responseAuth = await fetch('data/config/autorisations.json');
        const dataAuth = await responseAuth.json();

        listeEleves.innerHTML = ''; // On vide le tableau pour le remplir
        
        // 3. On affiche la liste ligne par ligne
        dataLife.forEach(eleve => {
            const code = eleve.userCode; // Votre fichier utilise 'userCode'
            if (!code) return;

            const estAutorise = dataAuth.ELEVES_AUTORISES && dataAuth.ELEVES_AUTORISES[code] ? dataAuth.ELEVES_AUTORISES[code].autorise : false;

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
                            ${estAutorise ? 'Retirer accès' : 'Activer accès'}
                        </button>
                    </td>
                </tr>
            `;
            listeEleves.innerHTML += ligne;
        });

        statusMsg.style.display = 'none';

    } catch (error) {
        console.error("Erreur :", error);
        document.getElementById('status-message').innerHTML = `<strong>Erreur :</strong> ${error.message}`;
        document.getElementById('status-message').classList.replace('alert-info', 'alert-danger');
    }
}

// Fonction pour sauvegarder dans Firebase quand vous cliquez sur un bouton
async function basculerAutorisation(code, statutActuel) {
    const nouveauStatut = !statutActuel;
    // Petit message de confirmation
    if (confirm(nouveauStatut ? `Autoriser l'élève ${code} ?` : `Retirer l'accès à ${code} ?`)) {
        try {
            await firebase.database().ref(`accompagnement/autorisations/${code}`).set({
                autorise: nouveauStatut,
                date_modification: new Date().toISOString(),
                parcours: "Standard"
            });
            alert("Mise à jour réussie !");
            chargerDonneesAutorisations(); // On rafraîchit la liste
        } catch (error) {
            alert("Erreur de connexion Firebase : " + error);
        }
    }
}

// Lancement automatique au démarrage
window.onload = chargerDonneesAutorisations;
