/* Layer dati: legge/scrive i JSON del repo privato siel-data via GitHub API.
   - Lettura: Contents API con Accept raw (parti/sit_giornaliera superano 1MB).
   - Scrittura: Git Data API, un solo commit atomico per N tabelle.
   - PAT salvato in localStorage, MAI nel codice. */
(function (global) {
  "use strict";

  var API = "https://api.github.com";
  var LS = {
    pat: "siel_pat",
    owner: "siel_owner",
    repo: "siel_data_repo",
    branch: "siel_branch"
  };

  var TABLES = [
    "Elicotteri", "tipi_elicotteri", "codice", "parti",
    "sit_giornaliera", "sit_ineff", "sit_mensile",
    "info_X_report_mensile", "ente_appartenenza", "indirizzi_X_report"
  ];

  var cfg = {
    get pat() { return localStorage.getItem(LS.pat) || ""; },
    set pat(v) { localStorage.setItem(LS.pat, v || ""); },
    get owner() { return localStorage.getItem(LS.owner) || "rdagmr98"; },
    set owner(v) { localStorage.setItem(LS.owner, v || "rdagmr98"); },
    get repo() { return localStorage.getItem(LS.repo) || "siel-data"; },
    set repo(v) { localStorage.setItem(LS.repo, v || "siel-data"); },
    get branch() { return localStorage.getItem(LS.branch) || "main"; },
    set branch(v) { localStorage.setItem(LS.branch, v || "main"); }
  };

  // tabelle in memoria
  var tables = {};
  TABLES.forEach(function (t) { tables[t] = []; });
  var loaded = false;

  function headers(accept) {
    var h = {
      "Authorization": "token " + cfg.pat,
      "Accept": accept || "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    return h;
  }

  function ghBase() {
    return API + "/repos/" + cfg.owner + "/" + cfg.repo;
  }

  async function readTable(name) {
    var url = ghBase() + "/contents/" + name + ".json?ref=" +
              encodeURIComponent(cfg.branch);
    var res = await fetch(url, { headers: headers("application/vnd.github.raw") });
    if (res.status === 404) return [];           // tabella non ancora presente
    if (res.status === 401 || res.status === 403)
      throw new Error("Token non valido o senza accesso a " + cfg.owner + "/" + cfg.repo + " (HTTP " + res.status + ")");
    if (!res.ok) throw new Error("Lettura " + name + " fallita (HTTP " + res.status + ")");
    var txt = await res.text();
    if (!txt.trim()) return [];
    try { return JSON.parse(txt); }
    catch (e) { throw new Error("JSON non valido in " + name + ".json"); }
  }

  async function loadAll(force) {
    if (loaded && !force) return tables;
    if (!cfg.pat) throw new Error("Token mancante: aprire Impostazioni e inserire il PAT.");
    var results = await Promise.all(TABLES.map(readTable));
    TABLES.forEach(function (t, i) { tables[t] = results[i] || []; });
    loaded = true;
    return tables;
  }

  // Commit atomico: solo le tabelle in `names` vengono riscritte.
  async function commit(names, message) {
    if (!cfg.pat) throw new Error("Token mancante.");
    names = (names || []).filter(function (n, i, a) { return a.indexOf(n) === i; });
    if (!names.length) return;

    var refUrl = ghBase() + "/git/ref/heads/" + encodeURIComponent(cfg.branch);
    var refRes = await fetch(refUrl, { headers: headers() });
    if (!refRes.ok) throw new Error("Ref non trovata (HTTP " + refRes.status + ")");
    var ref = await refRes.json();
    var baseSha = ref.object.sha;

    var cRes = await fetch(ghBase() + "/git/commits/" + baseSha, { headers: headers() });
    if (!cRes.ok) throw new Error("Commit base non trovato (HTTP " + cRes.status + ")");
    var baseCommit = await cRes.json();
    var baseTree = baseCommit.tree.sha;

    var treeItems = names.map(function (n) {
      return {
        path: n + ".json",
        mode: "100644",
        type: "blob",
        content: JSON.stringify(tables[n], null, 0)
      };
    });
    var tRes = await fetch(ghBase() + "/git/trees", {
      method: "POST", headers: headers(),
      body: JSON.stringify({ base_tree: baseTree, tree: treeItems })
    });
    if (!tRes.ok) throw new Error("Creazione tree fallita (HTTP " + tRes.status + ")");
    var newTree = (await tRes.json()).sha;

    var commitRes = await fetch(ghBase() + "/git/commits", {
      method: "POST", headers: headers(),
      body: JSON.stringify({
        message: message || "update SIEL data",
        tree: newTree, parents: [baseSha]
      })
    });
    if (!commitRes.ok) throw new Error("Creazione commit fallita (HTTP " + commitRes.status + ")");
    var newCommit = (await commitRes.json()).sha;

    var patchRes = await fetch(ghBase() + "/git/refs/heads/" + encodeURIComponent(cfg.branch), {
      method: "PATCH", headers: headers(),
      body: JSON.stringify({ sha: newCommit, force: false })
    });
    if (!patchRes.ok) throw new Error("Aggiornamento ref fallito (HTTP " + patchRes.status + ")");
    return newCommit;
  }

  global.Store = {
    TABLES: TABLES,
    cfg: cfg,
    tables: tables,
    isLoaded: function () { return loaded; },
    hasPat: function () { return !!cfg.pat; },
    loadAll: loadAll,
    commit: commit,
    reset: function () { loaded = false; }
  };
})(window);
