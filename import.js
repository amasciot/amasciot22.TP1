(() => {
  const METS = [
    "peorDsFecPre", "percDsFecPre", "peorDsFecPost", "percDsFecPost",
    "peorUsFecPre(%)", "percUsFecPre(%)", "peorUsFecPost(%)", "percUsFecPost(%)",
    "peorSnrDs(dB)", "percSnrDs(dB)", "peorSnrUs(dB)", "percSnrUs(dB)",
    "peorPh", "percPh", "peorThroughput(%)", "percThroughput(%)",
    "QU", "QD", "QR",
  ];

  const EVENT_STATUSES = ["Abierto", "Cerrado", "Completado"];
  const STATUS_MAP = {
    "COMPLETA..": "COMPLETADA",
    COMPLETADA: "COMPLETADA",
    ASIGNADA: "ASIGNADA",
    AGENDADA: "AGENDADA",
    CANCELADA: "CANCELADA",
    SUSPENDIDA: "SUSPENDIDA",
    SUSPENDIDANULL: "SUSPENDIDA",
    "NO REALIZ..": "NO REALIZADA",
    "NO REALIZADA": "NO REALIZADA",
  };

  const COLS = [
    ["c", 55],
    ["e", 90],
    ["nodo", 125],
    ["nr", 165],
    ["as", 200],
    ["edate", 240],
    ["hijo", 275],
    ["tc", 315],
    ["tt", 350],
    ["st", 388],
    ["d1", 425],
    ["d2", 462],
    ["eco", 500],
  ];

  const DB_NAME = "nodos-plan-calidad";
  const DB_STORE = "datasets";
  const DB_KEY = "current";

  function nearestCol(x) {
    let best = COLS[0][0];
    let bestD = Infinity;
    for (const [name, cx] of COLS) {
      const d = Math.abs(cx - x);
      if (d < bestD) {
        bestD = d;
        best = name;
      }
    }
    return best;
  }

  function isNode(tok) {
    return /^[A-Z]{2}\d{2}[A-Z]{1,3}$/.test(tok);
  }

  function dayNum(s) {
    if (!s || s === "NULL") return null;
    const m = String(s).match(/(\d{1,2})\s*de/i) || String(s).match(/^(\d{1,2})\b/);
    return m ? +m[1] : null;
  }

  function parseNum(v) {
    if (v == null || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  function parseFecha(raw) {
    // 01-11-2026 00:00:00 or 01/11/2026
    const m = String(raw).trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
    if (!m) return null;
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${dd}/${mm}`;
  }

  function detectDelim(headerLine) {
    const sc = (headerLine.match(/;/g) || []).length;
    const cc = (headerLine.match(/,/g) || []).length;
    return sc >= cc ? ";" : ",";
  }

  function parseCsvText(text) {
    const cleaned = text.replace(/^\uFEFF/, "");
    const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length);
    if (!lines.length) throw new Error("El CSV está vacío.");
    const delim = detectDelim(lines[0]);
    const headers = lines[0].split(delim).map((h) => h.trim());
    const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
    if (idx.Nodo == null || idx.Fecha == null) {
      throw new Error('El CSV debe tener columnas "Nodo" y "Fecha".');
    }
    const mets = METS.filter((m) => idx[m] != null);
    if (!mets.length) throw new Error("No se reconocieron columnas de métricas de calidad.");

    const byNode = new Map();
    const daySet = new Set();
    for (let li = 1; li < lines.length; li++) {
      const parts = lines[li].split(delim);
      if (parts.length < 3) continue;
      const nodo = String(parts[idx.Nodo] || "").trim().toUpperCase();
      const day = parseFecha(parts[idx.Fecha] || "");
      if (!nodo || !day) continue;
      daySet.add(day);
      if (!byNode.has(nodo)) byNode.set(nodo, new Map());
      const vals = mets.map((m) => parseNum(parts[idx[m]]));
      byNode.get(nodo).set(day, vals);
    }

    const days = [...daySet].sort((a, b) => {
      const [da, ma] = a.split("/").map(Number);
      const [db, mb] = b.split("/").map(Number);
      return ma - mb || da - db;
    });

    const csv = {};
    for (const [nodo, map] of byNode) {
      const flat = [];
      for (const d of days) {
        const row = map.get(d);
        for (let i = 0; i < mets.length; i++) flat.push(row ? row[i] : null);
      }
      csv[nodo] = flat;
    }

    return { days, mets, csv, nodes: byNode.size };
  }

  function normalizeStatus(raw) {
    if (!raw) return null;
    for (const [k, v] of Object.entries(STATUS_MAP)) {
      if (raw.includes(k)) return v;
    }
    return null;
  }

  function expandContractor(raw, known) {
    const s = String(raw || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    const up = s.toUpperCase();
    let best = "";
    for (const k of known) {
      const ku = k.toUpperCase();
      if (ku.startsWith(up) || up.startsWith(ku.slice(0, Math.min(12, ku.length)))) {
        if (k.length > best.length) best = k;
      }
    }
    return best || s;
  }

  function parsePlanItems(items, csvKeys, knownContractors) {
    // items: {str, x, y, page}[]
    const bands = new Map();
    for (const it of items) {
      if (!it.str || !String(it.str).trim()) continue;
      const y = Math.round(it.y / 2) * 2;
      const key = `${it.page}:${y}`;
      if (!bands.has(key)) bands.set(key, []);
      bands.get(key).push(it);
    }

    const rows = [];
    for (const [, ws] of [...bands.entries()].sort((a, b) => {
      const [pa, ya] = a[0].split(":").map(Number);
      const [pb, yb] = b[0].split(":").map(Number);
      return pa - pb || ya - yb;
    })) {
      ws.sort((a, b) => a.x - b.x);
      const cells = {};
      for (const w of ws) {
        const col = nearestCol(w.x);
        cells[col] = (cells[col] ? cells[col] + " " : "") + w.str;
      }
      const line = ws.map((w) => w.str).join(" ");
      if (/PLAN Contr/i.test(line) || /^PLAN MPR/i.test(line.trim())) continue;

      let node = null;
      for (const val of Object.values(cells)) {
        for (const tok of String(val).split(/\s+/)) {
          if (isNode(tok)) {
            node = tok;
            break;
          }
        }
        if (node) break;
      }
      if (!node) continue;

      const st = normalizeStatus(cells.st || "") || normalizeStatus(line);
      let e = null;
      for (const ev of EVENT_STATUSES) {
        if ((cells.e || "").includes(ev) || line.includes(ev)) e = ev;
      }
      const c = String(cells.c || "").replace(/\s+/g, " ").trim();
      let day = dayNum(cells.d1) || dayNum(cells.d2);
      if (day == null) {
        const m = line.match(/(\d{1,2})\s+de\s+nov/i);
        if (m) day = +m[1];
      }
      const r = [];
      if (/\bEXITO\b/.test(line) || /\bEXITO\b/.test(cells.as || "")) r.push("EXITO");
      rows.push({ node, c, e, st, day, r });
    }

    const plan = new Map();
    let curC = "";
    let curE = null;
    for (const r of rows) {
      if (r.c && r.c.length > 3 && !EVENT_STATUSES.includes(r.c)) curC = r.c;
      if (r.e) curE = r.e;
      if (!r.st) continue;

      let key = r.node;
      if (/[LR]$/.test(r.node)) {
        const base = r.node.slice(0, -1);
        if (csvKeys.has(base)) key = base;
      }

      if (!plan.has(key)) {
        plan.set(key, { ids: [], c: "", e: new Set(), r: new Set(), t: [] });
      }
      const p = plan.get(key);
      if (!p.ids.includes(r.node)) p.ids.push(r.node);
      if (curC) p.c = expandContractor(curC, knownContractors);
      if (curE) p.e.add(curE);
      for (const x of r.r) p.r.add(x);
      p.t.push([r.st, r.day == null ? 0 : r.day]);
    }

    const out = {};
    for (const [k, p] of plan) {
      out[k] = {
        ids: p.ids,
        c: p.c,
        e: [...p.e],
        r: [...p.r],
        t: p.t,
      };
    }
    return { plan: out, rows: rows.length, nodes: plan.size };
  }

  async function extractPdfItems(file) {
    if (!window.pdfjsLib) throw new Error("No se cargó PDF.js.");
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const items = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      for (const it of tc.items) {
        if (!it.str) continue;
        // pdf.js: transform [a,b,c,d,e,f] => e=x, f=y from bottom
        const x = it.transform[4];
        const yFromBottom = it.transform[5];
        const y = viewport.height - yFromBottom;
        items.push({ str: it.str, x, y, page: i });
      }
    }
    return items;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveDataset(data, meta) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put({ data, meta, savedAt: Date.now() }, DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function loadDataset() {
    try {
      const db = await openDb();
      const row = await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const req = tx.objectStore(DB_STORE).get(DB_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return row;
    } catch {
      return null;
    }
  }

  async function clearDataset() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).delete(DB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function buildFromFiles(csvFile, pdfFile) {
    if (!csvFile) throw new Error("Elegí el export.csv de calidad.");
    if (!pdfFile) throw new Error("Elegí el PDF del PLAN MPR.");

    const csvText = await csvFile.text();
    const quality = parseCsvText(csvText);
    const csvKeys = new Set(Object.keys(quality.csv));

    const known = new Set();
    // contractors mentioned in CSV sample rows (first pass already parsed nodes only)
    // re-scan a bit for contractor names
    const delim = detectDelim(csvText.replace(/^\uFEFF/, "").split(/\r?\n/)[0]);
    const lines = csvText.replace(/^\uFEFF/, "").split(/\r?\n/);
    const headers = lines[0].split(delim).map((h) => h.trim());
    const ci = headers.indexOf("Contratista");
    if (ci >= 0) {
      for (let i = 1; i < Math.min(lines.length, 5000); i++) {
        const parts = lines[i].split(delim);
        const c = (parts[ci] || "").trim();
        if (c) known.add(c);
      }
    }
    // common plan short names
    [
      "CONSTRUCCIONES RD S.A",
      "EPICA NERO S.A.",
      "INSERTEL S.A.",
      "INTEROPTICS S.A.",
      "JMC TELECOMUNICACIONES S.A.",
      "PEBCOM S.A.",
      "SBC PRODUCCIONES S.A.",
      "SERVICIOS INTEGRADOS Y CONST. (SICE)",
      "SUR RED S.A.",
      "TLC PERSONAL PROPIO",
      "SERVICIOS INTEGRADOS Y CONSTRUCCIONES ESPECIALES SICE S.A",
    ].forEach((c) => known.add(c));

    const items = await extractPdfItems(pdfFile);
    const planParsed = parsePlanItems(items, csvKeys, known);

    // enrich contractor from CSV when possible
    const delim2 = delim;
    const headers2 = headers;
    const ni = headers2.indexOf("Nodo");
    if (ci >= 0 && ni >= 0) {
      const byNodeC = new Map();
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(delim2);
        const n = (parts[ni] || "").trim().toUpperCase();
        const c = (parts[ci] || "").trim();
        if (n && c && !byNodeC.has(n)) byNodeC.set(n, c);
      }
      for (const [k, p] of Object.entries(planParsed.plan)) {
        const fromCsv = byNodeC.get(k) || p.ids.map((id) => byNodeC.get(id)).find(Boolean);
        if (fromCsv) p.c = fromCsv;
      }
    }

    const data = {
      days: quality.days,
      mets: quality.mets,
      csv: quality.csv,
      plan: planParsed.plan,
    };

    const meta = {
      csvName: csvFile.name,
      pdfName: pdfFile.name,
      qualityNodes: quality.nodes,
      planNodes: planParsed.nodes,
      days: quality.days.length,
      linked: Object.keys(planParsed.plan).filter((k) => csvKeys.has(k)).length,
    };

    return { data, meta };
  }

  window.NodosImport = {
    METS,
    parseCsvText,
    buildFromFiles,
    saveDataset,
    loadDataset,
    clearDataset,
  };
})();
