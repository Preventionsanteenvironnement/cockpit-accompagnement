// admin-auth.js - Version V20 (Finale)

let allEleves = [ { userCode: "KA47", classe: "B1AGO1" } ]; // + autres élèves
let html5QrcodeScanner = null;

// INIT
window.onload = function() {
    chargerDonnees();
    initScanner();
}

function showSection(id) {
    ['liste','scan','validations','ref'].forEach(s => document.getElementById('sec-'+s).style.display='none');
    document.getElementById('sec-'+id).style.display='block';
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    event.target.classList.add('active');
}

// --- SCANNER QR ---
function initScanner() {
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
    html5QrcodeScanner.render(onScanSuccess);
}

function onScanSuccess(decodedText) {
    try {
        const data = JSON.parse(decodedText);
        handleValidation(data);
        document.getElementById('scan-result').style.display='block';
        document.getElementById('scan-result').innerText = "✅ Validé pour " + data.eleve;
        setTimeout(() => document.getElementById('scan-result').style.display='none', 3000);
    } catch(e) { console.error("QR Invalide"); }
}

async function handleValidation(data) {
    const valRef = firebase.database().ref(`eleves/${data.eleve}/validations`).push();
    
    // Structure de validation propre
    const record = {
        date: new Date().toISOString(),
        type_flux: data.flux,
        competence: data.type_competence || data.competence, // Support anciens formats
        objectif_id: data.objectif || null,
        ref_id_officiel: "", // Champ vide prêt pour plus tard
        prof_validateur: "Professeur"
    };

    await valRef.set(record);

    // Si Flux 1 (Objectif), on le marque "done" aussi dans l'objet objectif
    if(data.flux === 1 && data.objectif) {
        firebase.database().ref(`eleves/${data.eleve}/objectifs/${data.objectif}`).update({
            done: true,
            validation_prof: true
        });
    }
    
    chargerValidations(); // Refresh liste
}

// --- CHARGEMENT DONNÉES ---
function chargerDonnees() {
    // Liste Élèves
    const cont = document.getElementById('liste-eleves'); cont.innerHTML = '';
    allEleves.forEach(e => {
        cont.innerHTML += `<div class="col-md-4"><div class="card p-3"><h5>${e.userCode}</h5><span class="badge bg-secondary">${e.classe}</span></div></div>`;
    });

    chargerValidations();
}

function chargerValidations() {
    // Lit toutes les validations de tous les élèves (simulation boucle)
    // Dans la vraie vie, il faudrait itérer sur tous les élèves
    // Ici on montre l'exemple pour KA47
    const tb = document.getElementById('table-validations'); tb.innerHTML = '';
    firebase.database().ref(`eleves/KA47/validations`).on('value', (s) => {
        const vals = s.val() || {};
        Object.values(vals).forEach(v => {
            tb.innerHTML += `<tr><td>${new Date(v.date).toLocaleDateString()}</td><td>KA47</td><td>Flux ${v.type_flux}</td><td>${v.competence}</td><td>${v.ref_id_officiel || '-'}</td></tr>`;
        });
    });
}
