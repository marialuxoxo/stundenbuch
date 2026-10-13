(() => {
  const $ = (s) => document.querySelector(s);
  const H = 3600000;
  const STORE_KEY = "stundenbuch.v1";
  const COLORS = ["#2f6fdb", "#e0663a", "#1f9d6b", "#9b4fd1", "#d4a017", "#d93f7a", "#178f9e", "#6b7a33"];
  const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const DAYS_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

  // ---------- Speicher (localStorage auf diesem Gerät) ----------
  // Aufbau: { version, projects: {id: {...}}, entries: {id: {...}}, timer: {...}, lastBackup }
  let data = load();

  function emptyData() { return { version: 1, projects: {}, entries: {}, timer: { running: false }, lastBackup: null }; }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return emptyData();
      const d = JSON.parse(raw);
      return { ...emptyData(), ...d, projects: d.projects || {}, entries: d.entries || {}, timer: d.timer || { running: false } };
    } catch (e) { return emptyData(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); return true; }
    catch (e) { toast("Speichern fehlgeschlagen. Ist der Speicher des Browsers voll?"); return false; }
  }
  function commit() { save(); renderAll(); }

  // Änderungen aus anderen Tabs übernehmen
  window.addEventListener("storage", (e) => { if (e.key === STORE_KEY) { data = load(); renderAll(); } });

  // Browser bitten, die Daten nicht automatisch zu löschen
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Ansicht ----------
  let period = { kind: "week", anchor: new Date() };
  let showArchived = false;
  try { const k = localStorage.getItem("stundenbuch.kind"); if (k) period.kind = k; } catch (e) {}

  // ---------- Helfer ----------
  const pad = (n) => String(n).padStart(2, "0");
  const fmtHM = (ms) => { const m = Math.round(ms / 60000); return Math.floor(m / 60) + ":" + pad(m % 60); };
  const fmtHMS = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 3600) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60); };
  const fmtDec = (ms) => (ms / H).toFixed(2).replace(".", ",");
  const fmtEur = (v) => v.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const fmtClock = (t) => { const d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); };
  const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const weekStart = (d) => { const x = dayStart(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); };
  const isoWeek = (d) => {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return Math.ceil(((x - y0) / 86400000 + 1) / 7);
  };
  const dateKey = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const fmtDate = (d) => pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const proj = (id) => data.projects[id] || { name: "Ohne Projekt", color: "#8a94a6", rate: null };
  const projectCount = () => Object.keys(data.projects).length;

  function range() {
    const a = period.anchor;
    if (period.kind === "day") { const f = dayStart(a); return [f, addDays(f, 1)]; }
    if (period.kind === "week") { const f = weekStart(a); return [f, addDays(f, 7)]; }
    const f = new Date(a.getFullYear(), a.getMonth(), 1); return [f, new Date(a.getFullYear(), a.getMonth() + 1, 1)];
  }
  function periodEntries() {
    const [f, t] = range(); const a = f.getTime(), b = t.getTime();
    return Object.entries(data.entries)
      .map(([id, e]) => ({ id, ...e }))
      .filter((e) => typeof e.start === "number" && typeof e.end === "number" && e.start >= a && e.start < b)
      .sort((x, y) => y.start - x.start);
  }
  function periodLabel() {
    const [f, t] = range();
    if (period.kind === "day") return DAYS_LONG[f.getDay()] + ", " + fmtDate(f);
    if (period.kind === "week") return "KW " + isoWeek(f) + " · " + pad(f.getDate()) + "." + pad(f.getMonth() + 1) + ". – " + fmtDate(addDays(t, -1));
    return MONTHS[f.getMonth()] + " " + f.getFullYear();
  }

  let toastT = null;
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 2600); }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- Rendering ----------
  function activeProjects() { return Object.entries(data.projects).filter(([, p]) => !p.archived).sort((a, b) => a[1].name.localeCompare(b[1].name, "de")); }

  function fillProjectSelect(sel, current) {
    const list = activeProjects();
    if (current && data.projects[current] && data.projects[current].archived) list.push([current, data.projects[current]]);
    sel.innerHTML = list.length ? list.map(([id, p]) => `<option value="${esc(id)}">${esc(p.name)}</option>`).join("") : `<option value="">Noch kein Projekt</option>`;
    if (current && list.some(([id]) => id === current)) sel.value = current;
  }

  function lastProject() { try { return localStorage.getItem("stundenbuch.lastProject"); } catch (e) { return null; } }
  function rememberProject(id) { try { localStorage.setItem("stundenbuch.lastProject", id); } catch (e) {} }

  function renderClock() {
    const timer = data.timer;
    const sel = $("#t-project");
    const keep = timer.running ? timer.projectId : (sel.value || lastProject());
    fillProjectSelect(sel, keep);
    $("#clock").classList.toggle("running", !!timer.running);
    $("#t-toggle-text").textContent = timer.running ? "Stopp" : "Start";
    $("#t-toggle").disabled = !timer.running && projectCount() === 0;
    const meta = $("#t-meta");
    if (timer.running) {
      if (document.activeElement !== $("#t-note")) $("#t-note").value = timer.note || "";
      meta.hidden = false;
      meta.innerHTML = `<span>Läuft seit <span class="num">${fmtClock(timer.start)}</span> Uhr${dateKey(new Date(timer.start)) !== dateKey(new Date()) ? " (" + fmtDate(new Date(timer.start)) + ")" : ""}</span><button class="linklike" type="button" id="t-discard">Verwerfen</button>`;
      $("#t-discard").onclick = discardTimer;
    } else { meta.hidden = true; }
    tick();
  }
  function tick() {
    const t = data.timer;
    $("#t-display").textContent = t.running ? fmtHMS(Date.now() - t.start) : "0:00:00";
    document.title = t.running ? "● " + fmtHMS(Date.now() - t.start) + " · Stundenbuch" : "Stundenbuch";
  }
  setInterval(() => { if (data.timer.running) tick(); }, 1000);

  function renderDays(entries) {
    $("#p-label").textContent = periodLabel();
    document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === period.kind)));
    const box = $("#days");
    if (projectCount() === 0) {
      box.innerHTML = `<div class="empty-state"><strong>Leg zuerst ein Projekt an</strong><span>Unter „Projekte“ auf „+ Projekt“ tippen. Danach kannst du oben die Uhr starten oder Zeiten nachtragen.</span></div>`;
      return;
    }
    if (!entries.length) {
      box.innerHTML = `<div class="empty-state"><strong>Keine Einträge in diesem Zeitraum</strong><span>Starte oben die Uhr, wenn du loslegst, oder trag eine Zeit nach, die du schon gearbeitet hast.</span></div>`;
      return;
    }
    const groups = new Map();
    for (const e of entries) { const k = dateKey(new Date(e.start)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
    let html = "";
    for (const [, list] of groups) {
      const d = dayStart(new Date(list[0].start));
      const total = list.reduce((s, e) => s + (e.end - e.start), 0);
      const d0 = d.getTime();
      let blocks = "";
      for (const e of list) {
        const a = Math.max(0, (e.start - d0) / (24 * H)), b = Math.min(1, (e.end - d0) / (24 * H));
        blocks += `<span class="blk" style="left:${(a * 100).toFixed(3)}%;width:${((b - a) * 100).toFixed(3)}%;background:${esc(proj(e.projectId).color)}" title="${esc(proj(e.projectId).name)} ${fmtClock(e.start)}–${fmtClock(e.end)}"></span>`;
      }
      const ticks = [6, 12, 18].map((h) => `<span class="tick" style="left:${(h / 24) * 100}%"></span>`).join("");
      const rows = list.slice().sort((x, y) => x.start - y.start).map((e) => {
        const p = proj(e.projectId);
        const overnight = dateKey(new Date(e.end - 1)) !== dateKey(new Date(e.start));
        return `<div class="entry">
          <span class="time">${fmtClock(e.start)}–${fmtClock(e.end)}${overnight ? " (+1)" : ""}</span>
          <span class="what"><span class="p"><span class="swatch" style="background:${esc(p.color)}"></span>${esc(p.name)}</span>${e.note ? ` <span class="n">· ${esc(e.note)}</span>` : ""}</span>
          <span class="dur">${fmtHM(e.end - e.start)}</span>
          <button class="btn ghost edit" type="button" data-edit="${esc(e.id)}" aria-label="Eintrag bearbeiten">Bearbeiten</button>
        </div>`;
      }).join("");
      html += `<div class="day">
        <div class="day-head"><h3>${DAYS_LONG[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.</h3><span class="num"><strong>${fmtHM(total)}</strong> h</span></div>
        <div class="strip">${ticks}${blocks}</div>
        <div class="strip-scale"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
        ${rows}
      </div>`;
    }
    box.innerHTML = html;
  }

  function renderSummary(entries) {
    const total = entries.reduce((s, e) => s + (e.end - e.start), 0);
    $("#s-total").textContent = fmtHM(total);
    $("#s-dec").textContent = fmtDec(total);
    const by = new Map();
    for (const e of entries) by.set(e.projectId, (by.get(e.projectId) || 0) + (e.end - e.start));
    let money = 0, anyRate = false;
    const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([id, ms]) => {
      const p = proj(id);
      let m = "";
      if (p.rate) { anyRate = true; const v = (ms / H) * p.rate; money += v; m = " · " + fmtEur(v); }
      const pct = total ? (ms / total) * 100 : 0;
      return `<div class="prow"><div class="prow-top"><span class="nm"><span class="swatch" style="background:${esc(p.color)}"></span>${esc(p.name)}</span><span class="v">${fmtHM(ms)} h · ${fmtDec(ms)}${m}</span></div><div class="bar"><span style="width:${pct.toFixed(2)}%;background:${esc(p.color)}"></span></div></div>`;
    });
    $("#s-projects").innerHTML = rows.join("") || `<span class="muted">Noch nichts erfasst in diesem Zeitraum.</span>`;
    $("#s-money").textContent = anyRate ? "≈ " + fmtEur(money) : "";

    // Tages-Säulen für Woche und Monat
    const chart = $("#s-chart");
    if (period.kind === "day" || !entries.length) { chart.innerHTML = ""; return; }
    const [f, t] = range();
    const days = []; for (let d = new Date(f); d < t; d = addDays(d, 1)) days.push(new Date(d));
    const per = days.map((d) => { const k = dateKey(d); const m = new Map(); for (const e of entries) if (dateKey(new Date(e.start)) === k) m.set(e.projectId, (m.get(e.projectId) || 0) + (e.end - e.start)); return m; });
    const max = Math.max(H, ...per.map((m) => [...m.values()].reduce((a, b) => a + b, 0)));
    const maxH = Math.ceil(max / H);
    const cols = per.map((m, i) => {
      const sum = [...m.values()].reduce((a, b) => a + b, 0);
      const segs = [...m.entries()].map(([id, ms]) => `<span class="seg-b" style="height:${((ms / (maxH * H)) * 100).toFixed(2)}%;background:${esc(proj(id).color)}"></span>`).join("");
      return `<div class="c${sum ? "" : " empty"}" title="${DAYS[days[i].getDay()]} ${pad(days[i].getDate())}.${pad(days[i].getMonth() + 1)}.: ${fmtHM(sum)} h">${segs}</div>`;
    }).join("");
    const scale = days.map((d, i) => {
      const show = period.kind === "week" || i === 0 || (d.getDate() % 5 === 0 && d.getDate() < 30);
      return `<span>${show ? (period.kind === "week" ? DAYS[d.getDay()] : d.getDate()) : ""}</span>`;
    }).join("");
    chart.innerHTML = `<span class="chart-max">${maxH} h</span><div class="cols">${cols}</div><div class="cols-scale">${scale}</div>`;
  }

  function renderProjects() {
    const all = Object.entries(data.projects).sort((a, b) => (!!a[1].archived - !!b[1].archived) || a[1].name.localeCompare(b[1].name, "de"));
    const archivedCount = all.filter(([, p]) => p.archived).length;
    const list = all.filter(([, p]) => showArchived || !p.archived);
    $("#plist").innerHTML = list.length ? list.map(([id, p]) => `<div class="pitem${p.archived ? " archived" : ""}">
        <span class="swatch" style="background:${esc(p.color)}"></span>
        <span class="nm">${esc(p.name)}</span>
        ${p.rate ? `<span class="rate">${fmtEur(p.rate)}/h</span>` : ""}
        <button class="btn ghost" type="button" data-pedit="${esc(id)}">Bearbeiten</button>
      </div>`).join("")
      : `<div class="empty-state"><strong>Noch keine Projekte</strong><span>Leg für jeden Auftrag oder Kunden ein Projekt an, optional mit Stundensatz.</span></div>`;
    const sa = $("#show-archived");
    sa.hidden = archivedCount === 0;
    sa.textContent = showArchived ? "Archivierte ausblenden" : `${archivedCount} archivierte anzeigen`;
  }

  function renderBackupInfo() {
    const n = Object.keys(data.entries).length;
    const lb = data.lastBackup ? "Letztes Backup: " + fmtDate(new Date(data.lastBackup)) + ", " + fmtClock(data.lastBackup) + " Uhr." : "Noch kein Backup gespeichert.";
    $("#backup-info").textContent = n + (n === 1 ? " Eintrag" : " Einträge") + " und " + projectCount() + (projectCount() === 1 ? " Projekt" : " Projekte") + " auf diesem Gerät. " + lb;
  }

  function renderAll() {
    const entries = periodEntries();
    renderClock(); renderDays(entries); renderSummary(entries); renderProjects(); renderBackupInfo();
  }

  // ---------- Stempeluhr ----------
  function startTimer() {
    const pid = $("#t-project").value;
    if (!pid) { toast("Wähle zuerst ein Projekt."); return; }
    data.timer = { running: true, projectId: pid, note: $("#t-note").value.trim(), start: Date.now() };
    rememberProject(pid);
    commit();
  }
  function stopTimer() {
    const t = data.timer;
    const end = Date.now();
    const note = $("#t-note").value.trim();
    const pid = $("#t-project").value || t.projectId;
    data.timer = { running: false };
    $("#t-note").value = "";
    if (end - t.start < 60000) toast("Weniger als eine Minute, nicht gespeichert.");
    else {
      data.entries[uid()] = { projectId: pid, note, start: t.start, end, createdAt: end };
      toast(fmtHM(end - t.start) + " h gespeichert");
    }
    commit();
  }
  async function discardTimer() {
    const ok = await confirmDlg("Laufende Zeit verwerfen?", "Die Zeit seit " + fmtClock(data.timer.start) + " Uhr wird nicht gespeichert.", "Verwerfen");
    if (!ok) return;
    data.timer = { running: false }; $("#t-note").value = ""; commit();
  }
  // Notiz und Projekt am laufenden Timer mitspeichern
  function syncRunning() {
    if (!data.timer.running) return;
    data.timer = { ...data.timer, note: $("#t-note").value.trim(), projectId: $("#t-project").value };
    save();
  }

  // ---------- Dialoge ----------
  function closeOn(dlg) { dlg.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => dlg.close())); }
  ["#dlg-entry", "#dlg-project", "#dlg-confirm"].forEach((s) => closeOn($(s)));

  function confirmDlg(title, text, okLabel) {
    return new Promise((res) => {
      const d = $("#dlg-confirm");
      $("#dc-title").textContent = title; $("#dc-text").textContent = text; $("#dc-ok").textContent = okLabel || "Ja";
      let result = false;
      $("#dc-ok").onclick = () => { result = true; d.close(); };
      d.onclose = () => res(result);
      d.showModal();
    });
  }

  let editingEntry = null;
  function openEntry(e) {
    if (!projectCount()) { toast("Leg zuerst ein Projekt an."); return; }
    editingEntry = e || null;
    $("#fe-title").textContent = e ? "Eintrag bearbeiten" : "Zeit nachtragen";
    $("#fe-delete").hidden = !e;
    fillProjectSelect($("#fe-project"), e ? e.projectId : ($("#t-project").value || lastProject()));
    $("#fe-note").value = e ? e.note || "" : "";
    const now = new Date();
    const s = e ? new Date(e.start) : new Date(now.getTime() - H);
    const en = e ? new Date(e.end) : now;
    if (!e) { s.setMinutes(Math.floor(s.getMinutes() / 15) * 15); en.setMinutes(Math.floor(en.getMinutes() / 15) * 15); }
    $("#fe-date").value = dateKey(s);
    $("#fe-from").value = fmtClock(s);
    $("#fe-to").value = fmtClock(en);
    $("#fe-err").textContent = "";
    updateEntryDur();
    $("#dlg-entry").showModal();
  }
  function readEntryForm() {
    const date = $("#fe-date").value, from = $("#fe-from").value, to = $("#fe-to").value;
    if (!date || !from || !to) return null;
    const [y, mo, d] = date.split("-").map(Number);
    const [fh, fm] = from.split(":").map(Number), [th, tm] = to.split(":").map(Number);
    const start = new Date(y, mo - 1, d, fh, fm).getTime();
    let end = new Date(y, mo - 1, d, th, tm).getTime();
    if (end <= start) end += 24 * H; // über Mitternacht
    return { start, end };
  }
  function updateEntryDur() {
    const r = readEntryForm();
    $("#fe-dur").textContent = r ? "Dauer: " + fmtHM(r.end - r.start) + " h (" + fmtDec(r.end - r.start) + ")" + (dateKey(new Date(r.end - 1)) !== dateKey(new Date(r.start)) ? " · endet am Folgetag" : "") : "";
  }
  ["#fe-date", "#fe-from", "#fe-to"].forEach((s) => $(s).addEventListener("input", updateEntryDur));

  $("#f-entry").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const r = readEntryForm();
    const pid = $("#fe-project").value;
    if (!r || !pid) { $("#fe-err").textContent = "Bitte Projekt, Datum, Von und Bis ausfüllen."; return; }
    if (r.end - r.start > 16 * H) { $("#fe-err").textContent = "Das sind über 16 Stunden. Prüfe Von und Bis."; return; }
    const id = editingEntry ? editingEntry.id : uid();
    data.entries[id] = { projectId: pid, note: $("#fe-note").value.trim(), start: r.start, end: r.end, createdAt: editingEntry ? editingEntry.createdAt || Date.now() : Date.now() };
    $("#dlg-entry").close();
    toast(editingEntry ? "Eintrag geändert" : "Eintrag gespeichert");
    const [f, t] = range();
    if (r.start < f.getTime() || r.start >= t.getTime()) period.anchor = new Date(r.start);
    commit();
  });
  $("#fe-delete").onclick = async () => {
    const e = editingEntry; if (!e) return;
    $("#dlg-entry").close();
    const ok = await confirmDlg("Eintrag löschen?", proj(e.projectId).name + ", " + fmtDate(new Date(e.start)) + ", " + fmtClock(e.start) + "–" + fmtClock(e.end), "Löschen");
    if (!ok) return;
    delete data.entries[e.id]; commit(); toast("Eintrag gelöscht");
  };

  let editingProject = null;
  function openProject(id) {
    editingProject = id || null;
    const p = id ? data.projects[id] : null;
    $("#fp-title").textContent = p ? "Projekt bearbeiten" : "Neues Projekt";
    $("#fp-name").value = p ? p.name : "";
    $("#fp-rate").value = p && p.rate ? String(p.rate).replace(".", ",") : "";
    const used = new Set(Object.values(data.projects).filter((x) => !x.archived).map((x) => x.color));
    const color = p ? p.color : (COLORS.find((c) => !used.has(c)) || COLORS[projectCount() % COLORS.length]);
    $("#fp-colors").innerHTML = COLORS.map((c, i) => `<label><input type="radio" name="fpc" id="fpc-${i}" value="${c}" ${c === color ? "checked" : ""} aria-label="Farbe ${i + 1}"><span style="background:${c}"></span></label>`).join("");
    $("#fp-archive").hidden = !p;
    $("#fp-archive").textContent = p && p.archived ? "Wiederherstellen" : "Archivieren";
    $("#fp-err").textContent = "";
    $("#dlg-project").showModal();
    $("#fp-name").focus();
  }
  $("#f-project").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const name = $("#fp-name").value.trim();
    if (!name) { $("#fp-err").textContent = "Gib dem Projekt einen Namen."; return; }
    const rateRaw = $("#fp-rate").value.trim().replace(/\s|€/g, "").replace(",", ".");
    const rate = rateRaw ? Number(rateRaw) : null;
    if (rateRaw && !(rate >= 0)) { $("#fp-err").textContent = "Der Stundensatz muss eine Zahl sein, z. B. 65 oder 72,50."; return; }
    const color = (document.querySelector('input[name="fpc"]:checked') || {}).value || COLORS[0];
    const old = editingProject ? data.projects[editingProject] : null;
    const id = editingProject || uid();
    data.projects[id] = { name, rate, color, archived: old ? !!old.archived : false, createdAt: old ? old.createdAt || Date.now() : Date.now() };
    if (!old && !data.timer.running) { rememberProject(id); $("#t-project").value = id; }
    $("#dlg-project").close();
    commit();
    if (!old) $("#t-project").value = id;
    toast(old ? "Projekt gespeichert" : "Projekt angelegt");
  });
  $("#fp-archive").onclick = () => {
    const p = data.projects[editingProject]; if (!p) return;
    p.archived = !p.archived;
    $("#dlg-project").close(); commit();
    toast(p.archived ? "Projekt archiviert" : "Projekt wiederhergestellt");
  };

  // ---------- Export & Backup ----------
  function exportCsv() {
    const entries = periodEntries();
    if (!entries.length) { toast("Keine Einträge in diesem Zeitraum."); return; }
    const q = (s) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
    const lines = [["Datum", "Von", "Bis", "Projekt", "Tätigkeit", "Dauer (h:mm)", "Dauer (h)", "Stundensatz", "Betrag"].join(";")];
    for (const e of entries.slice().sort((a, b) => a.start - b.start)) {
      const p = proj(e.projectId), ms = e.end - e.start;
      lines.push([fmtDate(new Date(e.start)), fmtClock(e.start), fmtClock(e.end), q(p.name), q(e.note), fmtHM(ms), fmtDec(ms),
        p.rate ? String(p.rate).replace(".", ",") : "", p.rate ? ((ms / H) * p.rate).toFixed(2).replace(".", ",") : ""].join(";"));
    }
    const [f, t] = range();
    download("stunden_" + dateKey(f) + "_bis_" + dateKey(addDays(t, -1)) + ".csv", "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
  }

  function exportBackup() {
    data.lastBackup = Date.now();
    save();
    const { projects, entries, version } = data;
    download("stundenbuch-backup_" + dateKey(new Date()) + ".json", JSON.stringify({ app: "stundenbuch", version, exportedAt: new Date().toISOString(), projects, entries }, null, 2), "application/json");
    renderBackupInfo();
  }

  async function importBackup(file) {
    let b;
    try { b = JSON.parse(await file.text()); } catch (e) { toast("Die Datei ist kein gültiges Backup."); return; }
    if (!b || b.app !== "stundenbuch" || typeof b.projects !== "object" || typeof b.entries !== "object") { toast("Die Datei ist kein Stundenbuch-Backup."); return; }
    const np = Object.keys(b.projects).length, ne = Object.keys(b.entries).length;
    const newE = Object.keys(b.entries).filter((id) => !data.entries[id]).length;
    const ok = await confirmDlg("Backup laden?", `Das Backup enthält ${np} Projekte und ${ne} Einträge, davon ${newE} neu auf diesem Gerät. Es wird mit deinen vorhandenen Daten zusammengeführt. Gleiche Einträge werden durch die Version aus dem Backup ersetzt.`, "Laden");
    if (!ok) return;
    Object.assign(data.projects, b.projects);
    Object.assign(data.entries, b.entries);
    commit();
    toast("Backup geladen");
  }

  // ---------- Events ----------
  $("#t-toggle").onclick = () => (data.timer.running ? stopTimer() : startTimer());
  $("#t-note").addEventListener("input", syncRunning);
  $("#t-note").addEventListener("keydown", (e) => { if (e.key === "Enter" && !data.timer.running) startTimer(); });
  $("#t-project").addEventListener("change", () => { syncRunning(); rememberProject($("#t-project").value); });
  $("#t-manual").onclick = () => openEntry(null);
  $("#p-add").onclick = () => openProject(null);
  $("#export").onclick = exportCsv;
  $("#backup-export").onclick = exportBackup;
  $("#backup-import").onclick = () => $("#backup-file").click();
  $("#backup-file").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importBackup(f); });
  $("#show-archived").onclick = () => { showArchived = !showArchived; renderProjects(); };
  document.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => {
    period.kind = b.dataset.kind; try { localStorage.setItem("stundenbuch.kind", period.kind); } catch (e) {}
    renderAll();
  }));
  const step = (dir) => {
    const a = new Date(period.anchor);
    if (period.kind === "day") a.setDate(a.getDate() + dir);
    else if (period.kind === "week") a.setDate(a.getDate() + 7 * dir);
    else { a.setDate(1); a.setMonth(a.getMonth() + dir); }
    period.anchor = a; renderAll();
  };
  $("#p-prev").onclick = () => step(-1);
  $("#p-next").onclick = () => step(1);
  $("#p-now").onclick = () => { period.anchor = new Date(); renderAll(); };
  $("#days").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-edit]"); if (!b) return;
    const e = data.entries[b.dataset.edit]; if (e) openEntry({ id: b.dataset.edit, ...e });
  });
  $("#plist").addEventListener("click", (ev) => { const b = ev.target.closest("[data-pedit]"); if (b) openProject(b.dataset.pedit); });

  // Beim Zurückkehren in die App aktualisieren (z. B. nach Mitternacht)
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { data = load(); renderAll(); } });

  // ---------- Installation & Offline ----------
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; $("#install").hidden = false; });
  $("#install").onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $("#install").hidden = true; };
  window.addEventListener("appinstalled", () => { $("#install").hidden = true; });
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  // ---------- Start ----------
  const now = new Date();
  $("#today-label").textContent = DAYS_LONG[now.getDay()] + ", " + fmtDate(now) + " · KW " + isoWeek(now);
  renderAll();
})();
