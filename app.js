// Nature Conservation Section — Field Log
// Talks to a Google Sheet (via Apps Script Web App) when SHEET_URL is set
// in config.js. Otherwise falls back to localStorage "demo mode" so the
// site still works immediately after you put it on GitHub Pages.

const DEMO_KEY = "ncs-field-log-demo";
const isConnected = typeof SHEET_URL === "string" && SHEET_URL.trim().length > 0;

const els = {
  form: document.getElementById("entry-form"),
  date: document.getElementById("field-date"),
  category: document.getElementById("field-category"),
  activity: document.getElementById("field-activity"),
  details: document.getElementById("field-details"),
  location: document.getElementById("field-location"),
  staff: document.getElementById("field-staff"),
  submitBtn: document.getElementById("submit-btn"),
  formNote: document.getElementById("form-note"),
  list: document.getElementById("entries-list"),
  search: document.getElementById("search-box"),
  filterCategory: document.getElementById("filter-category"),
  syncStatus: document.getElementById("sync-status"),
  syncLabel: document.querySelector("#sync-status .sync-label"),
  countPlanning: document.getElementById("count-planning"),
  countSpecies: document.getElementById("count-species"),
  countIcd: document.getElementById("count-icd"),
};

let entries = [];

// ---------- storage backends ----------

function loadDemoEntries() {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveDemoEntries(list) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(list));
}

async function fetchEntries() {
  if (!isConnected) {
    return loadDemoEntries();
  }
  const res = await fetch(SHEET_URL, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load entries from sheet");
  const data = await res.json();
  return Array.isArray(data) ? data : (data.entries || []);
}

async function saveEntry(entry) {
  if (!isConnected) {
    const list = loadDemoEntries();
    list.unshift(entry);
    saveDemoEntries(list);
    return entry;
  }
  // Use text/plain to avoid a CORS preflight against Apps Script.
  const res = await fetch(SHEET_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error("Failed to save entry to sheet");
  return entry;
}

// ---------- rendering ----------

function setSyncStatus(state, label) {
  els.syncStatus.dataset.state = state;
  els.syncLabel.textContent = label;
}

function updateCounts(list) {
  const counts = {
    "Protected Areas Planning & Implementation": 0,
    "Species Conservation": 0,
    "Integrated Conservation & Development": 0,
  };
  list.forEach((e) => {
    if (counts[e.category] !== undefined) counts[e.category]++;
  });
  els.countPlanning.textContent = counts["Protected Areas Planning & Implementation"];
  els.countSpecies.textContent = counts["Species Conservation"];
  els.countIcd.textContent = counts["Integrated Conservation & Development"];
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function shortTag(category) {
  if (category === "Protected Areas Planning & Implementation") return "Planning";
  if (category === "Species Conservation") return "Species";
  if (category === "Integrated Conservation & Development") return "Integrated";
  return category || "—";
}

function renderList() {
  const q = els.search.value.trim().toLowerCase();
  const catFilter = els.filterCategory.value;

  const filtered = entries.filter((e) => {
    if (catFilter && e.category !== catFilter) return false;
    if (!q) return true;
    const hay = [e.activity, e.details, e.location, e.staff].join(" ").toLowerCase();
    return hay.includes(q);
  });

  updateCounts(entries);

  if (filtered.length === 0) {
    els.list.innerHTML = `<p class="empty-state">${entries.length === 0
      ? "No entries yet. Add the first one on the left."
      : "No entries match your search."}</p>`;
    return;
  }

  els.list.innerHTML = filtered
    .map((e) => `
      <article class="entry-card" data-category="${escapeHtml(e.category)}">
        <div class="entry-top">
          <span class="entry-date">${formatDate(e.date)}</span>
          <span class="entry-tag">${escapeHtml(shortTag(e.category))}</span>
        </div>
        <p class="entry-activity">${escapeHtml(e.activity)}</p>
        ${e.details ? `<p class="entry-details">${escapeHtml(e.details)}</p>` : ""}
        <div class="entry-meta">
          ${e.location ? `<span>📍 ${escapeHtml(e.location)}</span>` : ""}
          ${e.staff ? `<span>Recorded by ${escapeHtml(e.staff)}</span>` : ""}
        </div>
      </article>
    `)
    .join("");
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sortEntries(list) {
  return [...list].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b._ts || 0) - (a._ts || 0));
}

// ---------- init & events ----------

async function init() {
  els.date.valueAsDate = new Date();

  if (isConnected) {
    setSyncStatus("demo", "Connecting to Google Sheet…");
  } else {
    setSyncStatus("demo", "Demo mode — connect a sheet to save permanently");
  }

  try {
    const fetched = await fetchEntries();
    entries = sortEntries(fetched);
    if (isConnected) setSyncStatus("connected", "Synced with Google Sheet");
    renderList();
  } catch (err) {
    console.error(err);
    setSyncStatus("error", "Couldn't reach the sheet — check SHEET_URL");
    entries = sortEntries(loadDemoEntries());
    renderList();
  }
}

els.form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  els.submitBtn.disabled = true;
  els.formNote.dataset.state = "";
  els.formNote.textContent = "Saving…";

  const entry = {
    date: els.date.value,
    category: els.category.value,
    activity: els.activity.value.trim(),
    details: els.details.value.trim(),
    location: els.location.value.trim(),
    staff: els.staff.value.trim(),
    _ts: Date.now(),
  };

  try {
    await saveEntry(entry);
    entries = sortEntries([entry, ...entries]);
    renderList();
    els.form.reset();
    els.date.valueAsDate = new Date();
    els.formNote.textContent = isConnected ? "Saved to the shared sheet." : "Saved (demo mode, this browser only).";
  } catch (err) {
    console.error(err);
    els.formNote.dataset.state = "error";
    els.formNote.textContent = "Couldn't save — check your connection and try again.";
  } finally {
    els.submitBtn.disabled = false;
  }
});

els.search.addEventListener("input", renderList);
els.filterCategory.addEventListener("change", renderList);

init();
