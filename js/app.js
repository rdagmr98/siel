/* SPA SIEL — router a hash + tutte le pagine.
   Collega index.html a Store (dati su siel-data), Logic (porto di db.py), Ore.
   Ogni mutazione passa per Logic (che torna le tabelle cambiate) e poi save()
   committa quelle tabelle su GitHub in un unico commit atomico. */
(function (global) {
  "use strict";

  var S = global.Store, L = global.Logic, O = global.Ore;
  var app = document.getElementById("app");
  var flashEl = document.getElementById("flash");
  var busyEl = document.getElementById("busy");

  var POS = ["E", "I", "F", "Inc.", "F.U."];
  var MESI = ["", "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
              "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

  // ─── helper base ───────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmt(v) { return O.format_ore(v == null ? "" : v); }
  function d10(s) { return String(s == null ? "" : s).slice(0, 10); }
  function render(html) { app.innerHTML = html; }
  function busy(on) { busyEl.classList.toggle("on", !!on); }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }
  function todayISO() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function firstOfMonthISO() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-01"; }

  var flashTimer = null;
  function flash(msg, type) {
    type = type || "info";
    flashEl.innerHTML = '<div class="alert alert-' + type + ' alert-dismissible fade show no-print" role="alert">' +
      esc(msg) + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button></div>';
    if (flashTimer) clearTimeout(flashTimer);
    if (type === "success" || type === "info")
      flashTimer = setTimeout(function () { flashEl.innerHTML = ""; }, 4000);
  }

  function posClass(p) { return "pos-" + (p === "F.U." ? "FU" : (p === "Inc." ? "Inc" : p)); }
  function posSpan(p) { return p ? '<span class="' + posClass(p) + '">' + esc(p) + "</span>" : "–"; }
  function opt(v, label, sel) {
    return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? " selected" : "") + ">" + esc(label) + "</option>";
  }
  function posSelect(sel) {
    return '<select name="pos" class="form-select form-select-sm">' +
      POS.map(function (p) { return opt(p, p, sel); }).join("") + "</select>";
  }
  function tipiOptions(sel) {
    return L.getTipi().map(function (t) { return opt(t.id_tipo, t.tipo_eli, sel); }).join("");
  }
  function oreCompl(e) { return O.somma_ore(e.Ore_totali || 0, e.Ore_iniziali || 0); }
  function durCell(e) { return String(e.ore_dur_appl) === "True" ? fmt(e.Ore_DUR || 0) : "–"; }
  function checkedVals(f, name) {
    return Array.prototype.slice.call(f.querySelectorAll('input[name="' + name + '"]:checked'))
      .map(function (c) { return c.value; });
  }

  // ─── dati: guard + salvataggio ─────────────────────────────────────────────
  function renderNeedPat() {
    render('<div class="alert alert-warning">Configura il <strong>Personal Access Token</strong> ' +
      'in <em>Impostazioni</em> (in alto a destra) per caricare i dati del reparto.</div>');
  }

  async function ensureLoaded() {
    if (S.isLoaded()) return true;
    if (!S.hasPat()) { flash("Token mancante: aprire Impostazioni.", "warning"); openSettings(); return false; }
    busy(true);
    try { await S.loadAll(); return true; }
    catch (e) { flash(e.message, "danger"); return false; }
    finally { busy(false); }
  }

  async function save(changed, message) {
    busy(true);
    try { await S.commit(changed, message); busy(false); return true; }
    catch (e) {
      busy(false);
      flash("Salvataggio fallito: " + e.message + " — ricarico i dati dal repo.", "danger");
      try { S.reset(); await S.loadAll(true); } catch (_) {}
      route();
      return false;
    }
  }

  // ─── intestazioni report (ente / indirizzi) ────────────────────────────────
  function enteHeader() {
    var voci = L.getEnte().map(function (e) { return esc(e.Voce || ""); }).filter(Boolean);
    return '<div class="text-center fw-bold mb-2">' + (voci.join("<br>") || "&nbsp;") + "</div>";
  }
  function indirizziFooter() {
    var ind = L.getIndirizzi().map(function (i) { return esc(i.indirizzi || ""); }).filter(Boolean);
    if (!ind.length) return "";
    return '<div class="small text-muted mt-3 border-top pt-2">' + ind.join(" &bull; ") + "</div>";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PAGINE
  // ═══════════════════════════════════════════════════════════════════════════

  // Dashboard ──────────────────────────────────────────────────────────────
  async function dashboard() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var elis = L.getElicotteri(false).map(function (e) {
      var u = L.getUltimaPos(e.sigla) || {};
      e._oc = oreCompl(e); e._pos = u.pos; e._nota = u.note; e._data = u.data;
      return e;
    });
    var tot = elis.length;
    var eff = elis.filter(function (e) { return e._pos === "E"; }).length;
    var rows = elis.map(function (e) {
      return "<tr>" +
        "<td>" + esc(e.tipo_eli) + "</td><td>" + esc(e.sigla) + "</td><td>" + esc(e.M_M || "") + "</td>" +
        '<td class="ore-fmt">' + fmt(e._oc) + "</td>" +
        '<td class="ore-fmt">' + durCell(e) + "</td>" +
        "<td>" + posSpan(e._pos) + "</td><td>" + esc(d10(e._data)) + "</td>" +
        '<td class="no-print"><a class="btn btn-sm btn-outline-primary" href="#/elicotteri/' + encodeURIComponent(e.sigla) + '">Apri</a></td>' +
        "</tr>";
    }).join("");

    render(
      '<div class="row g-3 mb-3">' +
        card3("Efficienti", eff, "success") +
        card3("Non efficienti", tot - eff, "danger") +
        card3("Totale velivoli", tot, "primary") +
      "</div>" +
      '<div class="d-flex gap-2 mb-3 no-print">' +
        '<a class="btn btn-primary" href="#/elicotteri">Inserisci ore giornaliere</a>' +
        '<a class="btn btn-outline-secondary" href="#/report/mensile">Report mensile</a>' +
        '<a class="btn btn-outline-success ms-auto" href="#/gestione_eli">+ Nuovo velivolo</a>' +
      "</div>" +
      '<div class="card"><div class="card-header">Situazione velivoli</div>' +
      '<div class="table-responsive"><table class="table table-sm table-hover mb-0 align-middle">' +
      "<thead><tr><th>Tipo</th><th>Sigla</th><th>M/M</th><th>Ore complessive</th><th>Ore DUR</th>" +
      "<th>Ultima pos</th><th>Data</th><th class='no-print'></th></tr></thead><tbody>" +
      (rows || '<tr><td colspan="8" class="text-muted">Nessun velivolo.</td></tr>') +
      "</tbody></table></div></div>"
    );
  }
  function card3(label, n, color) {
    return '<div class="col-md-4"><div class="card text-bg-' + color + '"><div class="card-body text-center">' +
      '<div class="display-6 fw-bold">' + n + "</div><div>" + esc(label) + "</div></div></div></div>";
  }

  // Elicotteri (situazione giornaliera, elenco) ──────────────────────────────
  async function elicotteriList() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var rows = L.getElicotteri(true).map(function (e) {
      var u = L.getUltimaPos(e.sigla) || {};
      var canc = String(e.cancellato) === "True";
      return '<tr class="' + (canc ? "table-secondary" : "") + '">' +
        "<td>" + esc(e.tipo_eli) + "</td><td>" + esc(e.sigla) + "</td><td>" + esc(e.M_M || "") + "</td>" +
        "<td>" + posSpan(u.pos) + "</td><td class='text-center'>" + (canc ? "✓" : "") + "</td>" +
        '<td class="no-print"><a class="btn btn-sm btn-outline-primary" href="#/elicotteri/' + encodeURIComponent(e.sigla) + '">Sit. giornaliera</a></td>' +
        "</tr>";
    }).join("");
    render('<div class="card"><div class="card-header">Velivoli — situazione giornaliera</div>' +
      '<div class="table-responsive"><table class="table table-sm table-hover mb-0 align-middle">' +
      "<thead><tr><th>Tipo</th><th>Sigla</th><th>M/M</th><th>Stato</th><th>Cancellato</th><th class='no-print'></th></tr></thead><tbody>" +
      rows + "</tbody></table></div></div>");
  }

  // Dettaglio elicottero + inserimento volo ──────────────────────────────────
  async function elicottero(sigla) {
    if (!(await ensureLoaded())) return renderNeedPat();
    var e = L.getElicottero(sigla);
    if (!e) return render('<div class="alert alert-danger">Velivolo ' + esc(sigla) + " non trovato.</div>");
    var righe = L.getSitGiorn(sigla, 70);
    var dur = String(e.ore_dur_appl) === "True";

    var rows = righe.map(function (r) {
      return "<tr><td>" + esc(r.progressivo) + "</td><td>" + esc(d10(r.data)) + "</td>" +
        '<td class="ore-fmt">' + fmt(r.ore_giorno) + "</td><td>" + esc(r.cicli || "") + "</td>" +
        "<td>" + posSpan(r.pos) + "</td><td>" + esc(r.note || "") + "</td><td>" + esc(r.cod || "") + "</td>" +
        '<td class="text-center">' + (String(r.Registrato) === "True" ? "✓" : "") + "</td>" +
        '<td class="no-print text-nowrap">' +
        '<a class="btn btn-sm btn-outline-secondary" href="#/elicotteri/' + encodeURIComponent(sigla) + "/edit/" + encodeURIComponent(r.progressivo) + '">Mod</a> ' +
        '<button type="button" class="btn btn-sm btn-outline-danger" data-act="delvolo" data-prog="' + esc(r.progressivo) + '">Canc</button>' +
        "</td></tr>";
    }).join("");

    render(
      '<div class="d-flex align-items-center mb-3 flex-wrap gap-2">' +
        "<h4 class='mb-0'>" + esc(e.tipo_eli) + " — " + esc(e.sigla) + ' <small class="text-muted">' + esc(e.M_M || "") + "</small></h4>" +
        '<span class="badge text-bg-dark ms-2">Tot: ' + fmt(oreCompl(e)) + "</span>" +
        (dur ? '<span class="badge text-bg-info">DUR ' + fmt(e.Ore_DUR || 0) + "</span>" : "") +
        '<a class="btn btn-sm btn-outline-secondary ms-auto no-print" href="#/info_mensile/' + encodeURIComponent(sigla) + '">Info mensile</a>' +
        '<a class="btn btn-sm btn-outline-secondary no-print" href="#/parti/' + encodeURIComponent(sigla) + '">Parti</a>' +
      "</div>" +
      '<div class="card mb-3 no-print"><div class="card-header">Inserisci ore giornaliere</div><div class="card-body">' +
      '<form data-form="addvolo" data-sigla="' + esc(sigla) + '"><div class="row g-2 align-items-end">' +
        col2("Data", '<input type="date" name="data" class="form-control form-control-sm" value="' + todayISO() + '">') +
        col2("Ore", '<input type="text" name="ore_giorno" class="form-control form-control-sm" value="0">') +
        col2("Cicli", '<input type="number" name="cicli" class="form-control form-control-sm" value="0">') +
        col2("Pos", posSelect("E")) +
        col2("Note", '<input type="text" name="note" class="form-control form-control-sm">') +
        col2("Cod", '<input type="text" name="cod" class="form-control form-control-sm">') +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Inserisci volo</button></div>' +
      "</div></form></div></div>" +
      '<div class="card"><div class="card-header">Ultime 70 righe</div>' +
      '<div class="table-responsive"><table class="table table-sm table-hover mb-0 align-middle">' +
      "<thead><tr><th>#</th><th>Data</th><th>Ore</th><th>Cicli</th><th>Pos</th><th>Note</th><th>Cod</th><th>Reg.</th><th class='no-print'></th></tr></thead><tbody>" +
      (rows || '<tr><td colspan="9" class="text-muted">Nessuna riga.</td></tr>') +
      "</tbody></table></div></div>"
    );
  }
  function col2(label, inner) {
    return '<div class="col-6 col-md-2"><label class="form-label mb-0 small">' + esc(label) + "</label>" + inner + "</div>";
  }

  // Modifica riga giornaliera ────────────────────────────────────────────────
  async function editRiga(sigla, prog) {
    if (!(await ensureLoaded())) return renderNeedPat();
    var r = L.getSitGiornByProg(prog);
    if (!r) return render('<div class="alert alert-danger">Riga ' + esc(prog) + " non trovata.</div>");
    render(
      "<h4>Modifica riga #" + esc(prog) + " — " + esc(sigla) + "</h4>" +
      '<form data-form="editvolo" data-prog="' + esc(prog) + '" data-sigla="' + esc(sigla) + '" class="card"><div class="card-body row g-2 align-items-end">' +
        col2("Data", '<input type="date" name="data" class="form-control form-control-sm" value="' + esc(d10(r.data)) + '">') +
        col2("Ore", '<input type="text" name="ore_giorno" class="form-control form-control-sm" value="' + esc(r.ore_giorno) + '">') +
        col2("Cicli", '<input type="number" name="cicli" class="form-control form-control-sm" value="' + esc(r.cicli || 0) + '">') +
        col2("Pos", posSelect(r.pos)) +
        col2("Note", '<input type="text" name="note" class="form-control form-control-sm" value="' + esc(r.note || "") + '">') +
        col2("Cod", '<input type="text" name="cod" class="form-control form-control-sm" value="' + esc(r.cod || "") + '">') +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Salva</button> ' +
        '<a class="btn btn-outline-secondary btn-sm" href="#/elicotteri/' + encodeURIComponent(sigla) + '">Annulla</a></div>' +
      "</div></form>"
    );
  }

  // Gestione elicotteri (inserisci/cancella) ─────────────────────────────────
  async function gestioneEli() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var rows = L.getElicotteri(true).map(function (e) {
      var canc = String(e.cancellato) === "True";
      return "<tr><td>" + esc(e.tipo_eli) + "</td><td>" + esc(e.sigla) + "</td><td>" + esc(e.M_M || "") + "</td>" +
        '<td class="ore-fmt">' + fmt(e.Ore_iniziali || 0) + '</td><td class="ore-fmt">' + fmt(e.Ore_totali || 0) + "</td>" +
        '<td class="text-center">' + (String(e.ore_dur_appl) === "True" ? "✓" : "") + "</td>" +
        "<td>" + esc(d10(e.dal)) + "</td><td>" + esc(e.rpt_prov || "") + "</td><td>" + esc(e.Annotazioni || "") + "</td>" +
        '<td class="text-center">' + (canc ? "✓" : "") + "</td>" +
        '<td class="no-print text-nowrap"><a class="btn btn-sm btn-outline-secondary" href="#/gestione_eli/edit/' + encodeURIComponent(e.sigla) + '">Mod</a> ' +
        (canc ? "" : '<button type="button" class="btn btn-sm btn-outline-danger" data-act="caneli" data-sigla="' + esc(e.sigla) + '">Canc</button>') +
        "</td></tr>";
    }).join("");

    render(
      '<div class="card mb-3 no-print"><div class="card-header">Nuovo velivolo</div><div class="card-body">' +
      '<form data-form="addeli"><div class="row g-2 align-items-end">' +
        col2("Tipo", '<select name="id_tipo" class="form-select form-select-sm">' + tipiOptions("") + "</select>") +
        col2("Sigla", '<input type="number" name="sigla" class="form-control form-control-sm">') +
        col2("M/M", '<input type="text" name="M_M" class="form-control form-control-sm">') +
        col2("Ore iniziali", '<input type="text" name="Ore_iniziali" class="form-control form-control-sm" value="0">') +
        col2("Ore totali", '<input type="text" name="Ore_totali" class="form-control form-control-sm" value="0">') +
        col2("Dal", '<input type="date" name="dal" class="form-control form-control-sm">') +
        col2("Rgt/Prov", '<input type="text" name="rpt_prov" class="form-control form-control-sm">') +
        col2("Ore DUR", '<input type="text" name="Ore_DUR" class="form-control form-control-sm" value="0">') +
        '<div class="col-6 col-md-2"><div class="form-check mt-3"><input class="form-check-input" type="checkbox" name="ore_dur_appl" value="True" id="adddur"><label class="form-check-label small" for="adddur">Applica DUR</label></div></div>' +
        col2("Annotazioni", '<input type="text" name="Annotazioni" class="form-control form-control-sm">') +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Aggiungi velivolo</button></div>' +
      "</div></form></div></div>" +
      '<div class="card"><div class="card-header">Velivoli</div>' +
      '<div class="table-responsive"><table class="table table-sm table-hover mb-0 align-middle">' +
      "<thead><tr><th>Tipo</th><th>Sigla</th><th>M/M</th><th>Ore ini</th><th>Ore tot</th><th>DUR</th><th>Dal</th><th>Rgt/Prov</th><th>Annot.</th><th>Canc</th><th class='no-print'></th></tr></thead><tbody>" +
      rows + "</tbody></table></div></div>"
    );
  }

  async function editEli(sigla) {
    if (!(await ensureLoaded())) return renderNeedPat();
    var e = L.getElicottero(sigla);
    if (!e) return render('<div class="alert alert-danger">Velivolo non trovato.</div>');
    var dur = String(e.ore_dur_appl) === "True", canc = String(e.cancellato) === "True";
    render(
      "<h4>Modifica velivolo " + esc(sigla) + "</h4>" +
      '<form data-form="editeli" data-sigla="' + esc(sigla) + '" class="card"><div class="card-body row g-2 align-items-end">' +
        col2("Tipo", '<select name="id_tipo" class="form-select form-select-sm">' + tipiOptions(e.id_tipo) + "</select>") +
        col2("M/M", '<input type="text" name="M_M" class="form-control form-control-sm" value="' + esc(e.M_M || "") + '">') +
        col2("Ore iniziali", '<input type="text" name="Ore_iniziali" class="form-control form-control-sm" value="' + esc(e.Ore_iniziali || 0) + '">') +
        col2("Ore totali", '<input type="text" name="Ore_totali" class="form-control form-control-sm" value="' + esc(e.Ore_totali || 0) + '">') +
        col2("Ore DUR", '<input type="text" name="Ore_DUR" class="form-control form-control-sm" value="' + esc(e.Ore_DUR || 0) + '">') +
        col2("Dal", '<input type="date" name="dal" class="form-control form-control-sm" value="' + esc(d10(e.dal)) + '">') +
        col2("Rgt/Prov", '<input type="text" name="rpt_prov" class="form-control form-control-sm" value="' + esc(e.rpt_prov || "") + '">') +
        col2("Annotazioni", '<input type="text" name="Annotazioni" class="form-control form-control-sm" value="' + esc(e.Annotazioni || "") + '">') +
        '<div class="col-6 col-md-2"><div class="form-check mt-3"><input class="form-check-input" type="checkbox" name="ore_dur_appl" value="True" id="eddur"' + (dur ? " checked" : "") + '><label class="form-check-label small" for="eddur">Applica DUR</label></div></div>' +
        '<div class="col-6 col-md-2"><div class="form-check mt-3"><input class="form-check-input" type="checkbox" name="cancellato" value="True" id="edcanc"' + (canc ? " checked" : "") + '><label class="form-check-label small" for="edcanc">Cancellato</label></div></div>' +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Salva</button> ' +
        '<a class="btn btn-outline-secondary btn-sm" href="#/gestione_eli">Annulla</a></div>' +
      "</div></form>"
    );
  }

  // Parti ────────────────────────────────────────────────────────────────────
  async function partiIndex() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var items = L.getElicotteri(false).map(function (e) {
      return '<a class="list-group-item list-group-item-action d-flex justify-content-between" href="#/parti/' + encodeURIComponent(e.sigla) + '">' +
        "<span>" + esc(e.tipo_eli) + " – " + esc(e.sigla) + "</span><span class='text-muted'>" + esc(e.M_M || "") + "</span></a>";
    }).join("");
    render('<div class="card"><div class="card-header">Parti — scegli velivolo</div><div class="list-group list-group-flush">' + items + "</div></div>");
  }

  async function parti(sigla) {
    if (!(await ensureLoaded())) return renderNeedPat();
    var e = L.getElicottero(sigla);
    if (!e) return render('<div class="alert alert-danger">Velivolo non trovato.</div>');
    var rows = L.getParti(sigla).map(function (p) {
      return "<tr><td>" + esc(p.contatore) + "</td><td>" + esc(p.tipo_vlv) + "/" + esc(p.id) + "</td>" +
        "<td>" + esc(p.Parte || "") + "</td><td>" + esc(p.part_num || "") + "</td><td>" + esc(p.ser_num || "") + "</td>" +
        '<td class="ore-fmt">' + fmt(p.scad_lof) + '</td><td class="ore-fmt">' + fmt(p.scad_lic) + "</td>" +
        '<td class="ore-fmt">' + fmt(p.ore_vlv_imb) + '</td><td class="ore-fmt">' + fmt(p.ore_particolare) + "</td>" +
        '<td class="ore-fmt fw-bold">' + (p.reale ? fmt(p.ore_attuali) : "–") + "</td>" +
        "<td>" + esc(p.cicli_tot || 0) + "</td><td>" + esc(d10(p.data_imbarco)) + "</td>" +
        '<td class="no-print text-nowrap"><a class="btn btn-sm btn-outline-secondary" href="#/parti/' + encodeURIComponent(sigla) + "/edit/" + encodeURIComponent(p.contatore) + '">Mod</a> ' +
        '<button type="button" class="btn btn-sm btn-outline-danger" data-act="delparte" data-contatore="' + esc(p.contatore) + '" data-sigla="' + esc(sigla) + '">Canc</button></td></tr>';
    }).join("");

    render(
      "<h4>Parti — " + esc(e.tipo_eli) + " " + esc(e.sigla) + "</h4>" +
      '<div class="card mb-3 no-print"><div class="card-header">Aggiungi parte</div><div class="card-body">' +
      '<form data-form="addparte" data-sigla="' + esc(sigla) + '"><div class="row g-2 align-items-end">' +
        col2("Tipo vlv", '<select name="tipo_vlv" class="form-select form-select-sm">' + tipiOptions(e.id_tipo) + "</select>") +
        col2("ID", '<input type="number" name="id" class="form-control form-control-sm">') +
        col2("Part.N.", '<input type="text" name="part_num" class="form-control form-control-sm">') +
        col2("Ser.N.", '<input type="text" name="ser_num" class="form-control form-control-sm">') +
        col2("Ore vlv imb.", '<input type="text" name="ore_vlv_imb" class="form-control form-control-sm" value="0">') +
        col2("Data imb.", '<input type="date" name="data_imbarco" class="form-control form-control-sm">') +
        col2("Scad. LOF", '<input type="text" name="scad_lof" class="form-control form-control-sm">') +
        col2("Scad. LIC", '<input type="text" name="scad_lic" class="form-control form-control-sm">') +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Aggiungi parte</button></div>' +
      "</div></form></div></div>" +
      '<div class="card"><div class="card-header">Componenti</div>' +
      '<div class="table-responsive"><table class="table table-sm table-hover mb-0 align-middle">' +
      "<thead><tr><th>#</th><th>ID</th><th>Parte</th><th>Part.N.</th><th>Ser.N.</th><th>Scad.LOF</th><th>Scad.LIC</th>" +
      "<th>Ore vlv.imb.</th><th>Ore parte imb.</th><th>Ore attuali</th><th>Cicli</th><th>Data imb</th><th class='no-print'></th></tr></thead><tbody>" +
      (rows || '<tr><td colspan="13" class="text-muted">Nessuna parte.</td></tr>') +
      "</tbody></table></div></div>"
    );
  }

  async function editParte(sigla, contatore) {
    if (!(await ensureLoaded())) return renderNeedPat();
    var p = L.getParte(contatore);
    if (!p) return render('<div class="alert alert-danger">Parte non trovata.</div>');
    var dur = String(p.ore_dur_appl) === "True";
    render(
      "<h4>Modifica parte #" + esc(contatore) + " — " + esc(sigla) + " <small class='text-muted'>" + esc(p.Parte || "") + "</small></h4>" +
      '<form data-form="editparte" data-contatore="' + esc(contatore) + '" data-sigla="' + esc(sigla) + '" class="card"><div class="card-body row g-2 align-items-end">' +
        col2("Part.N.", '<input type="text" name="part_num" class="form-control form-control-sm" value="' + esc(p.part_num || "") + '">') +
        col2("Ser.N.", '<input type="text" name="ser_num" class="form-control form-control-sm" value="' + esc(p.ser_num || "") + '">') +
        col2("Scad. LOF", '<input type="text" name="scad_lof" class="form-control form-control-sm" value="' + esc(p.scad_lof || "") + '">') +
        col2("Scad. LIC", '<input type="text" name="scad_lic" class="form-control form-control-sm" value="' + esc(p.scad_lic || "") + '">') +
        col2("Data imb.", '<input type="date" name="data_imbarco" class="form-control form-control-sm" value="' + esc(d10(p.data_imbarco)) + '">') +
        col2("Ore vlv imb.", '<input type="text" name="ore_vlv_imb" class="form-control form-control-sm" value="' + esc(p.ore_vlv_imb || 0) + '">') +
        col2("Ore parte imb.", '<input type="text" name="ore_particolare" class="form-control form-control-sm" value="' + esc(p.ore_particolare || 0) + '">') +
        col2("Cicli tot", '<input type="number" name="cicli_tot" class="form-control form-control-sm" value="' + esc(p.cicli_tot || 0) + '">') +
        col2("Ultimo LIC", '<input type="text" name="ultimo_lic" class="form-control form-control-sm" value="' + esc(p.ultimo_lic || "") + '">') +
        col2("Ultimo LOF", '<input type="text" name="ultimo_lof" class="form-control form-control-sm" value="' + esc(p.ultimo_lof || "") + '">') +
        col2("Ore DUR", '<input type="text" name="ore_dur" class="form-control form-control-sm" value="' + esc(p.ore_dur || 0) + '">') +
        '<div class="col-6 col-md-2"><div class="form-check mt-3"><input class="form-check-input" type="checkbox" name="ore_dur_appl" value="True" id="pdur"' + (dur ? " checked" : "") + '><label class="form-check-label small" for="pdur">Applica DUR</label></div></div>' +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Salva</button> ' +
        '<a class="btn btn-outline-secondary btn-sm" href="#/parti/' + encodeURIComponent(sigla) + '">Annulla</a></div>' +
      "</div></form>"
    );
  }

  // Codici ───────────────────────────────────────────────────────────────────
  async function codiciIndex() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var items = L.getTipi().map(function (t) {
      return '<a class="list-group-item list-group-item-action" href="#/codici/' + encodeURIComponent(t.id_tipo) + '">' + esc(t.tipo_eli) + "</a>";
    }).join("");
    render('<div class="card"><div class="card-header">Codici — scegli tipo</div><div class="list-group list-group-flush">' + items + "</div></div>");
  }

  async function codici(idTipo) {
    if (!(await ensureLoaded())) return renderNeedPat();
    var t = L.getTipo(idTipo);
    var rows = L.getCodici(idTipo).map(function (c) {
      return "<tr><td>" + esc(c.id) + "</td>" +
        '<td><input id="cod_' + esc(idTipo) + "_" + esc(c.id) + '" class="form-control form-control-sm" value="' + esc(c.Parte || "") + '"></td>' +
        '<td class="no-print text-nowrap"><button type="button" class="btn btn-sm btn-outline-primary" data-act="updcod" data-idtipo="' + esc(idTipo) + '" data-id="' + esc(c.id) + '">Salva</button> ' +
        '<button type="button" class="btn btn-sm btn-outline-danger" data-act="delcod" data-idtipo="' + esc(idTipo) + '" data-id="' + esc(c.id) + '">Canc</button></td></tr>';
    }).join("");
    render(
      "<h4>Codici — " + esc(t ? t.tipo_eli : idTipo) + "</h4>" +
      '<form data-form="addcod" data-idtipo="' + esc(idTipo) + '" class="card mb-3 no-print"><div class="card-body row g-2 align-items-end">' +
        col2("ID", '<input type="number" name="id" class="form-control form-control-sm">') +
        '<div class="col-12 col-md-6"><label class="form-label mb-0 small">Denominazione</label><input type="text" name="parte" class="form-control form-control-sm"></div>' +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Aggiungi codice</button></div>' +
      "</div></form>" +
      '<div class="card"><div class="table-responsive"><table class="table table-sm align-middle mb-0">' +
      "<thead><tr><th style='width:6rem'>ID</th><th>Denominazione</th><th class='no-print'></th></tr></thead><tbody>" +
      (rows || '<tr><td colspan="3" class="text-muted">Nessun codice.</td></tr>') + "</tbody></table></div></div>"
    );
  }

  // Info mensile ─────────────────────────────────────────────────────────────
  async function infoMensile(sigla) {
    if (!(await ensureLoaded())) return renderNeedPat();
    var i = L.getInfoMensile(sigla) || {};
    function chk(name, val, label) {
      return '<div class="col-6 col-md-2"><div class="form-check mt-3"><input class="form-check-input" type="checkbox" name="' + name + '" value="True" id="im' + name + '"' +
        (String(val) === "True" ? " checked" : "") + '><label class="form-check-label small" for="im' + name + '">' + label + "</label></div></div>";
    }
    render(
      "<h4>Info mensile — " + esc(sigla) + "</h4>" +
      '<form data-form="infomensile" data-sigla="' + esc(sigla) + '" class="card"><div class="card-body row g-2 align-items-end">' +
        col2("BASE", '<input type="text" name="BASE" class="form-control form-control-sm" value="' + esc(i.BASE || "") + '">') +
        col2("Cess. da", '<input type="date" name="cess_temp_da" class="form-control form-control-sm" value="' + esc(d10(i.cess_temp_da)) + '">') +
        col2("Cess. a", '<input type="date" name="cess_temp_a" class="form-control form-control-sm" value="' + esc(d10(i.cess_temp_a)) + '">') +
        chk("M1", i.M1, "M1") + chk("S1", i.S1, "S1") + chk("R1", i.R1, "R1") +
        col2("Scad1", '<input type="text" name="scad1" class="form-control form-control-sm" value="' + esc(i.scad1 || 0) + '">') +
        col2("Cod scad1", '<input type="text" name="cod_scad1" class="form-control form-control-sm" value="' + esc(i.cod_scad1 || "") + '">') +
        col2("Scad2", '<input type="text" name="scad2" class="form-control form-control-sm" value="' + esc(i.scad2 || 0) + '">') +
        col2("Cod scad2", '<input type="text" name="cod_scad2" class="form-control form-control-sm" value="' + esc(i.cod_scad2 || "") + '">') +
        col2("Scad3", '<input type="date" name="scad3" class="form-control form-control-sm" value="' + esc(d10(i.scad3)) + '">') +
        col2("Cod scad3", '<input type="text" name="cod_scad3" class="form-control form-control-sm" value="' + esc(i.cod_scad3 || "") + '">') +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Salva</button> ' +
        '<a class="btn btn-outline-secondary btn-sm" href="#/elicotteri/' + encodeURIComponent(sigla) + '">Indietro</a></div>' +
      "</div></form>"
    );
  }

  // Utilità: ente / indirizzi ────────────────────────────────────────────────
  async function utilitaEnte() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var rows = L.getEnte().map(function (e) {
      return '<div class="mb-2"><label class="form-label mb-0 small">Riga ' + esc(e.id) + "</label>" +
        '<input type="text" name="ente_' + esc(e.id) + '" class="form-control form-control-sm" value="' + esc(e.Voce || "") + '"></div>';
    }).join("");
    render('<h4>Intestazione stampe</h4><form data-form="ente" class="card"><div class="card-body">' + rows +
      '<button class="btn btn-primary btn-sm">Salva</button></div></form>');
  }

  async function utilitaIndirizzi() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var rows = L.getIndirizzi().map(function (i) {
      return '<div class="mb-2"><label class="form-label mb-0 small">Indirizzo ' + esc(i.contatore) + "</label>" +
        '<input type="text" name="ind_' + esc(i.contatore) + '" class="form-control form-control-sm" value="' + esc(i.indirizzi || "") + '"></div>';
    }).join("");
    render('<h4>Indirizzi stampe</h4><form data-form="indirizzi" class="card"><div class="card-body">' + rows +
      '<button class="btn btn-primary btn-sm">Salva</button></div></form>');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STAMPE / REPORT
  // ═══════════════════════════════════════════════════════════════════════════
  function stampe() {
    var items = [
      ["Situazione", "#/report/situazione", "Stato attuale di tutti i velivoli con motori"],
      ["Situazione Mensile", "#/report/mensile", "Ore e disponibilità per mese"],
      ["Sit. Giornaliera (intervallo)", "#/report/giornaliero", "Righe volo in un intervallo di date"],
      ["Prospetto Manutenzione", "#/report/prosp_manut", "Scadenze parti per velivolo"],
      ["Elenco Matricole", "#/report/matricole", "Anagrafica completa velivoli"],
      ["Codici per tipo", "#/report/codici", "Denominazioni codici per tipo"],
      ["LIC/LOF per codice", "#/report/lic_lof", "Parti per codice con scadenze"]
    ].map(function (r) {
      return '<div class="col-md-4"><a class="card text-decoration-none h-100" href="' + r[1] + '"><div class="card-body">' +
        '<h6 class="text-dark">' + esc(r[0]) + "</h6><p class='small text-muted mb-0'>" + esc(r[2]) + "</p></div></a></div>";
    }).join("");
    render('<h4>Menu stampe</h4><div class="row g-3">' + items + "</div>");
  }

  // Report: Situazione ───────────────────────────────────────────────────────
  async function reportSituazione() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var rows = L.getElicotteri(false).map(function (e) {
      var u = L.getUltimaPos(e.sigla) || {};
      var parti = L.getParti(e.sigla);
      function mot(id) { var m = parti.filter(function (p) { return String(p.id) === id && p.reale; })[0]; return m ? fmt(m.ore_attuali) : "–"; }
      return "<tr><td>" + esc(e.tipo_eli) + "</td><td>" + esc(e.sigla) + "</td><td>" + esc(e.M_M || "") + "</td>" +
        '<td class="ore-fmt">' + fmt(oreCompl(e)) + '</td><td class="ore-fmt">' + durCell(e) + "</td>" +
        "<td>" + posSpan(u.pos) + "</td><td>" + esc(u.note || "") + "</td><td>" + esc(d10(u.data)) + "</td>" +
        '<td class="ore-fmt">' + mot("1") + '</td><td class="ore-fmt">' + mot("2") + "</td></tr>";
    }).join("");
    render(
      '<div class="d-flex justify-content-end no-print mb-2"><button class="btn btn-sm btn-outline-secondary" onclick="window.print()">Stampa</button></div>' +
      enteHeader() +
      '<div class="text-end small mb-2">Data: ' + esc(todayISO()) + "</div>" +
      '<div class="table-responsive"><table class="table table-sm table-bordered align-middle">' +
      "<thead><tr><th>Tipo</th><th>Sigla</th><th>M/M</th><th>Ore compl.</th><th>Ore DUR</th><th>Pos</th><th>Note</th><th>Data</th><th>Motore 1</th><th>Motore 2</th></tr></thead><tbody>" +
      rows + "</tbody></table></div>" + indirizziFooter()
    );
  }

  // Report: Matricole ────────────────────────────────────────────────────────
  async function reportMatricole() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var rows = L.getElicotteri(true).map(function (e, idx) {
      var canc = String(e.cancellato) === "True";
      return "<tr><td>" + (idx + 1) + "</td><td>" + esc(e.tipo_eli) + "</td><td>" + esc(e.sigla) + "</td><td>" + esc(e.M_M || "") + "</td>" +
        '<td class="ore-fmt">' + fmt(e.Ore_iniziali || 0) + '</td><td class="ore-fmt">' + fmt(e.Ore_totali || 0) + '</td><td class="ore-fmt">' + durCell(e) + "</td>" +
        "<td>" + esc(d10(e.dal)) + "</td><td>" + esc(e.rpt_prov || "") + "</td><td>" + esc(e.Annotazioni || "") + "</td>" +
        "<td>" + (canc ? '<span class="pos-I">CANCELLATO</span>' : "Attivo") + "</td></tr>";
    }).join("");
    render(
      '<div class="d-flex justify-content-end no-print mb-2"><button class="btn btn-sm btn-outline-secondary" onclick="window.print()">Stampa</button></div>' +
      enteHeader() +
      '<div class="table-responsive"><table class="table table-sm table-bordered align-middle">' +
      "<thead><tr><th>#</th><th>Tipo</th><th>Sigla</th><th>M/M</th><th>Ore ini</th><th>Ore tot</th><th>Ore DUR</th><th>Dal</th><th>Rgt/Prov</th><th>Annotazioni</th><th>Stato</th></tr></thead><tbody>" +
      rows + "</tbody></table></div>"
    );
  }

  // Report: Giornaliero (intervallo) ─────────────────────────────────────────
  async function reportGiornaliero() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var sigleOpt = '<option value="">Tutte</option>' +
      L.getElicotteri(true).map(function (e) { return opt(e.sigla, e.tipo_eli + " " + e.sigla, ""); }).join("");
    render(
      '<form data-form="rep_giorn" class="card mb-3 no-print"><div class="card-body row g-2 align-items-end">' +
        col2("Dal", '<input type="date" name="da" class="form-control form-control-sm" value="' + firstOfMonthISO() + '">') +
        col2("Al", '<input type="date" name="a" class="form-control form-control-sm" value="' + todayISO() + '">') +
        '<div class="col-12 col-md-3"><label class="form-label mb-0 small">Velivolo</label><select name="sigla" class="form-select form-select-sm">' + sigleOpt + "</select></div>" +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Mostra</button></div>' +
      "</div></form><div id=\"repout\"></div>"
    );
  }

  // Report: Prospetto manutenzione ───────────────────────────────────────────
  async function reportProspManut() {
    if (!(await ensureLoaded())) return renderNeedPat();
    render(sigleForm("rep_prosp", "Prospetto manutenzione"));
  }

  // Report: Mensile ──────────────────────────────────────────────────────────
  async function reportMensile() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var now = new Date();
    var meseOpt = MESI.map(function (m, i) { return i === 0 ? "" : opt(i, m, now.getMonth() + 1); }).join("");
    var sigleChk = L.getElicotteri(false).map(function (e) {
      return '<label class="me-3 d-inline-block"><input type="checkbox" name="sigle" value="' + esc(e.sigla) + '"> ' + esc(e.tipo_eli) + " " + esc(e.sigla) + "</label>";
    }).join("");
    render(
      '<form data-form="rep_mensile" class="card mb-3 no-print"><div class="card-body">' +
        '<div class="row g-2 align-items-end mb-2">' +
        col2("Mese", '<select name="mese" class="form-select form-select-sm">' + meseOpt + "</select>") +
        col2("Anno", '<input type="number" name="anno" class="form-control form-control-sm" value="' + now.getFullYear() + '">') +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Calcola</button></div></div>' +
        '<div class="border-top pt-2">' + sigleChk + "</div>" +
      "</div></form><div id=\"repout\"></div>"
    );
  }

  // Report: Codici per tipo ──────────────────────────────────────────────────
  async function reportCodici() {
    if (!(await ensureLoaded())) return renderNeedPat();
    var chk = L.getTipi().map(function (t) {
      return '<label class="me-3 d-inline-block"><input type="checkbox" name="tipi" value="' + esc(t.id_tipo) + '"> ' + esc(t.tipo_eli) + "</label>";
    }).join("");
    render('<form data-form="rep_codici" class="card mb-3 no-print"><div class="card-body">' + chk +
      '<div class="mt-2"><button class="btn btn-primary btn-sm">Mostra</button></div></div></form><div id="repout"></div>');
  }

  // Report: LIC/LOF per codice ───────────────────────────────────────────────
  async function reportLicLof() {
    if (!(await ensureLoaded())) return renderNeedPat();
    render(
      '<form data-form="rep_liclof" class="card mb-3 no-print"><div class="card-body row g-2 align-items-end">' +
        col2("Tipo vlv", '<select name="tipo_vlv" class="form-select form-select-sm">' + tipiOptions("") + "</select>") +
        col2("ID codice", '<input type="number" name="id_cod" class="form-control form-control-sm">') +
        '<div class="col-12"><button class="btn btn-primary btn-sm">Cerca</button></div>' +
      "</div></form><div id=\"repout\"></div>"
    );
  }

  function sigleForm(formName, title) {
    var chk = L.getElicotteri(false).map(function (e) {
      return '<label class="me-3 d-inline-block"><input type="checkbox" name="sigle" value="' + esc(e.sigla) + '"> ' + esc(e.tipo_eli) + " " + esc(e.sigla) + "</label>";
    }).join("");
    return "<h4>" + esc(title) + "</h4>" +
      '<form data-form="' + formName + '" class="card mb-3 no-print"><div class="card-body">' + chk +
      '<div class="mt-2"><button class="btn btn-primary btn-sm">Genera</button></div></div></form><div id="repout"></div>';
  }

  // ─── handler form report (no commit) ───────────────────────────────────────
  function repGiorn(f) {
    var da = f.elements.da.value, a = f.elements.a.value, sigla = f.elements.sigla.value;
    if (!da || !a) { flash("Indica le date", "warning"); return; }
    var aFull = a + " 23:59:59";
    var rows = sigla ? L.getSitGiornRange(sigla, da, aFull) : L.getSitGiornAllRange(da, aFull);
    var body = rows.map(function (r) {
      return "<tr><td>" + esc(r.sigla) + "</td><td>" + esc(d10(r.data)) + "</td>" +
        '<td class="ore-fmt">' + fmt(r.ore_giorno) + "</td><td>" + esc(r.cicli || "") + "</td>" +
        "<td>" + posSpan(r.pos) + "</td><td>" + esc(r.note || "") + "</td><td>" + esc(r.cod || "") + "</td></tr>";
    }).join("");
    el("repout").innerHTML =
      '<div class="table-responsive"><table class="table table-sm table-bordered align-middle">' +
      "<thead><tr><th>Sigla</th><th>Data</th><th>Ore</th><th>Cicli</th><th>Pos</th><th>Note</th><th>Cod</th></tr></thead><tbody>" +
      (body || '<tr><td colspan="7" class="text-muted">Nessuna riga.</td></tr>') +
      "</tbody></table></div><div class='small text-muted'>" + rows.length + " righe trovate</div>";
  }

  function repProsp(f) {
    var sigle = checkedVals(f, "sigle");
    if (!sigle.length) { flash("Seleziona almeno un velivolo", "warning"); return; }
    var out = sigle.map(function (s) {
      var e = L.getElicottero(s); if (!e) return "";
      var u = L.getUltimaPos(s) || {};
      var body = L.getPartiReali(s).map(function (p) {
        return "<tr><td>" + esc(p.tipo_vlv) + "/" + esc(p.id) + "</td><td>" + esc(p.Parte || "") + "</td>" +
          "<td>" + esc(p.part_num || "") + "</td><td>" + esc(p.ser_num || "") + "</td><td>" + esc(d10(p.data_imbarco)) + "</td>" +
          '<td class="ore-fmt">' + fmt(p.scad_lof) + '</td><td class="ore-fmt">' + fmt(p.ultimo_lof) + '</td><td class="ore-fmt">' + fmt(p.ultimo_lic) + "</td>" +
          '<td class="ore-fmt">' + fmt(p.ore_attuali) + "</td><td>" + esc(p.cicli_tot || 0) + "</td></tr>";
      }).join("");
      return '<div class="card mb-3"><div class="card-header">' + esc(e.tipo_eli) + " " + esc(e.sigla) +
        " — " + esc(e.M_M || "") + " — " + fmt(oreCompl(e)) + " — " + (u.pos ? esc(u.pos) : "") + "</div>" +
        '<div class="table-responsive"><table class="table table-sm table-bordered mb-0 align-middle">' +
        "<thead><tr><th>ID</th><th>Denominazione</th><th>P/N</th><th>S/N</th><th>Imb.</th><th>Scad.LOF</th><th>Ore.LOF</th><th>Ore.LIC</th><th>Ore parte</th><th>Cicli</th></tr></thead><tbody>" +
        (body || '<tr><td colspan="10" class="text-muted">Nessuna parte reale.</td></tr>') + "</tbody></table></div></div>";
    }).join("");
    el("repout").innerHTML =
      '<div class="d-flex justify-content-end no-print mb-2"><button class="btn btn-sm btn-outline-secondary" onclick="window.print()">Stampa</button></div>' + out;
  }

  function repMensile(f) {
    var mese = f.elements.mese.value, anno = f.elements.anno.value;
    var sigle = checkedVals(f, "sigle");
    if (!mese || !anno) { flash("Indica mese e anno", "warning"); return; }
    if (!sigle.length) { flash("Seleziona almeno un velivolo", "warning"); return; }
    var rows = L.calcolaSitMensile(mese, anno, sigle);
    function dot(v) { return String(v) === "True" ? "●" : ""; }
    var body = rows.map(function (r) {
      return "<tr><td>" + esc(r.Tipo) + "</td><td>" + esc(r.sigla) + "</td><td>" + esc(r.M_M || "") + "</td>" +
        '<td class="ore-fmt">' + fmt(r.Ore_mese) + '</td><td class="ore-fmt">' + fmt(r.Ore_totali) + '</td><td class="ore-fmt">' + fmt(r.Ore_DUR) + "</td>" +
        "<td>" + posSpan(r.eff_finale) + "</td><td>" + esc(r.gg_disposizione) + "</td><td>" + esc(r.gg_presenza) + "</td>" +
        '<td class="text-center">' + dot(r.M1) + '</td><td class="text-center">' + dot(r.S1) + '</td><td class="text-center">' + dot(r.R1) + "</td>" +
        "<td>" + esc(r.BASE || "") + '</td><td class="ore-fmt">' + fmt(r.scad1) + '</td><td class="ore-fmt">' + fmt(r.scad2) + "</td><td>" + esc(d10(r.scad3)) + "</td></tr>";
    }).join("");
    el("repout").innerHTML =
      '<div class="d-flex justify-content-end no-print mb-2"><button class="btn btn-sm btn-outline-secondary" onclick="window.print()">Stampa</button></div>' +
      '<h6 class="text-center">Situazione mensile — ' + esc(MESI[parseInt(mese, 10)] || mese) + " " + esc(anno) + "</h6>" +
      '<div class="table-responsive"><table class="table table-sm table-bordered align-middle">' +
      "<thead><tr><th>Tipo</th><th>Sigla</th><th>M/M</th><th>Ore mese</th><th>Ore totali</th><th>Ore DUR</th><th>Eff.fin.</th><th>Gg.disp.</th><th>Gg.pres.</th>" +
      "<th>M1</th><th>S1</th><th>R1</th><th>BASE</th><th>Scad1</th><th>Scad2</th><th>Scad3</th></tr></thead><tbody>" +
      (body || '<tr><td colspan="16" class="text-muted">Nessun dato.</td></tr>') + "</tbody></table></div>";
  }

  function repCodici(f) {
    var tipi = checkedVals(f, "tipi");
    if (!tipi.length) { flash("Seleziona almeno un tipo", "warning"); return; }
    var out = tipi.map(function (idt) {
      var t = L.getTipo(idt);
      var body = L.getCodici(idt).map(function (c) {
        return "<tr><td>" + esc(c.id) + "</td><td>" + esc(c.Parte || "") + "</td></tr>";
      }).join("");
      return "<h6>" + esc(t ? t.tipo_eli : idt) + "</h6>" +
        '<table class="table table-sm table-bordered mb-3"><thead><tr><th style="width:6rem">ID</th><th>Denominazione</th></tr></thead><tbody>' +
        (body || '<tr><td colspan="2" class="text-muted">Nessun codice.</td></tr>') + "</tbody></table>";
    }).join("");
    el("repout").innerHTML =
      '<div class="d-flex justify-content-end no-print mb-2"><button class="btn btn-sm btn-outline-secondary" onclick="window.print()">Stampa</button></div>' + out;
  }

  function repLicLof(f) {
    var tv = f.elements.tipo_vlv.value, id = f.elements.id_cod.value;
    if (id === "") { flash("Indica l'ID codice", "warning"); return; }
    var rows = L.getLicLof(tv, id);
    var t = L.getTipo(tv);
    var parte = (L.getCodici(tv).filter(function (c) { return String(c.id) === String(id); })[0] || {}).Parte || "";
    var body = rows.map(function (p) {
      return "<tr><td>" + esc(p.sigla) + "</td><td>" + esc(p.M_M || "") + "</td><td>" + esc(p.part_num || "") + "</td><td>" + esc(p.ser_num || "") + "</td>" +
        '<td class="ore-fmt">' + fmt(p.ore_vlv_imb) + '</td><td class="ore-fmt">' + fmt(p.ore_particolare) + '</td><td class="ore-fmt">' + fmt(p.ore_tot_mot) + "</td>" +
        '<td class="ore-fmt">' + fmt(p.scad_lof) + '</td><td class="ore-fmt">' + fmt(p.scad_lic) + "</td>" +
        "<td>" + esc(p.ultimo_lof || "") + "</td><td>" + esc(p.ultimo_lic || "") + "</td></tr>";
    }).join("");
    el("repout").innerHTML =
      '<div class="d-flex justify-content-end no-print mb-2"><button class="btn btn-sm btn-outline-secondary" onclick="window.print()">Stampa</button></div>' +
      "<h6>Parte: " + esc(parte) + " (ID " + esc(id) + ") – Tipo " + esc(t ? t.tipo_eli : tv) + "</h6>" +
      '<div class="table-responsive"><table class="table table-sm table-bordered align-middle">' +
      "<thead><tr><th>Sigla</th><th>M/M</th><th>P/N</th><th>S/N</th><th>Ore vlv imb.</th><th>Ore parte imb.</th><th>Ore tot.mot.</th><th>Scad.LOF</th><th>Scad.LIC</th><th>Ult.LOF</th><th>Ult.LIC</th></tr></thead><tbody>" +
      (body || '<tr><td colspan="11" class="text-muted">Nessun risultato.</td></tr>') + "</tbody></table></div>";
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  HANDLER form mutazione + azioni
  // ═══════════════════════════════════════════════════════════════════════════
  var FORMS = {
    addvolo: async function (f) {
      var data = f.elements.data.value;
      if (!data) { flash("Inserisci la data", "warning"); return; }
      var ch = L.addSitGiorn(f.dataset.sigla, data + " 00:00:00",
        f.elements.ore_giorno.value || "0", f.elements.cicli.value || "0",
        f.elements.pos.value, f.elements.note.value, f.elements.cod.value);
      if (await save(ch, "volo " + f.dataset.sigla + " " + data)) { flash("Volo inserito", "success"); route(); }
    },
    editvolo: async function (f) {
      var data = f.elements.data.value;
      var ch = L.updateSitGiorn(f.dataset.prog, data + " 00:00:00",
        f.elements.ore_giorno.value || "0", f.elements.cicli.value || "0",
        f.elements.pos.value, f.elements.note.value, f.elements.cod.value);
      if (await save(ch, "mod volo " + f.dataset.prog)) { flash("Volo aggiornato", "success"); go("#/elicotteri/" + encodeURIComponent(f.dataset.sigla)); }
    },
    addeli: async function (f) {
      if (!f.elements.sigla.value) { flash("Sigla obbligatoria", "warning"); return; }
      var ch = L.addElicottero({
        id_tipo: f.elements.id_tipo.value, sigla: f.elements.sigla.value, M_M: f.elements.M_M.value,
        Ore_iniziali: f.elements.Ore_iniziali.value || "0", Ore_totali: f.elements.Ore_totali.value || "0",
        ore_dur_appl: f.elements.ore_dur_appl.checked ? "True" : "False", Ore_DUR: f.elements.Ore_DUR.value || "0",
        dal: f.elements.dal.value, rpt_prov: f.elements.rpt_prov.value, Annotazioni: f.elements.Annotazioni.value
      });
      if (await save(ch, "nuovo eli " + f.elements.sigla.value)) { flash("Velivolo aggiunto", "success"); route(); }
    },
    editeli: async function (f) {
      var ch = L.updateElicottero(f.dataset.sigla, {
        id_tipo: f.elements.id_tipo.value, M_M: f.elements.M_M.value,
        Ore_iniziali: f.elements.Ore_iniziali.value || "0", Ore_totali: f.elements.Ore_totali.value || "0",
        ore_dur_appl: f.elements.ore_dur_appl.checked ? "True" : "False", Ore_DUR: f.elements.Ore_DUR.value || "0",
        dal: f.elements.dal.value, rpt_prov: f.elements.rpt_prov.value, Annotazioni: f.elements.Annotazioni.value,
        cancellato: f.elements.cancellato.checked ? "True" : "False"
      });
      if (await save(ch, "mod eli " + f.dataset.sigla)) { flash("Velivolo aggiornato", "success"); go("#/gestione_eli"); }
    },
    addparte: async function (f) {
      if (f.elements.id.value === "") { flash("ID parte obbligatorio", "warning"); return; }
      var ch = L.addParte({
        sigla: f.dataset.sigla, tipo_vlv: f.elements.tipo_vlv.value, id: f.elements.id.value,
        part_num: f.elements.part_num.value, ser_num: f.elements.ser_num.value,
        ore_vlv_imb: f.elements.ore_vlv_imb.value || "0", data_imbarco: f.elements.data_imbarco.value,
        scad_lof: f.elements.scad_lof.value, scad_lic: f.elements.scad_lic.value
      });
      if (await save(ch, "nuova parte " + f.dataset.sigla)) { flash("Parte aggiunta", "success"); route(); }
    },
    editparte: async function (f) {
      var ch = L.updateParte(f.dataset.contatore, {
        part_num: f.elements.part_num.value, ser_num: f.elements.ser_num.value,
        scad_lof: f.elements.scad_lof.value, scad_lic: f.elements.scad_lic.value,
        data_imbarco: f.elements.data_imbarco.value, ore_vlv_imb: f.elements.ore_vlv_imb.value || "0",
        ore_particolare: f.elements.ore_particolare.value || "0", cicli_tot: f.elements.cicli_tot.value || "0",
        ultimo_lic: f.elements.ultimo_lic.value, ultimo_lof: f.elements.ultimo_lof.value,
        ore_dur_appl: f.elements.ore_dur_appl.checked ? "True" : "False", ore_dur: f.elements.ore_dur.value || "0"
      });
      if (await save(ch, "mod parte " + f.dataset.contatore)) { flash("Parte aggiornata", "success"); go("#/parti/" + encodeURIComponent(f.dataset.sigla)); }
    },
    addcod: async function (f) {
      if (f.elements.id.value === "") { flash("ID obbligatorio", "warning"); return; }
      var ch = L.addCodice(f.dataset.idtipo, f.elements.id.value, f.elements.parte.value);
      if (await save(ch, "nuovo codice")) { flash("Codice aggiunto", "success"); route(); }
    },
    infomensile: async function (f) {
      var ch = L.upsertInfoMensile(f.dataset.sigla, {
        BASE: f.elements.BASE.value, cess_temp_da: f.elements.cess_temp_da.value, cess_temp_a: f.elements.cess_temp_a.value,
        M1: f.elements.M1.checked ? "True" : "False", S1: f.elements.S1.checked ? "True" : "False", R1: f.elements.R1.checked ? "True" : "False",
        scad1: f.elements.scad1.value || "0", cod_scad1: f.elements.cod_scad1.value,
        scad2: f.elements.scad2.value || "0", cod_scad2: f.elements.cod_scad2.value,
        scad3: f.elements.scad3.value, cod_scad3: f.elements.cod_scad3.value
      });
      if (await save(ch, "info mensile " + f.dataset.sigla)) flash("Info mensile salvata", "success");
    },
    ente: async function (f) {
      L.getEnte().forEach(function (e) { var v = f.elements["ente_" + e.id]; if (v) L.updateEnte(e.id, v.value); });
      if (await save(["ente_appartenenza"], "mod intestazione")) flash("Intestazione salvata", "success");
    },
    indirizzi: async function (f) {
      L.getIndirizzi().forEach(function (i) { var v = f.elements["ind_" + i.contatore]; if (v) L.updateIndirizzo(i.contatore, v.value); });
      if (await save(["indirizzi_X_report"], "mod indirizzi")) flash("Indirizzi salvati", "success");
    },
    rep_giorn: function (f) { repGiorn(f); },
    rep_prosp: function (f) { repProsp(f); },
    rep_mensile: function (f) { repMensile(f); },
    rep_codici: function (f) { repCodici(f); },
    rep_liclof: function (f) { repLicLof(f); }
  };

  var ACTS = {
    delvolo: async function (b) {
      if (!confirm("Cancellare la riga selezionata?")) return;
      var ch = L.deleteSitGiorn(b.dataset.prog);
      if (await save(ch, "del volo " + b.dataset.prog)) { flash("Volo cancellato", "success"); route(); }
    },
    caneli: async function (b) {
      if (!confirm("Cancellare il velivolo " + b.dataset.sigla + "?")) return;
      var ch = L.cancellaElicottero(b.dataset.sigla);
      if (await save(ch, "cancella eli " + b.dataset.sigla)) { flash("Velivolo cancellato", "success"); route(); }
    },
    delparte: async function (b) {
      if (!confirm("Cancellare la parte #" + b.dataset.contatore + "?")) return;
      var ch = L.deleteParte(b.dataset.contatore);
      if (await save(ch, "del parte " + b.dataset.contatore)) { flash("Parte cancellata", "success"); route(); }
    },
    updcod: async function (b) {
      var inp = el("cod_" + b.dataset.idtipo + "_" + b.dataset.id);
      var ch = L.updateCodice(b.dataset.idtipo, b.dataset.id, inp ? inp.value : "");
      if (await save(ch, "mod codice " + b.dataset.id)) flash("Codice aggiornato", "success");
    },
    delcod: async function (b) {
      if (!confirm("Cancellare il codice " + b.dataset.id + "?")) return;
      var ch = L.deleteCodice(b.dataset.idtipo, b.dataset.id);
      if (await save(ch, "del codice " + b.dataset.id)) { flash("Codice cancellato", "success"); route(); }
    }
  };

  // delega eventi (i listener restano sul contenitore #app)
  app.addEventListener("submit", function (e) {
    var f = e.target.closest("form[data-form]");
    if (!f) return;
    e.preventDefault();
    var h = FORMS[f.getAttribute("data-form")];
    if (h) h(f);
  });
  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    e.preventDefault();
    var h = ACTS[b.getAttribute("data-act")];
    if (h) h(b);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  ROUTER
  // ═══════════════════════════════════════════════════════════════════════════
  var ROUTES = [
    [/^\/$/, dashboard],
    [/^\/elicotteri$/, elicotteriList],
    [/^\/elicotteri\/([^\/]+)\/edit\/([^\/]+)$/, editRiga],
    [/^\/elicotteri\/([^\/]+)$/, elicottero],
    [/^\/gestione_eli$/, gestioneEli],
    [/^\/gestione_eli\/edit\/([^\/]+)$/, editEli],
    [/^\/parti$/, partiIndex],
    [/^\/parti\/([^\/]+)\/edit\/([^\/]+)$/, editParte],
    [/^\/parti\/([^\/]+)$/, parti],
    [/^\/codici$/, codiciIndex],
    [/^\/codici\/([^\/]+)$/, codici],
    [/^\/info_mensile\/([^\/]+)$/, infoMensile],
    [/^\/stampe$/, stampe],
    [/^\/report\/situazione$/, reportSituazione],
    [/^\/report\/mensile$/, reportMensile],
    [/^\/report\/giornaliero$/, reportGiornaliero],
    [/^\/report\/prosp_manut$/, reportProspManut],
    [/^\/report\/matricole$/, reportMatricole],
    [/^\/report\/codici$/, reportCodici],
    [/^\/report\/lic_lof$/, reportLicLof],
    [/^\/utilita\/ente$/, utilitaEnte],
    [/^\/utilita\/indirizzi$/, utilitaIndirizzi]
  ];

  function currentPath() {
    var h = location.hash || "#/";
    if (h[0] === "#") h = h.slice(1);
    return h || "/";
  }

  async function route() {
    flashEl.innerHTML = "";
    var path = currentPath();
    for (var i = 0; i < ROUTES.length; i++) {
      var m = path.match(ROUTES[i][0]);
      if (m) {
        var args = m.slice(1).map(decodeURIComponent);
        try { await ROUTES[i][1].apply(null, args); }
        catch (e) { render('<div class="alert alert-danger">Errore: ' + esc(e.message) + "</div>"); }
        window.scrollTo(0, 0);
        return;
      }
    }
    render('<div class="alert alert-warning">Pagina non trovata.</div>');
  }

  // ─── impostazioni (PAT) ────────────────────────────────────────────────────
  function openSettings() {
    el("set_pat").value = "";
    el("set_owner").value = S.cfg.owner;
    el("set_repo").value = S.cfg.repo;
    el("set_branch").value = S.cfg.branch;
    el("set_err").textContent = "";
    global.bootstrap.Modal.getOrCreateInstance(el("settingsModal")).show();
  }

  function wireSettings() {
    el("set_save").addEventListener("click", async function () {
      var pat = el("set_pat").value.trim();
      if (pat) S.cfg.pat = pat;
      S.cfg.owner = el("set_owner").value.trim();
      S.cfg.repo = el("set_repo").value.trim();
      S.cfg.branch = el("set_branch").value.trim();
      el("set_err").textContent = "";
      S.reset();
      busy(true);
      try {
        await S.loadAll(true);
        global.bootstrap.Modal.getOrCreateInstance(el("settingsModal")).hide();
        flash("Dati caricati.", "success");
        route();
      } catch (e) {
        el("set_err").textContent = e.message;
      } finally { busy(false); }
    });
    el("settingsModal").addEventListener("show.bs.modal", function () {
      el("set_owner").value = S.cfg.owner;
      el("set_repo").value = S.cfg.repo;
      el("set_branch").value = S.cfg.branch;
    });
  }

  // ─── bootstrap app ─────────────────────────────────────────────────────────
  var inited = false;
  function init() {
    if (inited) return;
    inited = true;
    wireSettings();
    if (!location.hash) location.hash = "#/";
    else route();
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("DOMContentLoaded", init);
  // se DOMContentLoaded è già passato (script con defer / iniezione dinamica)
  if (document.readyState !== "loading") init();

  global.App = { route: route, openSettings: openSettings };
})(window);
