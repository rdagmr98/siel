/* Port fedele di db.py: opera sulle tabelle in memoria (Store.tables).
   Le funzioni che modificano i dati restituiscono l'elenco delle tabelle
   cambiate, così app.js sa cosa committare su siel-data. */
(function (global) {
  "use strict";

  var S = global.Store;
  var O = global.Ore;
  var T = function () { return S.tables; };

  // ─── helper ──────────────────────────────────────────────────────────────
  function strEq(a, b) { return String(a == null ? "" : a) === String(b == null ? "" : b); }
  function trimStr(v) { return String(v == null ? "" : v).trim(); }

  function toInt(v) {
    var f = parseFloat(String(v == null ? 0 : (v || 0)).replace(",", "."));
    return isNaN(f) ? 0 : Math.trunc(f);
  }
  function castInt(v) { // come CAST(x AS INTEGER) di SQLite
    var n = parseInt(String(v == null ? "" : v).replace(",", "."), 10);
    return isNaN(n) ? 0 : n;
  }
  function dateOf(s) { return String(s == null ? "" : s).slice(0, 10); }

  function g(data, k, def) { // come dict.get(k, def) di Python sui form
    var v = data[k];
    return (v === undefined || v === null) ? def : v;
  }

  function rawCmp(a, b) { // ORDER BY testuale, NULL primi (come SQLite ASC)
    var an = (a === null || a === undefined), bn = (b === null || b === undefined);
    if (an && bn) return 0;
    if (an) return -1;
    if (bn) return 1;
    return a < b ? -1 : (a > b ? 1 : 0);
  }
  function by() { // comparatore multi-chiave: by([fn,'num'|'raw'], ...)
    var keys = Array.prototype.slice.call(arguments);
    return function (x, y) {
      for (var i = 0; i < keys.length; i++) {
        var f = keys[i][0], mode = keys[i][1];
        var a = f(x), b = f(y), c;
        c = (mode === "num") ? (castInt(a) - castInt(b)) : rawCmp(a, b);
        if (c) return c;
      }
      return 0;
    };
  }

  function tipiIndex() {
    var idx = {};
    T().tipi_elicotteri.forEach(function (t) { idx[String(t.id_tipo)] = t.tipo_eli; });
    return idx;
  }
  function codiceIndex() {
    var idx = {};
    T().codice.forEach(function (c) { idx[String(c.tipo_vlv) + "|" + String(c.id)] = c.Parte; });
    return idx;
  }

  // ─── Elicotteri ──────────────────────────────────────────────────────────
  function rawEli(sigla) {
    var list = T().Elicotteri;
    for (var i = 0; i < list.length; i++) if (strEq(list[i].sigla, sigla)) return list[i];
    return null;
  }
  function withTipo(e, idx) {
    if (!e) return null;
    var o = Object.assign({}, e);
    o.tipo_eli = idx[String(e.id_tipo)];
    return o;
  }
  function getElicotteri(includeCancellati) {
    var idx = tipiIndex();
    return T().Elicotteri
      .filter(function (e) { return includeCancellati ? true : (e.cancellato !== "True"); })
      .map(function (e) { return withTipo(e, idx); })
      .sort(by([function (x) { return x.tipo_eli; }, "raw"],
               [function (x) { return x.sigla; }, "num"]));
  }
  function getElicottero(sigla) { return withTipo(rawEli(sigla), tipiIndex()); }
  function getTipi() {
    return T().tipi_elicotteri.slice().sort(by([function (x) { return x.tipo_eli; }, "raw"]));
  }
  function getTipo(idTipo) {
    var f = T().tipi_elicotteri.filter(function (t) { return strEq(t.id_tipo, idTipo); });
    return f[0] || null;
  }

  function addElicottero(data) {
    T().Elicotteri.push({
      id_tipo: data.id_tipo, sigla: data.sigla, M_M: g(data, "M_M", ""),
      Ore_iniziali: g(data, "Ore_iniziali", 0), Ore_totali: g(data, "Ore_totali", 0),
      ore_dur_appl: g(data, "ore_dur_appl", "False"), Ore_DUR: g(data, "Ore_DUR", 0),
      Internazionale: g(data, "Internazionale", "False"), bassa_vis: g(data, "bassa_vis", "False"),
      NVG: g(data, "NVG", "False"), Annotazioni: g(data, "Annotazioni", ""),
      dal: g(data, "dal", ""), rpt_prov: g(data, "rpt_prov", ""), cancellato: "False"
    });
    return ["Elicotteri"];
  }
  function updateElicottero(sigla, data) {
    var e = rawEli(sigla);
    if (!e) return [];
    e.id_tipo = data.id_tipo; e.M_M = g(data, "M_M", "");
    e.Ore_iniziali = g(data, "Ore_iniziali", 0); e.Ore_totali = g(data, "Ore_totali", 0);
    e.ore_dur_appl = g(data, "ore_dur_appl", "False"); e.Ore_DUR = g(data, "Ore_DUR", 0);
    e.Internazionale = g(data, "Internazionale", "False"); e.bassa_vis = g(data, "bassa_vis", "False");
    e.NVG = g(data, "NVG", "False"); e.Annotazioni = g(data, "Annotazioni", "");
    e.dal = g(data, "dal", ""); e.rpt_prov = g(data, "rpt_prov", "");
    e.cancellato = g(data, "cancellato", "False");
    return ["Elicotteri"];
  }
  function cancellaElicottero(sigla) {
    var e = rawEli(sigla);
    if (e) e.cancellato = "True";
    return ["Elicotteri"];
  }

  // ─── Situazione giornaliera ───────────────────────────────────────────────
  function getSitGiorn(sigla, limit) {
    limit = limit || 70;
    return T().sit_giornaliera
      .filter(function (r) { return strEq(r.sigla, sigla); })
      .sort(by([function (x) { return x.data; }, "raw"])).reverse()
      .slice(0, limit);
  }
  function getSitGiornByProg(prog) {
    var f = T().sit_giornaliera.filter(function (r) { return strEq(r.progressivo, prog); });
    return f[0] || null;
  }
  function getSitGiornRange(sigla, da, a) {
    return T().sit_giornaliera.filter(function (r) {
      return strEq(r.sigla, sigla) && r.data >= da && r.data <= a;
    }).sort(by([function (x) { return x.data; }, "raw"]));
  }
  function getSitGiornAllRange(da, a) {
    var idx = tipiIndex();
    var eliBySigla = {};
    T().Elicotteri.forEach(function (e) { eliBySigla[String(e.sigla)] = e; });
    return T().sit_giornaliera.filter(function (r) {
      return r.data >= da && r.data <= a && eliBySigla[String(r.sigla)];
    }).map(function (r) {
      var e = eliBySigla[String(r.sigla)];
      var o = Object.assign({}, r);
      o.M_M = e.M_M; o.tipo_eli = idx[String(e.id_tipo)];
      return o;
    }).sort(by([function (x) { return x.sigla; }, "raw"],
               [function (x) { return x.data; }, "raw"]));
  }
  function getUltimaPos(sigla) {
    var f = T().sit_giornaliera
      .filter(function (r) { return strEq(r.sigla, sigla); })
      .sort(by([function (x) { return x.data; }, "raw"]));
    if (!f.length) return null;
    var r = f[f.length - 1];
    return { pos: r.pos, note: r.note, cod: r.cod, data: r.data };
  }

  function addSitGiorn(sigla, dataVal, oreGiorno, cicli, pos, note, cod) {
    var maxProg = 0;
    T().sit_giornaliera.forEach(function (r) { var p = castInt(r.progressivo); if (p > maxProg) maxProg = p; });
    var prog = maxProg + 1;
    T().sit_giornaliera.push({
      sigla: String(sigla), data: dataVal, ore_giorno: String(oreGiorno),
      cicli: String(cicli), pos: pos, note: note, cod: cod,
      Registrato: "True", progressivo: prog
    });
    var ch = applicaVolo(sigla, oreGiorno, cicli);
    return uniq(["sit_giornaliera"].concat(ch));
  }
  function deleteSitGiorn(prog) {
    var list = T().sit_giornaliera;
    var i = -1, row = null;
    for (var k = 0; k < list.length; k++) if (strEq(list[k].progressivo, prog)) { i = k; row = list[k]; break; }
    if (i < 0) return [];
    list.splice(i, 1);
    var ch = applicaVolo(row.sigla, O.sottrai_ore(0, row.ore_giorno || 0), -toInt(row.cicli));
    return uniq(["sit_giornaliera"].concat(ch));
  }
  function updateSitGiorn(prog, dataVal, oreGiorno, cicli, pos, note, cod) {
    var row = getSitGiornByProg(prog);
    if (!row) return [];
    var vecchieOre = row.ore_giorno || 0;
    var vecchiCicli = row.cicli;
    row.data = dataVal; row.ore_giorno = String(oreGiorno); row.cicli = String(cicli);
    row.pos = pos; row.note = note; row.cod = cod;
    var deltaOre = O.sottrai_ore(oreGiorno || 0, vecchieOre);
    var deltaCicli = toInt(cicli) - toInt(vecchiCicli);
    var ch = applicaVolo(row.sigla, deltaOre, deltaCicli);
    return uniq(["sit_giornaliera"].concat(ch));
  }

  // aggiorna ore eli (Ore_totali/Ore_DUR) e cicli parti — MAI le ore parti
  function applicaVolo(sigla, deltaOre, deltaCicli) {
    var eli = rawEli(sigla);
    if (!eli) return [];
    var changed = ["Elicotteri"];
    eli.Ore_totali = String(O.somma_ore(eli.Ore_totali || 0, deltaOre));
    if (String(eli.ore_dur_appl == null ? "False" : eli.ore_dur_appl) === "True") {
      eli.Ore_DUR = String(O.somma_ore(eli.Ore_DUR || 0, deltaOre));
    }
    var dc = toInt(deltaCicli);
    if (dc) {
      T().parti.forEach(function (p) {
        if (strEq(p.sigla, sigla)) p.cicli_tot = String(toInt(p.cicli_tot) + dc);
      });
      changed.push("parti");
    }
    return changed;
  }

  // ─── Parti / componenti ───────────────────────────────────────────────────
  function derivaParte(p, eli, cidx) {
    var o = Object.assign({}, p);
    var oreCompl = O.somma_ore(eli.Ore_totali || 0, eli.Ore_iniziali || 0);
    o.ore_complessive = oreCompl;
    o.ore_attuali = O.somma_ore(O.sottrai_ore(oreCompl, p.ore_vlv_imb), p.ore_particolare);
    o.reale = (trimStr(p.part_num) !== "" && trimStr(p.ser_num) !== "");
    o.Parte = cidx[String(p.tipo_vlv) + "|" + String(p.id)];
    return o;
  }
  function getParti(sigla) {
    var eli = rawEli(sigla);
    if (!eli) return [];
    var cidx = codiceIndex();
    return T().parti
      .filter(function (p) { return strEq(p.sigla, sigla); })
      .map(function (p) { return derivaParte(p, eli, cidx); })
      .sort(by([function (x) { return x.tipo_vlv; }, "num"], [function (x) { return x.id; }, "num"]));
  }
  function getPartiReali(sigla) { return getParti(sigla).filter(function (p) { return p.reale; }); }
  function rawParte(contatore) {
    var list = T().parti;
    for (var i = 0; i < list.length; i++) if (strEq(list[i].contatore, contatore)) return list[i];
    return null;
  }
  function getParte(contatore) {
    var p = rawParte(contatore);
    if (!p) return null;
    var eli = rawEli(p.sigla);
    if (!eli) return null;
    return derivaParte(p, eli, codiceIndex());
  }
  function addParte(data) {
    var maxC = 0;
    T().parti.forEach(function (p) { var c = castInt(p.contatore); if (c > maxC) maxC = c; });
    T().parti.push({
      contatore: maxC + 1, sigla: data.sigla, id: data.id,
      scad_lof: g(data, "scad_lof", ""), scad_lic: g(data, "scad_lic", ""),
      tipo_vlv: data.tipo_vlv, part_num: g(data, "part_num", ""), ser_num: g(data, "ser_num", ""),
      applicabilita: g(data, "applicabilita", "False"), data_imbarco: g(data, "data_imbarco", ""),
      ultimo_lic: g(data, "ultimo_lic", ""), ultimo_lof: g(data, "ultimo_lof", ""),
      ore_dur_appl: g(data, "ore_dur_appl", "False"), ore_dur: g(data, "ore_dur", 0),
      ore_vlv_imb: g(data, "ore_vlv_imb", 0), ore_particolare: g(data, "ore_particolare", 0),
      cicli_tot: g(data, "cicli_tot", 0), ore_totali_particolare: g(data, "ore_totali_particolare", 0)
    });
    return ["parti"];
  }
  function updateParte(contatore, data) {
    var p = rawParte(contatore);
    if (!p) return [];
    p.scad_lof = g(data, "scad_lof", ""); p.scad_lic = g(data, "scad_lic", "");
    p.part_num = g(data, "part_num", ""); p.ser_num = g(data, "ser_num", "");
    p.applicabilita = g(data, "applicabilita", "False"); p.data_imbarco = g(data, "data_imbarco", "");
    p.ultimo_lic = g(data, "ultimo_lic", ""); p.ultimo_lof = g(data, "ultimo_lof", "");
    p.ore_dur_appl = g(data, "ore_dur_appl", "False"); p.ore_dur = g(data, "ore_dur", 0);
    p.ore_vlv_imb = g(data, "ore_vlv_imb", 0); p.ore_particolare = g(data, "ore_particolare", 0);
    p.cicli_tot = g(data, "cicli_tot", 0); p.ore_totali_particolare = g(data, "ore_totali_particolare", 0);
    return ["parti"];
  }
  function deleteParte(contatore) {
    var list = T().parti;
    for (var i = 0; i < list.length; i++) if (strEq(list[i].contatore, contatore)) { list.splice(i, 1); break; }
    return ["parti"];
  }

  // ─── Codici ────────────────────────────────────────────────────────────────
  function getCodici(idTipo) {
    return T().codice.filter(function (c) { return strEq(c.tipo_vlv, idTipo); })
      .sort(by([function (x) { return x.id; }, "num"]));
  }
  function addCodice(tipoVlv, idCod, parte) {
    T().codice.push({ tipo_vlv: String(tipoVlv), id: String(idCod), Parte: parte });
    return ["codice"];
  }
  function updateCodice(tipoVlv, idCod, parte) {
    T().codice.forEach(function (c) { if (strEq(c.tipo_vlv, tipoVlv) && strEq(c.id, idCod)) c.Parte = parte; });
    return ["codice"];
  }
  function deleteCodice(tipoVlv, idCod) {
    var list = T().codice;
    for (var i = 0; i < list.length; i++) if (strEq(list[i].tipo_vlv, tipoVlv) && strEq(list[i].id, idCod)) { list.splice(i, 1); break; }
    return ["codice"];
  }

  // ─── Ente / indirizzi / info mensile ──────────────────────────────────────
  function getEnte() { return T().ente_appartenenza.slice().sort(by([function (x) { return x.id; }, "raw"])); }
  function getIndirizzi() { return T().indirizzi_X_report.slice().sort(by([function (x) { return x.contatore; }, "raw"])); }
  function updateEnte(idEnte, voce) {
    T().ente_appartenenza.forEach(function (e) { if (strEq(e.id, idEnte)) e.Voce = voce; });
    return ["ente_appartenenza"];
  }
  function updateIndirizzo(contatore, indirizzo) {
    T().indirizzi_X_report.forEach(function (i) { if (strEq(i.contatore, contatore)) i.indirizzi = indirizzo; });
    return ["indirizzi_X_report"];
  }
  function getInfoMensile(sigla) {
    var f = T().info_X_report_mensile.filter(function (r) { return strEq(r.sigla, sigla); });
    return f[0] || null;
  }
  function upsertInfoMensile(sigla, data) {
    var row = getInfoMensile(sigla);
    var fields = {
      M1: g(data, "M1", "False"), S1: g(data, "S1", "False"), R1: g(data, "R1", "False"),
      BASE: g(data, "BASE", ""), cess_temp_da: g(data, "cess_temp_da", ""), cess_temp_a: g(data, "cess_temp_a", ""),
      scad1: g(data, "scad1", 0), scad2: g(data, "scad2", 0), scad3: g(data, "scad3", ""),
      cod_scad1: g(data, "cod_scad1", ""), cod_scad2: g(data, "cod_scad2", ""), cod_scad3: g(data, "cod_scad3", ""),
      M2: g(data, "M2", "False"), S2: g(data, "S2", "False"), R2: g(data, "R2", "False"),
      M3: g(data, "M3", "False"), S3: g(data, "S3", "False"), R3: g(data, "R3", "False")
    };
    if (row) Object.assign(row, fields);
    else T().info_X_report_mensile.push(Object.assign({ sigla: String(sigla) }, fields));
    return ["info_X_report_mensile"];
  }

  // ─── Report mensile ───────────────────────────────────────────────────────
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function parseISO(s) { var p = String(s).split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function diffDays(da, a) { return Math.round((parseISO(a) - parseISO(da)) / 86400000); }

  var POS_INEFF = { "I": 1, "Inc.": 1, "F.U.": 1, "F": 1 };
  var POS_REGISTRA = { "I": 1, "Inc.": 1, "F.U.": 1 };

  function calcolaSitMensile(mese, anno, sigleSel) {
    mese = parseInt(mese, 10); anno = parseInt(anno, 10);
    var giorniMese = new Date(anno, mese, 0).getDate();
    var inizio = anno + "-" + pad2(mese) + "-01";
    var fine = anno + "-" + pad2(mese) + "-" + pad2(giorniMese);

    T().sit_mensile.length = 0;
    T().sit_ineff.length = 0;

    sigleSel.forEach(function (sigla) {
      var eli = getElicottero(sigla);
      if (!eli) return;

      var righe = T().sit_giornaliera.filter(function (r) {
        return strEq(r.sigla, sigla) && dateOf(r.data) >= inizio && dateOf(r.data) <= fine;
      }).sort(by([function (x) { return dateOf(x.data); }, "raw"]));

      var oreMese = 0.0, ultimaPos = "E", periodi = [];

      // gg_presenza dal campo eli.dal[:10] (come db.py)
      var dalStr = eli.dal ? dateOf(eli.dal) : "";
      var ggPresenza;
      var dalMs = null;
      try { dalMs = dalStr ? parseISO(dalStr) : null; } catch (e) { dalMs = null; }
      if (dalMs === null || isNaN(dalMs)) ggPresenza = giorniMese;
      else if (dalMs > parseISO(fine)) ggPresenza = 0;
      else if (dalMs > parseISO(inizio)) ggPresenza = diffDays(dalStr, fine) + 1;
      else ggPresenza = giorniMese;

      var posCorrente = null, dataInizioIneff = null;

      var pre = T().sit_giornaliera
        .filter(function (r) { return strEq(r.sigla, sigla) && dateOf(r.data) < inizio; })
        .sort(by([function (x) { return dateOf(x.data); }, "raw"]));
      pre = pre.length ? pre[pre.length - 1] : null;
      if (pre && POS_INEFF[pre.pos]) { posCorrente = pre.pos; dataInizioIneff = inizio; }

      righe.forEach(function (r) {
        var oreG = parseFloat(String(r.ore_giorno || 0).replace(",", "."));
        if (isNaN(oreG)) oreG = 0;
        if (r.pos === "E") oreMese = O.somma_ore(oreMese, oreG);
        ultimaPos = r.pos;
        if (POS_INEFF[r.pos]) {
          if (posCorrente === null) { posCorrente = r.pos; dataInizioIneff = r.data ? dateOf(r.data) : null; }
        } else {
          if (posCorrente !== null) {
            periodi.push({ da: dataInizioIneff, a: r.data ? dateOf(r.data) : fine, pos: posCorrente, note: r.cod || "" });
            posCorrente = null; dataInizioIneff = null;
          }
        }
      });
      if (posCorrente !== null) periodi.push({ da: dataInizioIneff, a: fine, pos: posCorrente, note: "" });

      var ggIneff = 0;
      periodi.forEach(function (p) {
        try { if (p.da && p.a) ggIneff += diffDays(p.da, p.a); } catch (e) {}
        if (POS_REGISTRA[p.pos]) {
          T().sit_ineff.push({ sigla: String(sigla), da: p.da, a: p.a, pos: p.pos, Note: p.note });
        }
      });

      var ggEff = ggPresenza - ggIneff;
      var oreTotEli = O.somma_ore(eli.Ore_totali || 0, eli.Ore_iniziali || 0);
      T().sit_mensile.push({
        Tipo: eli.tipo_eli || "", sigla: String(sigla), M_M: eli.M_M || "",
        Ore_mese: String(oreMese), Ore_totali: String(oreTotEli), Ore_DUR: String(eli.Ore_DUR || 0),
        eff_finale: ultimaPos, gg_disposizione: String(ggEff), gg_presenza: String(ggPresenza)
      });
    });

    // join con info_X_report_mensile
    return T().sit_mensile.map(function (sm) {
      var info = getInfoMensile(sm.sigla) || {};
      var o = Object.assign({}, sm);
      ["BASE", "M1", "S1", "R1", "cess_temp_da", "cess_temp_a",
       "scad1", "scad2", "scad3", "cod_scad1", "cod_scad2", "cod_scad3"].forEach(function (k) { o[k] = info[k]; });
      return o;
    }).sort(by([function (x) { return x.Tipo; }, "raw"], [function (x) { return x.sigla; }, "num"]));
  }

  // ─── LIC/LOF per codice ───────────────────────────────────────────────────
  function getLicLof(tipoVlv, idCod) {
    var idx = tipiIndex(), cidx = codiceIndex();
    var eliBySigla = {};
    T().Elicotteri.forEach(function (e) { eliBySigla[String(e.sigla)] = e; });
    return T().parti.filter(function (p) {
      return strEq(p.tipo_vlv, tipoVlv) && strEq(p.id, idCod) &&
             trimStr(p.part_num) !== "" && trimStr(p.ser_num) !== "" &&
             eliBySigla[String(p.sigla)] &&
             cidx[String(p.tipo_vlv) + "|" + String(p.id)] !== undefined;
    }).map(function (p) {
      var e = eliBySigla[String(p.sigla)];
      var oreCompl = O.somma_ore(e.Ore_totali || 0, e.Ore_iniziali || 0);
      var o = Object.assign({}, p);
      o.M_M = e.M_M; o.sigla_eli = e.sigla; o.tipo_eli = idx[String(e.id_tipo)];
      o.Parte = cidx[String(p.tipo_vlv) + "|" + String(p.id)];
      o.ore_complessive = oreCompl;
      o.ore_tot_mot = O.somma_ore(O.sottrai_ore(oreCompl, p.ore_vlv_imb), p.ore_particolare);
      return o;
    }).sort(by([function (x) { return x.sigla; }, "num"]));
  }

  function uniq(arr) { return arr.filter(function (v, i, a) { return a.indexOf(v) === i; }); }

  global.Logic = {
    castInt: castInt, toInt: toInt, strEq: strEq,
    getElicotteri: getElicotteri, getElicottero: getElicottero, getTipi: getTipi, getTipo: getTipo,
    addElicottero: addElicottero, updateElicottero: updateElicottero, cancellaElicottero: cancellaElicottero,
    getSitGiorn: getSitGiorn, getSitGiornByProg: getSitGiornByProg,
    getSitGiornRange: getSitGiornRange, getSitGiornAllRange: getSitGiornAllRange, getUltimaPos: getUltimaPos,
    addSitGiorn: addSitGiorn, deleteSitGiorn: deleteSitGiorn, updateSitGiorn: updateSitGiorn,
    getParti: getParti, getPartiReali: getPartiReali, getParte: getParte,
    addParte: addParte, updateParte: updateParte, deleteParte: deleteParte,
    getCodici: getCodici, addCodice: addCodice, updateCodice: updateCodice, deleteCodice: deleteCodice,
    getEnte: getEnte, getIndirizzi: getIndirizzi, updateEnte: updateEnte, updateIndirizzo: updateIndirizzo,
    getInfoMensile: getInfoMensile, upsertInfoMensile: upsertInfoMensile,
    calcolaSitMensile: calcolaSitMensile, getLicLof: getLicLof
  };
})(window);
