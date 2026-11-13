(async () => {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
  }

  let sourceMeta = { sample: true };
  let D = window.NODOS_DATA;
  try {
    const stored = window.NodosImport && (await window.NodosImport.loadDataset());
    if (stored && stored.data && stored.data.csv && stored.data.plan) {
      D = stored.data;
      sourceMeta = stored.meta || { sample: false };
    }
  } catch {
    /* keep sample */
  }

  if (!D) {
    document.body.innerHTML = "<main><p>No se pudo cargar datos.</p></main>";
    return;
  }

  const M = D.mets.length;
  const ND = D.days.length;
  const $ = (id) => document.getElementById(id);
  const COL = ["#1f6feb", "#d9480f", "#2b8a3e", "#9c36b5", "#c2255c", "#0b7285", "#e67700", "#5f3dc4", "#495057", "#a61e4d"];
  const LIMIT = 300;
  const CHART_LIMIT = 10;
  const STORE_KEY = "nodos-plan-calidad-v2";

  const MET_LABELS = {
    peorDsFecPre: "Peor DS FEC pre",
    percDsFecPre: "% DS FEC pre",
    peorDsFecPost: "Peor DS FEC post",
    percDsFecPost: "% DS FEC post",
    "peorUsFecPre(%)": "Peor US FEC pre (%)",
    "percUsFecPre(%)": "% US FEC pre",
    "peorUsFecPost(%)": "Peor US FEC post (%)",
    "percUsFecPost(%)": "% US FEC post",
    "peorSnrDs(dB)": "Peor SNR DS (dB)",
    "percSnrDs(dB)": "% SNR DS (dB)",
    "peorSnrUs(dB)": "Peor SNR US (dB)",
    "percSnrUs(dB)": "% SNR US (dB)",
    peorPh: "Peor PH",
    percPh: "% PH",
    "peorThroughput(%)": "Peor throughput (%)",
    "percThroughput(%)": "% throughput",
    QU: "QU",
    QD: "QD",
    QR: "QR",
  };

  const keys = [...new Set([...Object.keys(D.csv), ...Object.keys(D.plan)])].sort();
  const linkedKeys = keys.filter((k) => D.csv[k] && D.plan[k]);
  const planOnlyKeys = keys.filter((k) => D.plan[k] && !D.csv[k]);
  const qualityOnlyKeys = keys.filter((k) => D.csv[k] && !D.plan[k]);
  const sel = new Set();
  let sortKey = "nodo";
  let sortDir = 1;
  let covMode = "all"; // all | linked | plan | quality
  let vis = [];

  const V = (k, d, m) => (D.csv[k] ? D.csv[k][d * M + m] : null);
  const labelMet = (m) => MET_LABELS[m] || m;
  const fmt = (v) => {
    if (v == null) return "—";
    if (v !== 0 && Math.abs(v) < 0.001) return v.toExponential(1);
    return String(+v.toPrecision(3));
  };

  const uniq = (f) => [...new Set(Object.values(D.plan).flatMap(f))].filter(Boolean).sort();
  const opt = (id, label, arr) => {
    $(id).innerHTML = `<option value="">${label}</option>` + arr.map((x) => `<option>${x}</option>`).join("");
  };

  const tsum = (p) => {
    if (!p) return "—";
    const c = {};
    p.t.forEach((t) => {
      c[t[0]] = (c[t[0]] || 0) + 1;
    });
    return Object.entries(c).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(", ") || "—";
  };

  const last = (k, m) => {
    for (let d = ND - 1; d >= 0; d--) {
      const v = V(k, d, m);
      if (v != null) return v;
    }
    return null;
  };

  const first = (k, m) => {
    for (let d = 0; d < ND; d++) {
      const v = V(k, d, m);
      if (v != null) return v;
    }
    return null;
  };

  const delta = (k, m) => {
    const a = first(k, m);
    const b = last(k, m);
    if (a == null || b == null) return null;
    return b - a;
  };

  const qi = Math.max(0, D.mets.indexOf("QR"));

  /** First completed task day (1-based in data), or null. */
  const firstCompletedDay = (p) => {
    if (!p) return null;
    const days = p.t.filter((t) => t[0] === "COMPLETADA" && t[1] >= 1 && t[1] <= ND).map((t) => t[1]);
    return days.length ? Math.min(...days) : null;
  };

  const avgAround = (k, m, dayIdx, before) => {
    const vals = [];
    if (before) {
      for (let d = 0; d < dayIdx; d++) {
        const v = V(k, d, m);
        if (v != null) vals.push(v);
      }
    } else {
      for (let d = dayIdx; d < ND; d++) {
        const v = V(k, d, m);
        if (v != null) vals.push(v);
      }
    }
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  function impactRows(m) {
    return linkedKeys
      .map((k) => {
        const day = firstCompletedDay(D.plan[k]);
        if (day == null) return null;
        const dayIdx = day - 1;
        const pre = avgAround(k, m, dayIdx, true);
        const post = avgAround(k, m, dayIdx, false);
        if (pre == null || post == null) return null;
        return { k, day, pre, post, dlt: post - pre };
      })
      .filter(Boolean)
      .sort((a, b) => b.dlt - a.dlt);
  }

  function syncMetricHeader() {
    $("hq").textContent = `${labelMet(D.mets[+$("mt").value])} (último)`;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const st = JSON.parse(raw);
      if (st.q) $("q").value = st.q;
      if (st.ct) $("ct").value = st.ct;
      if (st.es) $("es").value = st.es;
      if (st.ts) $("ts").value = st.ts;
      if (st.lk) $("lk").checked = !!st.lk;
      if (st.only) $("only").checked = !!st.only;
      if (Number.isInteger(st.mt) && st.mt >= 0 && st.mt < M) $("mt").value = String(st.mt);
      if (Array.isArray(st.sel)) st.sel.forEach((k) => { if (keys.includes(k)) sel.add(k); });
      if (st.sortKey) sortKey = st.sortKey;
      if (st.sortDir === 1 || st.sortDir === -1) sortDir = st.sortDir;
      if (["all", "linked", "plan", "quality"].includes(st.covMode)) covMode = st.covMode;
      if (st.theme === "light" || st.theme === "dark") {
        document.documentElement.setAttribute("data-theme", st.theme);
      }
    } catch {
      /* ignore corrupt state */
    }
  }

  function saveState() {
    const st = {
      q: $("q").value,
      ct: $("ct").value,
      es: $("es").value,
      ts: $("ts").value,
      lk: $("lk").checked,
      only: $("only").checked,
      mt: +$("mt").value,
      sel: [...sel],
      sortKey,
      sortDir,
      covMode,
      theme: document.documentElement.getAttribute("data-theme") || "",
    };
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(st));
    } catch {
      /* quota / private mode */
    }
  }

  function updateThemeButton() {
    const theme = document.documentElement.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = theme === "dark" || (!theme && prefersDark);
    $("theme").textContent = isDark ? "Modo claro" : "Modo oscuro";
  }

  function rows() {
    const q = $("q").value.trim().toUpperCase();
    const ct = $("ct").value;
    const es = $("es").value;
    const ts = $("ts").value;
    const lk = $("lk").checked;
    const only = $("only").checked;
    const m = +$("mt").value;

    let out = keys.filter((k) => {
      const p = D.plan[k];
      const hasCsv = !!D.csv[k];
      if (covMode === "linked" && !(hasCsv && p)) return false;
      if (covMode === "plan" && !(p && !hasCsv)) return false;
      if (covMode === "quality" && !(hasCsv && !p)) return false;
      if (q && !(k.includes(q) || (p && p.ids.some((i) => i.includes(q))))) return false;
      if (lk && !(hasCsv && p)) return false;
      if (only && !sel.has(k)) return false;
      if (ct && !(p && p.c === ct)) return false;
      if (es && !(p && p.e.includes(es))) return false;
      if (ts && !(p && p.t.some((t) => t[0] === ts))) return false;
      return true;
    });

    const cmpStr = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });
    out.sort((a, b) => {
      let av;
      let bv;
      switch (sortKey) {
        case "calidad":
          av = D.csv[a] ? 1 : 0;
          bv = D.csv[b] ? 1 : 0;
          break;
        case "contratista":
          av = D.plan[a]?.c || "";
          bv = D.plan[b]?.c || "";
          return sortDir * cmpStr(av, bv) || cmpStr(a, b);
        case "evento":
          av = D.plan[a]?.e?.join(", ") || "";
          bv = D.plan[b]?.e?.join(", ") || "";
          return sortDir * cmpStr(av, bv) || cmpStr(a, b);
        case "metric": {
          av = last(a, m);
          bv = last(b, m);
          if (av == null && bv == null) return cmpStr(a, b);
          if (av == null) return 1;
          if (bv == null) return -1;
          return sortDir * (av - bv) || cmpStr(a, b);
        }
        case "delta": {
          av = delta(a, m);
          bv = delta(b, m);
          if (av == null && bv == null) return cmpStr(a, b);
          if (av == null) return 1;
          if (bv == null) return -1;
          return sortDir * (av - bv) || cmpStr(a, b);
        }
        default:
          return sortDir * cmpStr(a, b);
      }
      if (typeof av === "number") return sortDir * (av - bv) || cmpStr(a, b);
      return sortDir * cmpStr(String(av), String(bv)) || cmpStr(a, b);
    });

    return out;
  }

  function syncSortHeaders() {
    document.querySelectorAll("button.th[data-sort]").forEach((btn) => {
      const key = btn.dataset.sort;
      if (key === sortKey) btn.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
      else btn.removeAttribute("aria-sort");
    });
  }

  function deltaBadge(v) {
    if (v == null) return "—";
    const cls = v > 0 ? "up" : v < 0 ? "down" : "";
    const sign = v > 0 ? "+" : "";
    return `<span class="b ${cls}">${sign}${fmt(v)}</span>`;
  }

  function list() {
    vis = rows();
    const m = +$("mt").value;
    const shown = vis.slice(0, LIMIT);
    syncMetricHeader();
    $("cnt").textContent = `${vis.length} nodos · ${sel.size} seleccionados` + (vis.length > LIMIT ? ` · se muestran ${LIMIT}` : "");
    $("empty").hidden = shown.length > 0;
    $("tb").innerHTML = shown
      .map((k) => {
        const p = D.plan[k];
        const ids = p && p.ids[0] !== k ? ` <span class="ids">(${p.ids.join(", ")})</span>` : "";
        const ev = p ? p.e.join(", ") + (p.r.length ? " · " + p.r.join(", ") : "") : "—";
        return `<tr class="r${sel.has(k) ? " on" : ""}" data-k="${k}">
          <td><input type="checkbox" ${sel.has(k) ? "checked" : ""} tabindex="-1" aria-label="Seleccionar ${k}"></td>
          <td>${k}${ids}</td>
          <td>${D.csv[k] ? '<span class="b ok">sí</span>' : '<span class="b wr">no</span>'}</td>
          <td>${p ? p.c : "—"}</td>
          <td>${ev}</td>
          <td>${tsum(p)}</td>
          <td class="n">${fmt(last(k, m))}</td>
          <td class="n">${deltaBadge(delta(k, m))}</td>
        </tr>`;
      })
      .join("");
    syncSortHeaders();
    saveState();
  }

  function svg(S, m) {
    const W = 720;
    const H = 250;
    const L = 48;
    const R = 10;
    const T = 10;
    const B = 26;
    let lo = Infinity;
    let hi = -Infinity;
    S.forEach((k) => {
      for (let d = 0; d < ND; d++) {
        const v = V(k, d, m);
        if (v != null) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    });
    if (lo === Infinity) return '<p class="s">Sin datos de calidad para los nodos seleccionados.</p>';
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }

    const x = (d) => L + (d * (W - L - R)) / Math.max(1, ND - 1);
    const y = (v) => T + ((hi - v) * (H - T - B)) / (hi - lo);
    let o = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución de ${labelMet(D.mets[m])}">`;

    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4;
      const yy = y(v);
      o += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--bd)"/><text x="${L - 5}" y="${yy + 4}" text-anchor="end" font-size="10" fill="var(--mut)">${fmt(v)}</text>`;
    }
    D.days.forEach((t, d) => {
      o += `<text x="${x(d)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--mut)">${t}</text>`;
    });

    S.forEach((k, i) => {
      let pth = "";
      let on = false;
      for (let d = 0; d < ND; d++) {
        const v = V(k, d, m);
        if (v == null) {
          on = false;
          continue;
        }
        pth += (on ? "L" : "M") + x(d) + "," + y(v);
        on = true;
      }
      o += `<path d="${pth}" fill="none" stroke="${COL[i % 10]}" stroke-width="2"/>`;
      const p = D.plan[k];
      if (p) {
        p.t.forEach((t) => {
          if (t[0] === "COMPLETADA" && t[1] >= 1 && t[1] <= ND) {
            const dayIdx = t[1] - 1;
            const v = V(k, dayIdx, m);
            if (v != null) {
              o += `<circle cx="${x(dayIdx)}" cy="${y(v)}" r="5" fill="var(--card)" stroke="${COL[i % 10]}" stroke-width="2"><title>${k}: tarea completada el ${D.days[dayIdx]}</title></circle>`;
            }
          }
        });
      }
    });
    return o + "</svg>";
  }

  function kpis(S, m) {
    const vals = [];
    const deltas = [];
    S.forEach((k) => {
      const l = last(k, m);
      if (l != null) vals.push(l);
      const d = delta(k, m);
      if (d != null) deltas.push(d);
    });
    if (!vals.length) {
      $("kpis").hidden = true;
      $("kpis").innerHTML = "";
      return;
    }
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const dAvg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;
    $("kpis").hidden = false;
    $("kpis").innerHTML = [
      ["Nodos c/dato", String(vals.length)],
      ["Último · promedio", fmt(avg)],
      ["Último · mín", fmt(min)],
      ["Último · máx", fmt(max)],
      ["Δ promedio", dAvg == null ? "—" : (dAvg > 0 ? "+" : "") + fmt(dAvg)],
    ]
      .map(([l, v]) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span></div>`)
      .join("");
  }

  function detail() {
    const S = [...sel].sort();
    const m = +$("mt").value;
    syncMetricHeader();
    $("sn").textContent = S.length
      ? `${S.length} nodos · círculo = tarea completada del plan`
      : "Seleccioná nodos en la lista";

    if (!S.length) {
      $("ch").innerHTML = '<p class="s">Elegí uno o más nodos para ver la evolución.</p>';
      $("lg").innerHTML = "";
      $("dt").innerHTML = "";
      $("kpis").hidden = true;
      $("kpis").innerHTML = "";
      saveState();
      return;
    }

    const chartNodes = S.slice(0, CHART_LIMIT);
    $("ch").innerHTML =
      svg(chartNodes, m) +
      (S.length > CHART_LIMIT
        ? `<p class="s" style="margin-top:8px">Gráfico: primeros ${CHART_LIMIT} de ${S.length}. La tabla incluye todos.</p>`
        : "");
    $("lg").innerHTML =
      chartNodes.map((k, i) => `<span><i style="background:${COL[i % 10]}"></i>${k}</span>`).join("") +
      (S.length > CHART_LIMIT ? `<span class="s">+${S.length - CHART_LIMIT} más en la tabla</span>` : "");

    kpis(S, m);

    $("dt").innerHTML = `<thead><tr><th>Nodo</th><th>Tareas del plan</th>${D.days
      .map((d) => `<th class="n">${d}</th>`)
      .join("")}<th class="n">Δ</th></tr></thead><tbody>${S.map((k) => {
      const dlt = delta(k, m);
      return `<tr><td>${k}</td><td>${tsum(D.plan[k])}</td>${D.days
        .map((_, d) => `<td class="n">${fmt(V(k, d, m))}</td>`)
        .join("")}<td class="n">${deltaBadge(dlt)}</td></tr>`;
    }).join("")}</tbody>`;
    saveState();
  }

  function renderCoverage() {
    const pct = Object.keys(D.plan).length
      ? Math.round((linkedKeys.length / Object.keys(D.plan).length) * 1000) / 10
      : 0;
    const items = [
      ["all", keys.length, "Todos"],
      ["linked", linkedKeys.length, `Vinculados (${pct}% del plan)`],
      ["plan", planOnlyKeys.length, "Solo plan"],
      ["quality", qualityOnlyKeys.length, "Solo calidad"],
    ];
    $("cov").innerHTML = items
      .map(
        ([mode, n, label]) =>
          `<button type="button" data-cov="${mode}" class="${covMode === mode ? "on" : ""}" aria-pressed="${covMode === mode}">
            <span class="n">${n}</span><span class="l">${label}</span>
          </button>`
      )
      .join("");
  }

  function renderContractors() {
    const by = {};
    Object.entries(D.plan).forEach(([k, p]) => {
      const c = p.c || "—";
      if (!by[c]) by[c] = { plan: 0, linked: 0, open: 0, comp: 0 };
      by[c].plan += 1;
      if (D.csv[k]) by[c].linked += 1;
      if (p.e.includes("Abierto")) by[c].open += 1;
      if (p.t.some((t) => t[0] === "COMPLETADA")) by[c].comp += 1;
    });
    const rows = Object.entries(by).sort((a, b) => b[1].plan - a[1].plan || a[0].localeCompare(b[0], "es"));
    $("ctb").innerHTML = rows
      .map(([c, v]) => {
        const cov = v.plan ? Math.round((v.linked / v.plan) * 1000) / 10 : 0;
        return `<tr class="r ct-row" data-c="${c.replace(/"/g, "&quot;")}">
          <td>${c}</td>
          <td class="n">${v.plan}</td>
          <td class="n">${v.linked}</td>
          <td class="n">${v.open}</td>
          <td class="n">${v.comp}</td>
          <td class="n">${cov}%</td>
        </tr>`;
      })
      .join("");
  }

  function renderImpact() {
    const m = +$("mt").value;
    const rows = impactRows(m);
    $("impact-note").textContent = rows.length
      ? `Promedio de ${labelMet(D.mets[m])} antes vs desde el primer día con tarea COMPLETADA (${rows.length} nodos vinculados).`
      : `No hay nodos vinculados con tarea COMPLETADA y datos de ${labelMet(D.mets[m])}.`;

    if (!rows.length) {
      $("impact-kpis").innerHTML = "";
      $("itb").innerHTML = "";
      return;
    }

    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const dAvg = avg(rows.map((r) => r.dlt));
    const improved = rows.filter((r) => r.dlt > 0).length;
    $("impact-kpis").innerHTML = [
      ["Nodos", String(rows.length)],
      ["Δ promedio", (dAvg > 0 ? "+" : "") + fmt(dAvg)],
      ["Mejoraron", `${improved}/${rows.length}`],
    ]
      .map(([l, v]) => `<div class="kpi"><span class="l">${l}</span><span class="v">${v}</span></div>`)
      .join("");

    $("itb").innerHTML = rows
      .map(
        (r) => `<tr class="r impact-row" data-k="${r.k}">
          <td>${r.k}</td>
          <td>${D.days[r.day - 1]}</td>
          <td class="n">${fmt(r.pre)}</td>
          <td class="n">${fmt(r.post)}</td>
          <td class="n">${deltaBadge(r.dlt)}</td>
        </tr>`
      )
      .join("");
  }

  function resumen() {
    renderCoverage();
    renderContractors();
    renderImpact();
  }

  function all() {
    resumen();
    list();
    detail();
  }

  function setCovMode(mode) {
    covMode = mode;
    if (mode === "linked") $("lk").checked = false;
    list();
    renderCoverage();
    saveState();
  }

  function downloadUnmatched() {
    const rows = [
      ["Nodo", "Contratista", "Evento", "Tareas"].join(","),
      ...planOnlyKeys.map((k) => {
        const p = D.plan[k];
        const esc = (v) => {
          const s = String(v ?? "");
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        return [k, p.c, p.e.join("; "), tsum(p)].map(esc).join(",");
      }),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plan-sin-calidad.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function tableText() {
    const m = +$("mt").value;
    return ["Nodo\t" + D.days.join("\t") + "\tDelta", ...[...sel].sort().map((k) => {
      const dlt = delta(k, m);
      return `${k}\t${D.days.map((_, d) => V(k, d, m) ?? "").join("\t")}\t${dlt ?? ""}`;
    })].join("\n");
  }

  function downloadCsv() {
    if (!sel.size) {
      $("dl").textContent = "Sin selección";
      setTimeout(() => { $("dl").textContent = "Descargar CSV"; }, 1200);
      return;
    }
    const m = +$("mt").value;
    const escape = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      ["Nodo", ...D.days, "Delta", "Metrica"].map(escape).join(","),
      ...[...sel].sort().map((k) => {
        const dlt = delta(k, m);
        return [k, ...D.days.map((_, d) => V(k, d, m) ?? ""), dlt ?? "", D.mets[m]].map(escape).join(",");
      }),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nodos-${D.mets[m].replace(/[^\w.-]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // init controls
  opt("ct", "Todos los contratistas", uniq((p) => [p.c]));
  opt("es", "Estado del evento", uniq((p) => p.e));
  opt("ts", "Estado de tarea", uniq((p) => p.t.map((t) => t[0])));
  $("mt").innerHTML = D.mets.map((m, i) => `<option value="${i}"${i === qi ? " selected" : ""}>${labelMet(m)}</option>`).join("");
  syncMetricHeader();

  $("chips").innerHTML = [
    `${Object.keys(D.csv).length} nodos con calidad`,
    `${Object.keys(D.plan).length} nodos en el plan`,
    `${linkedKeys.length} vinculados en ambos`,
    `Días: ${D.days[0]} a ${D.days[ND - 1]}`,
  ]
    .map((t) => `<span class="b">${t}</span>`)
    .join("");

  if (sourceMeta.sample) {
    $("src").textContent = "Dataset de ejemplo embebido";
  } else {
    $("src").textContent = `Cargado: ${sourceMeta.csvName || "CSV"} + ${sourceMeta.pdfName || "PDF"} · ${sourceMeta.linked ?? "?"} vinculados`;
  }

  loadState();
  updateThemeButton();

  const setLoadMsg = (text, kind) => {
    const el = $("load-msg");
    el.textContent = text;
    el.classList.remove("ok", "err");
    if (kind) el.classList.add(kind);
  };

  $("load").onclick = async () => {
    const csvFile = $("f-csv").files && $("f-csv").files[0];
    const pdfFile = $("f-pdf").files && $("f-pdf").files[0];
    $("load").disabled = true;
    setLoadMsg("Procesando archivos…");
    try {
      const { data, meta } = await window.NodosImport.buildFromFiles(csvFile, pdfFile);
      await window.NodosImport.saveDataset(data, meta);
      setLoadMsg(`Listo: ${meta.qualityNodes} nodos calidad · ${meta.planNodes} plan · ${meta.linked} vinculados. Recargando…`, "ok");
      setTimeout(() => location.reload(), 400);
    } catch (err) {
      setLoadMsg(err.message || String(err), "err");
      $("load").disabled = false;
    }
  };

  $("reset-data").onclick = async () => {
    try {
      await window.NodosImport.clearDataset();
      setLoadMsg("Volviendo al dataset de ejemplo…", "ok");
      setTimeout(() => location.reload(), 300);
    } catch (err) {
      setLoadMsg(err.message || String(err), "err");
    }
  };

  $("tb").addEventListener("click", (e) => {
    const r = e.target.closest("tr[data-k]");
    if (!r) return;
    const k = r.dataset.k;
    if (sel.has(k)) sel.delete(k);
    else sel.add(k);
    all();
  });

  $("cov").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-cov]");
    if (!btn) return;
    setCovMode(btn.dataset.cov);
  });

  $("ctb").addEventListener("click", (e) => {
    const r = e.target.closest("tr[data-c]");
    if (!r) return;
    $("ct").value = r.dataset.c;
    covMode = "all";
    $("lk").checked = false;
    list();
    renderCoverage();
    saveState();
    $("lista-title").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("itb").addEventListener("click", (e) => {
    const r = e.target.closest("tr[data-k]");
    if (!r) return;
    const k = r.dataset.k;
    sel.add(k);
    setCovMode("linked");
    all();
    $("sel-title").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("pick-linked").onclick = () => {
    setCovMode("linked");
    linkedKeys.forEach((k) => sel.add(k));
    all();
  };

  $("dl-unmatched").onclick = downloadUnmatched;

  $("sa").onclick = () => {
    vis.forEach((k) => sel.add(k));
    all();
  };
  $("sc").onclick = () => {
    sel.clear();
    all();
  };

  ["q", "ct", "es", "ts", "lk", "only"].forEach((id) => {
    $(id).addEventListener("input", () => {
      if (id === "lk" && $("lk").checked) covMode = "all";
      list();
      renderCoverage();
    });
    $(id).addEventListener("change", () => {
      if (id === "lk" && $("lk").checked) covMode = "all";
      list();
      renderCoverage();
    });
  });
  $("mt").onchange = () => {
    list();
    detail();
    renderImpact();
  };

  document.querySelectorAll("button.th[data-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      if (sortKey === key) sortDir *= -1;
      else {
        sortKey = key;
        sortDir = key === "nodo" || key === "contratista" || key === "evento" ? 1 : -1;
      }
      list();
    });
  });

  $("cp").onclick = async () => {
    if (!sel.size) {
      $("cp").textContent = "Sin selección";
      setTimeout(() => { $("cp").textContent = "Copiar tabla"; }, 1200);
      return;
    }
    try {
      await navigator.clipboard.writeText(tableText());
      $("cp").textContent = "Copiado ✓";
    } catch {
      $("cp").textContent = "No se pudo copiar";
    }
    setTimeout(() => { $("cp").textContent = "Copiar tabla"; }, 1500);
  };

  $("dl").onclick = downloadCsv;

  $("theme").onclick = () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = cur === "dark" || (!cur && prefersDark);
    document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark");
    updateThemeButton();
    saveState();
  };

  all();
})();
