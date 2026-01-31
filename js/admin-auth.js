// admin-auth.js - Gestion des autorisations du Cockpit (Version Corrigée)

async function chargerDonneesAutorisations() {
    try {
        // --- CORRECTION ICI ---
        // On va chercher le fichier DataLife directement sur ton site PSE existant.
        // NOTE : J'ai supposé que le fichier s'appelle "DataLife.json" et qu'il est dans le dossier "data".
        // Si il s'appelle "DataEleves.json", modifie juste la fin de cette ligne.
        const urlDataLife = 'https://preventionsanteenvironnement.github.io/PSE/data/DataLife.json';
        
        const responseDataLife = await fetch(urlDataLife);
        
        if (!responseDataLife.ok) {
            throw new Error(`Impossible de lire le fichier DataLife sur PSE (Erreur ${responseDataLife.status})`);
        }
        
        const dataLife = await responseDataLife.json();
        // ----------------------

        // 2. Chargement du fichier d'autorisations spécifique (local au cockpit)
        const responseAuth = await fetch('data/config/autorisations.json');
        const dataAuth = await responseAuth.json();

        const listeEleves = document.getElementById('liste-eleves');
        const statusMsg = document.getElementById('status-message');

        listeEleves.innerHTML = ''; // On vide le tableau
        
        // 3. Boucle sur tous les élèves de DataLife pour vérifier leur statut
        dataLife.forEach(eleve => {
            // Sécurité : on s'assure qu'il y a bien un code
            const code = eleve.code || eleve.id; 
            if (!code) return;

            const estAutorise = dataAuth.ELEVES_AUTORISES && dataAuth.ELEVES_AUTORISES[code] ? dataAuth.ELEVES_AUTORISES[code].autorise : false;

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
        const msgDiv = document.getElementById('status-message');
        msgDiv.innerHTML = `<strong>Erreur :</strong> Impossible de charger les données.<br>Vérifiez que le fichier DataLife existe bien à l'adresse :<br><small>https://preventionsanteenvironnement.github.io/PSE/data/DataLife.json</small>`;
        msgDiv.classList.replace('alert-info', 'alert-danger');
    }
}

// Fonction pour activer/désactiver l'accès en temps réel dans Firebase
async function basculerAutorisation(code, statutActuel) {
    const nouveauStatut = !statutActuel;
    const confirmMsg = nouveauStatut 
        ? `Autoriser l'élève ${code} pour l'accompagnement ?` 
        : `Révoquer l'accès pour l'élève ${code} ?`;

    if (confirm(confirmMsg)) {
        try {
            // Chemin dans votre base Firebase
            const dbRef = firebase.database().ref(`accompagnement/autorisations/${code}`);
            
            await dbRef.set({
                autorise: nouveauStatut,
                date_modification: new Date().toISOString(),
                parcours: "Standard"
            });

            alert("Mise à jour réussie !");
            // On recharge les données pour actualiser l'affichage
            chargerDonneesAutorisations(); 
            
        } catch (error) {
            console.error("Erreur Firebase :", error);
            alert("Erreur lors de la mise à jour des droits.");
        }
    }
}

// Lancement au chargement de la page
window.onload = chargerDonneesAutorisations;
