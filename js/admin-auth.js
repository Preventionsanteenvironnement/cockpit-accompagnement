// admin-auth.js - Gestion des autorisations du Cockpit

async function chargerDonneesAutorisations() {
    try {
        // 1. Chargement de votre base globale (DataLife)
        // Note : Ajustez l'URL vers votre fichier DataLife réel
        const responseDataLife = await fetch('URL_DE_VOTRE_FICHIER_DATALIFE.json');
        const dataLife = await responseDataLife.json();

        // 2. Chargement du fichier d'autorisations spécifique
        const responseAuth = await fetch('data/config/autorisations.json');
        const dataAuth = await responseAuth.json();

        const listeEleves = document.getElementById('liste-eleves');
        const statusMsg = document.getElementById('status-message');

        listeEleves.innerHTML = ''; // On vide le tableau
        
        // 3. Boucle sur tous les élèves de DataLife pour vérifier leur statut
        dataLife.forEach(eleve => {
            const code = eleve.code; // Adapter selon votre clé 'code' ou 'id'
            const estAutorise = dataAuth.ELEVES_AUTORISES[code] ? dataAuth.ELEVES_AUTORISES[code].autorise : false;

            const ligne = `
                <tr>
                    <td><strong>${code}</strong></td>
                    <td>
                        <span class="badge ${estAutorise ? 'bg-success' : 'bg-secondary'}">
                            ${estAutorise ? 'Autorisé (VIP)' : 'Non autorisé'}
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
        console.error("Erreur de chargement :", error);
        document.getElementById('status-message').innerHTML = "Erreur de connexion aux fichiers de données.";
        document.getElementById('status-message').classList.replace('alert-info', 'alert-danger');
    }
}

// Fonction de basculement (sera liée à Firebase dans l'étape suivante)
function basculerAutorisation(code, statutActuel) {
    console.log(`Action pour ${code} : changer vers ${!statutActuel}`);
    alert(`Action enregistrée pour ${code}. La synchronisation Firebase sera activée à l'étape suivante.`);
}

// Lancement au chargement de la page
window.onload = chargerDonneesAutorisations;
