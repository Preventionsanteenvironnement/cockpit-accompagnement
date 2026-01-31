// admin-auth.js - Version corrigée pour data_eleves.js

async function chargerDonneesAutorisations() {
    try {
        const listeEleves = document.getElementById('liste-eleves');
        const statusMsg = document.getElementById('status-message');
        
        // 1. On charge le fichier JS des élèves (data_eleves.js)
        if (typeof window.BDD_ELEVES === 'undefined') {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                // ICI : C'est le lien corrigé qui pointe vers votre fichier réel
                script.src = 'https://preventionsanteenvironnement.github.io/PSE/data_eleves.js';
                script.onload = resolve;
                script.onerror = () => reject(new Error("Impossible de trouver le fichier data_eleves.js sur le site PSE."));
                document.head.appendChild(script);
            });
        }

        const dataLife = window.BDD_ELEVES; // On récupère vos 150 élèves ici

        // 2. On charge les autorisations
        const responseAuth = await fetch('data/config/autorisations.json');
        const dataAuth = await responseAuth.json();

        listeEleves.innerHTML = '';
        
        // 3. On affiche la liste
        dataLife.forEach(eleve => {
            const code = eleve.userCode; 
            if (!code) return;

            const estAutorise = dataAuth.ELEVES_AUTORISES && dataAuth.ELEVES_AUTORISES[code] ? dataAuth.ELEVES_AUTORISES[code].autorise : false;

            const ligne = `
                <tr>
                    <td><strong>${code}</strong> <small>(${eleve.classe})</small></td>
                    <td><span class="badge ${estAutorise ? 'bg-success' : 'bg-secondary'}">${estAutorise ? 'Autorisé' : 'Non autorisé'}</span></td>
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
        console.error(error);
        document.getElementById('status-message').innerHTML = `<strong>Erreur :</strong> ${error.message}`;
    }
}

async function basculerAutorisation(code, statutActuel) {
    const nouveauStatut = !statutActuel;
    if (confirm(nouveauStatut ? `Autoriser ${code} ?` : `Retirer ${code} ?`)) {
        try {
            await firebase.database().ref(`accompagnement/autorisations/${code}`).set({
                autorise: nouveauStatut,
                date_modification: new Date().toISOString()
            });
            alert("Mise à jour réussie !");
            chargerDonneesAutorisations(); 
        } catch (error) {
            alert("Erreur Firebase : " + error);
        }
    }
}

window.onload = chargerDonneesAutorisations;
