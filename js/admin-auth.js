// cockpit-accompagnement-main/js/admin-auth.js

const DB_ROOT = "accompagnement";
const PATH_ELEVES = `${DB_ROOT}/eleves`;
const PATH_VALIDATIONS = `${DB_ROOT}/validations`;

// Codes simples côté client (à garder léger, ce n’est pas une vraie sécurité)
const ADMIN_CODES = ["MAPSE", "PSE", "PSE2026"];

let adminCode = sessionStorage.getItem("adminCode") || null;
let scanner = null;
let scannerRunning = false;

function requireAdmin() {
  if (adminCode) return true;

  const input = prompt("Code enseignant");
  if (!input) return false;

  const code = input.trim().toUpperCase();
  if (!ADMIN_CODES.includes(code)) {
    alert("Code invalide");
    return false;
  }
  adminCode = code;
  sessionStorage.setItem("adminCode", adminCode);
  return true;
}

function showSection(section, evt) {
  const e = evt || window.event;

  if (!requireAdmin()) return;

  document.getElementById("sec-liste").style.display = section === "liste" ? "block" : "none";
  document.getElementById("sec-scan").style.display = section === "scan" ? "block" : "none";
  document.getElementById("sec-validations").style.display = section === "validations" ? "block" : "none";
  document.getElementById("sec-ref").style.display = section === "ref" ? "block" : "none";

  document.querySelectorAll(".sidebar .nav-link").forEach(a => a.classList.remove("active"));
  if (e && e.target) e.target.classList.add("active");

  if (section === "liste") loadEleves();
  if (section === "validations") loadValidations();
  if (section === "scan") startScanner();
  else stopScanner();
}

window.showSection = showSection;

// ---------- LISTE ELEVES ----------

function countGoals(obj = {}) {
  const goals = obj.objectifs || {};
  let enCours = 0;
  let atteints = 0;
  Object.values(goals).forEach(g => {
    if (g && g.done) atteints++;
    else enCours++;
  });
  return { enCours, atteints, total: enCours + atteints };
}

function loadEleves() {
  const container = document.getElementById("liste-eleves");
  container.innerHTML = "";

  firebase.database().ref(PATH_ELEVES).once("value").then(snap => {
    const data = snap.val() || {};
    const codes = Object.keys(data).sort();

    if (codes.length === 0) {
      container.innerHTML = `<div class="text-muted">Aucun élève trouvé dans ${PATH_ELEVES}</div>`;
      return;
    }

    codes.forEach(code => {
      const eleve = data[code] || {};
      const { enCours, atteints, total } = countGoals(eleve);
      const moodToday = getTodayMoodLabel(eleve);

      container.innerHTML += `
        <div class="col-12 col-md-6 col-lg-4">
          <div class="card p-3 h-100">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="fw-bold">${code}</div>
                <div class="text-muted small">${moodToday}</div>
              </div>
              <button class="btn btn-sm btn-outline-primary" onclick="openEleveValidations('${code}')">Voir</button>
            </div>

            <hr class="my-3">

            <div class="d-flex gap-2">
              <div class="badge text-bg-primary">En cours ${enCours}</div>
              <div class="badge text-bg-success">Atteints ${atteints}</div>
              <div class="badge text-bg-secondary">Total ${total}</div>
            </div>
          </div>
        </div>
      `;
    });
  });
}

function getTodayMoodLabel(eleve) {
  const meteo = eleve.meteo || {};
  const today = new Date().toISOString().split("T")[0];
  const m = meteo[today];
  if (!m) return "Météo non saisie";
  const p = m.primary || "";
  const s = m.secondary || "";
  return s ? `Météo ${p} - ${s}` : `Météo ${p}`;
}

// ---------- VALIDATIONS ----------

function loadValidations() {
  const tbody = document.getElementById("table-validations");
  tbody.innerHTML = "";

  firebase.database().ref(PATH_VALIDATIONS).orderByChild("timestamp").limitToLast(200).once("value").then(snap => {
    const vals = snap.val() || {};
    const rows = Object.entries(vals)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted">Aucune validation</td></tr>`;
      return;
    }

    rows.forEach(v => {
      const d = v.timestamp ? new Date(v.timestamp).toLocaleString() : "";
      const eleve = v.eleve || "";
      const flux = v.flux === 1 ? "Objectif" : (v.flux === 2 ? "Reconnaissance" : "Inconnu");
      const comp = v.competence || v.type_reconnaissance || "";
      const detail = v.objectif ? `objectif ${v.objectif}` : (v.cadre ? `cadre ${v.cadre}` : "");

      tbody.innerHTML += `
        <tr>
          <td>${d}</td>
          <td>${eleve}</td>
          <td>${flux}</td>
          <td>${comp}</td>
          <td>${detail}</td>
        </tr>
      `;
    });
  });
}

window.openEleveValidations = function(code) {
  if (!requireAdmin()) return;

  const tbody = document.getElementById("table-validations");
  tbody.innerHTML = "";
  showSection("validations");

  firebase.database().ref(`${PATH_ELEVES}/${code}/validations`).orderByChild("timestamp").limitToLast(200).once("value").then(snap => {
    const vals = snap.val() || {};
    const rows = Object.entries(vals)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-muted">Aucune validation pour ${code}</td></tr>`;
      return;
    }

    rows.forEach(v => {
      const d = v.timestamp ? new Date(v.timestamp).toLocaleString() : "";
      const flux = v.flux === 1 ? "Objectif" : (v.flux === 2 ? "Reconnaissance" : "Inconnu");
      const comp = v.competence || v.type_reconnaissance || "";
      const detail = v.objectif ? `objectif ${v.objectif}` : (v.cadre ? `cadre ${v.cadre}` : "");

      tbody.innerHTML += `
        <tr>
          <td>${d}</td>
          <td>${code}</td>
          <td>${flux}</td>
          <td>${comp}</td>
          <td>${detail}</td>
        </tr>
      `;
    });
  });
};

// ---------- SCAN QR ----------

function startScanner() {
  if (!requireAdmin()) return;

  if (!scanner) {
    scanner = new Html5Qrcode("reader");
  }
  if (scannerRunning) return;

  const onSuccess = (decodedText) => onScanSuccess(decodedText);
  const onError = () => {};

  scanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },
    onSuccess,
    onError
  ).then(() => {
    scannerRunning = true;
  }).catch(() => {
    scannerRunning = false;
  });
}

function stopScanner() {
  if (!scanner || !scannerRunning) return;
  scanner.stop().then(() => {
    scannerRunning = false;
  }).catch(() => {
    scannerRunning = false;
  });
}

function safeParseJSON(txt) {
  try { return JSON.parse(txt); } catch { return null; }
}

function writeValidationBoth(p) {
  const payload = {
    ...p,
    validator: adminCode || "",
    validated_at: Date.now()
  };

  const updates = {};
  const globalKey = firebase.database().ref(PATH_VALIDATIONS).push().key;
  updates[`${PATH_VALIDATIONS}/${globalKey}`] = payload;

  if (payload.eleve) {
    const eleveKey = firebase.database().ref(`${PATH_ELEVES}/${payload.eleve}/validations`).push().key;
    updates[`${PATH_ELEVES}/${payload.eleve}/validations/${eleveKey}`] = payload;
  }

  return firebase.database().ref().update(updates);
}

function validateGoalDone(eleve, objectifId) {
  const path = `${PATH_ELEVES}/${eleve}/objectifs/${objectifId}`;
  return firebase.database().ref(path).update({
    done: true,
    date_done: new Date().toISOString()
  });
}

function onScanSuccess(decodedText) {
  const box = document.getElementById("scan-result");
  const data = safeParseJSON(decodedText);

  if (!data || !data.eleve || !data.timestamp) {
    box.style.display = "block";
    box.className = "mt-3 alert alert-danger";
    box.innerText = "QR illisible ou incomplet";
    return;
  }

  const flux = Number(data.flux || 0);

  // Flux 1 objectif
  if (flux === 1 && data.objectif) {
    validateGoalDone(data.eleve, data.objectif)
      .then(() => writeValidationBoth(data))
      .then(() => {
        box.style.display = "block";
        box.className = "mt-3 alert alert-success";
        box.innerText = `Validé objectif pour ${data.eleve}`;
        loadValidations();
      })
      .catch(() => {
        box.style.display = "block";
        box.className = "mt-3 alert alert-danger";
        box.innerText = "Erreur validation objectif";
      });
    return;
  }

  // Flux 2 reconnaissance
  if (flux === 2) {
    writeValidationBoth(data)
      .then(() => {
        box.style.display = "block";
        box.className = "mt-3 alert alert-success";
        box.innerText = `Validé reconnaissance pour ${data.eleve}`;
        loadValidations();
      })
      .catch(() => {
        box.style.display = "block";
        box.className = "mt-3 alert alert-danger";
        box.innerText = "Erreur validation reconnaissance";
      });
    return;
  }

  box.style.display = "block";
  box.className = "mt-3 alert alert-warning";
  box.innerText = "Flux non reconnu";
}

window.addEventListener("load", () => {
  // Démarrage sur liste si admin ok
  if (requireAdmin()) {
    loadEleves();
    loadValidations();
  }
});
