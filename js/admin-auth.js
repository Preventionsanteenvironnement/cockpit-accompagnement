// admin-auth.js - Gestion des autorisations du Cockpit (Version Compatible BDD_ELEVES)

async function chargerDonneesAutorisations() {
    try {
        const listeEleves = document.getElementById('liste-eleves');
        const statusMsg = document.getElementById('status-message');
        
        // 1. Chargement dynamique du script BDD Élèves depuis le site PSE
        if (typeof window.BDD_ELEVES === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                // URL exacte vue sur votre capture
                script.src = 'https://preventionsanteenvironnement.github.io/PSE/data_eleves.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error("Impossible de charger data_eleves.js depuis le site PSE"));
                document.head.appendChild(script);
            });
        }

        const dataLife = window.BDD_ELEVES; // On récupère la variable globale du fichier chargé
        console.log("Élèves chargés :", dataLife.length);

        // 2. Chargement du fichier d'autorisations spécifique (local au cockpit)
        const responseAuth = await fetch('data/config/autorisations.json');
        const dataAuth = await responseAuth.json();

        listeEleves.innerHTML = ''; // On vide le tableau
        
        // 3. Boucle sur tous les élèves
        dataLife.forEach(eleve => {
            const code = eleve.userCode; // Votre fichier utilise 'userCode' et non 'code'
            if (!code) return;

            const estAutorise = dataAuth.ELEVES_AUTORISES && dataAuth.ELEVES_AUTORISES[code] ? dataAuth.ELEVES_AUTORISES[code].autorise : false;

            const ligne = `
                <tr>
                    <td><strong>${code}</strong> <small class="text-muted">(${eleve.classe})</small></td>
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
        msgDiv.innerHTML = `<strong>Erreur :</strong> ${error.message}<br>Vérifiez l'URL de data_eleves.js`;
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
            const dbRef = firebase.database().ref(`accompagnement/autorisations/${code}`);
            
            await dbRef.set({
                autorise: nouveauStatut,
                date_modification: new Date().toISOString(),
                parcours: "Standard"
            });

            alert("Mise à jour réussie !");
            chargerDonneesAutorisations(); 
            
        } catch (error) {
            console.error("Erreur Firebase :", error);
            alert("Erreur lors de la mise à jour des droits.");
        }
    }
}

window.onload = chargerDonneesAutorisations;
