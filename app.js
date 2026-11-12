const STORAGE_RANKS = "ma-compounders-user-ranks-v1";
const STORAGE_DEVS = "ma-compounders-user-devs-v1";

const PILLAR_LABELS = {
  deal_machine: "Deal machine",
  multiple_arbitrage: "Multiple arb",
  one_plus_one: "1+1 > 2",
  runway: "Runway",
  capital_allocation: "Capital alloc.",
  incentives_decentralization: "Incentives",
  cash_quality: "Cash quality",
};

const state = {
  framework: null,
  companies: [],
  tab: "framework",
  search: "",
  sort: "rank",
  dragId: null,
  latestAdded: null,
  segment: "all",
};

async function loadData() {
  const [framework, companyData] = await Promise.all([
    fetch("./data/framework.json").then((r) => r.json()),
    fetch("./data/companies.json").then((r) => r.json()),
  ]);
  state.framework = framework;
  const userRanks = readJson(STORAGE_RANKS, {});
  const userDevs = readJson(STORAGE_DEVS, {});
  state.companies = companyData.companies.map((c) => {
    const weighted = weightedScore(c.scores, framework.pillars);
    return {
      ...c,
      weighted,
      userRank: userRanks[c.id] ?? c.rank,
      userDevelopments: userDevs[c.id] ?? [],
    };
  });
  state.latestAdded = state.companies.map((c) => c.added || "").sort().pop() || null;
  normalizeUserRanks();
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function weightedScore(scores, pillars) {
  const totalWeight = pillars.reduce((s, p) => s + p.weight, 0);
  const sum = pillars.reduce((s, p) => s + (scores[p.id] ?? 0) * p.weight, 0);
  return Math.round((sum / (totalWeight * 10)) * 1000) / 10;
}

function tierFor(score, tiers) {
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  return sorted.find((t) => score >= t.min) ?? sorted[sorted.length - 1];
}

function isNew(c) {
  return Boolean(c.added) && c.added === state.latestAdded;
}

function tierClass(label) {
  const l = label.toLowerCase();
  if (l.includes("elite")) return "elite";
  if (l.includes("strong")) return "strong";
  if (l.includes("watch")) return "watch";
  return "spec";
}

function normalizeUserRanks() {
  const ordered = [...state.companies].sort((a, b) => a.userRank - b.userRank || a.name.localeCompare(b.name));
  ordered.forEach((c, i) => {
    c.userRank = i + 1;
  });
  persistRanks();
}

function persistRanks() {
  const map = {};
  state.companies.forEach((c) => {
    map[c.id] = c.userRank;
  });
  writeJson(STORAGE_RANKS, map);
}

function persistDevs() {
  const map = {};
  state.companies.forEach((c) => {
    if (c.userDevelopments?.length) map[c.id] = c.userDevelopments;
  });
  writeJson(STORAGE_DEVS, map);
}

function countries() {
  return [...new Set(state.companies.map((c) => c.country))].sort();
}

function filteredCompanies(country = null) {
  const q = state.search.trim().toLowerCase();
  let list = state.companies.filter((c) => {
    if (country && c.country !== country) return false;
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.ticker.toLowerCase().includes(q) ||
      c.industry.toLowerCase().includes(q) ||
      c.ibkr.toLowerCase().includes(q) ||
      (c.ceo || "").toLowerCase().includes(q)
    );
  });
  if (state.sort === "rank") list.sort((a, b) => a.userRank - b.userRank);
  else if (state.sort === "score") list.sort((a, b) => b.weighted - a.weighted || a.userRank - b.userRank);
  else if (state.sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
  else if (state.sort === "ticker") list.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return list;
}

function groupByIndustry(list) {
  const map = new Map();
  list.forEach((c) => {
    if (!map.has(c.industry)) map.set(c.industry, []);
    map.get(c.industry).push(c);
  });
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderTabs() {
  const tabs = document.getElementById("main-tabs");
  const items = [
    { id: "framework", label: "What we look for" },
    { id: "rankings", label: "Rankings" },
    ...(state.companies.some(isBank) ? [{ id: "banks", label: "Banks" }] : []),
    ...countries().map((c) => ({ id: `country:${c}`, label: c })),
  ];
  tabs.innerHTML = items
    .map(
      (t) =>
        `<button type="button" class="tab" role="tab" data-tab="${t.id}" aria-selected="${state.tab === t.id}">${escapeHtml(t.label)}</button>`
    )
    .join("");
  tabs.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      render();
    });
  });
}

function render() {
  renderTabs();
  const app = document.getElementById("app");
  if (state.tab === "framework") app.innerHTML = renderFramework();
  else if (state.tab === "rankings") app.innerHTML = renderRankings();
  else if (state.tab === "banks") app.innerHTML = renderBanks();
  else if (state.tab.startsWith("country:")) {
    const country = state.tab.slice("country:".length);
    app.innerHTML = renderCountry(country);
  }
  bindTableEvents();
}

function renderFramework() {
  const f = state.framework;
  return `
    <section class="panel">
      <div class="framework-hero">
        <h2>${escapeHtml(f.title)}</h2>
        <p>${escapeHtml(f.subtitle)}</p>
        <div class="sources">${f.sources.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("")}</div>
      </div>
      <div class="pillar-grid">
        ${f.pillars
          .map(
            (p) => `
          <article class="pillar">
            <div class="pillar-top">
              <h3>${escapeHtml(p.name)}</h3>
              <span class="weight">weight ${p.weight}</span>
            </div>
            <h4>Look for</h4>
            <ul>${p.lookFor.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
            <h4>Red flags</h4>
            <ul>${p.redFlags.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
          </article>`
          )
          .join("")}
      </div>
      <div class="tier-row">
        <h3>Score tiers</h3>
        <p class="muted" style="margin-top:-0.35rem;margin-bottom:0.85rem">${escapeHtml(f.scoreGuide.description)}</p>
        <div class="tier-list">
          ${f.scoreGuide.tiers
            .map(
              (t) => `
            <div class="tier">
              <strong class="tier-badge ${tierClass(t.label)}">${escapeHtml(t.label)}</strong>
              <span>≥ ${t.min}: ${escapeHtml(t.note)}</span>
            </div>`
            )
            .join("")}
        </div>
      </div>
      <div class="track-box">
        <h3>What to track over time</h3>
        <ul>${f.trackingFields.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      </div>
    </section>`;
}

function isBank(c) {
  return c.segment === "banks";
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "proven") return "elite";
  if (s === "steady") return "watch";
  return "spec";
}

function renderBanks() {
  const lens = state.framework.bankLens;
  const list = filteredCompanies()
    .filter(isBank)
    .sort((a, b) => b.weighted - a.weighted || a.name.localeCompare(b.name));
  return `
    <section class="panel">
      ${
        lens
          ? `
      <div class="framework-hero">
        <h2>${escapeHtml(lens.title)}</h2>
        <p>${escapeHtml(lens.subtitle)}</p>
      </div>
      <div class="pillar-grid">
        <article class="pillar">
          <h4>Look for</h4>
          <ul>${lens.lookFor.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
        </article>
        <article class="pillar">
          <h4>Red flags</h4>
          <ul>${lens.redFlags.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
        </article>
        <article class="pillar">
          <h4>Status labels</h4>
          <ul class="status-list">${lens.statuses
            .map(
              (t) =>
                `<li><span class="tier-badge ${statusClass(t.label)}">${escapeHtml(t.label)}</span> ${escapeHtml(t.note)}</li>`
            )
            .join("")}</ul>
          <p class="muted">${escapeHtml(lens.pillarNotes)}</p>
        </article>
      </div>`
          : ""
      }
      <div class="section-head">
        <div>
          <h2>${list.length} bank consolidators</h2>
          <p>Ordered by weighted score. Click a row for the full thesis and developments.</p>
        </div>
      </div>
      ${
        list.length
          ? `
      <div class="table-scroll">
      <table class="company-table bank-table">
        <thead>
          <tr><th>Bank</th><th>Status</th><th>Deal record</th><th>Evidence it worked</th><th>Score</th><th>IBKR</th></tr>
        </thead>
        <tbody>
          ${list
            .map(
              (c) => `
          <tr data-id="${c.id}">
            <td class="name-cell">
              <strong>${escapeHtml(c.name)}</strong>
              <span class="ticker">${escapeHtml(c.ticker)}</span>
              <div class="muted">${escapeHtml(c.country)} · ${escapeHtml(c.bank?.assets || "")} assets</div>
              <div class="muted">${escapeHtml(c.ceo || "")}</div>
            </td>
            <td><span class="tier-badge ${statusClass(c.bank?.status)}">${escapeHtml(c.bank?.status || "—")}</span></td>
            <td class="bank-text">${escapeHtml(c.bank?.record || "")}</td>
            <td class="bank-text">${escapeHtml(c.bank?.proof || "")}</td>
            <td><span class="score-badge">${c.weighted}</span></td>
            <td><span class="ticker">${escapeHtml(c.ibkr)}</span></td>
          </tr>`
            )
            .join("")}
        </tbody>
      </table>
      </div>`
          : `<div class="empty">No banks match this filter.</div>`
      }
    </section>`;
}

function renderRankings() {
  const list = filteredCompanies().filter(
    (c) => state.segment === "all" || (state.segment === "banks" ? isBank(c) : !isBank(c))
  );
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <h2>Your ranking</h2>
          <p>Drag rows or edit rank #. Scores are weighted pillar totals (0–100). Click a row for details &amp; developments.</p>
        </div>
        <div class="controls">
          <label>
            <span class="sr-only">Segment</span>
            <select id="segment-select">
              <option value="all" ${state.segment === "all" ? "selected" : ""}>All segments</option>
              <option value="acquirers" ${state.segment === "acquirers" ? "selected" : ""}>Serial acquirers</option>
              <option value="banks" ${state.segment === "banks" ? "selected" : ""}>Banks</option>
            </select>
          </label>
          <label>
            <span class="sr-only">Sort</span>
            <select id="sort-select">
              <option value="rank" ${state.sort === "rank" ? "selected" : ""}>Sort: my rank</option>
              <option value="score" ${state.sort === "score" ? "selected" : ""}>Sort: weighted score</option>
              <option value="name" ${state.sort === "name" ? "selected" : ""}>Sort: name</option>
              <option value="ticker" ${state.sort === "ticker" ? "selected" : ""}>Sort: ticker</option>
            </select>
          </label>
        </div>
      </div>
      ${renderCompanyTable(list, { showCountry: true, draggable: state.sort === "rank" && state.segment === "all" })}
    </section>`;
}

function renderCountry(country) {
  const list = filteredCompanies(country);
  const groups = groupByIndustry(list);
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <h2>${escapeHtml(country)}</h2>
          <p>${list.length} IBKR-focus names · grouped by industry</p>
        </div>
        <div class="controls">
          <label>
            <span class="sr-only">Sort</span>
            <select id="sort-select">
              <option value="rank" ${state.sort === "rank" ? "selected" : ""}>Sort: my rank</option>
              <option value="score" ${state.sort === "score" ? "selected" : ""}>Sort: weighted score</option>
              <option value="name" ${state.sort === "name" ? "selected" : ""}>Sort: name</option>
            </select>
          </label>
        </div>
      </div>
      ${
        groups.length
          ? groups
              .map(
                ([industry, comps]) => `
        <div class="industry-block">
          <h3>${escapeHtml(industry)}</h3>
          ${renderCompanyTable(comps, { showCountry: false, draggable: false })}
        </div>`
              )
              .join("")
          : `<div class="empty">No companies match this filter.</div>`
      }
    </section>`;
}

function renderCompanyTable(list, { showCountry, draggable }) {
  if (!list.length) return `<div class="empty">No matches.</div>`;
  return `
    <table class="company-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Company</th>
          ${showCountry ? "<th>Country</th>" : ""}
          <th>Industry</th>
          <th>Score</th>
          <th>Tier</th>
          <th>IBKR</th>
        </tr>
      </thead>
      <tbody>
        ${list
          .map((c) => {
            const tier = tierFor(c.weighted, state.framework.scoreGuide.tiers);
            return `
          <tr data-id="${c.id}" ${draggable ? 'draggable="true"' : ""}>
            <td>
              ${draggable ? '<span class="drag-handle" title="Drag to re-rank">⋮⋮</span>' : ""}
              <input class="rank-input" type="number" min="1" max="${state.companies.length}" value="${c.userRank}" data-rank-for="${c.id}" onclick="event.stopPropagation()" />
            </td>
            <td class="name-cell">
              <strong>${escapeHtml(c.name)}</strong>
              <span class="ticker">${escapeHtml(c.ticker)}</span>
              ${isNew(c) ? '<span class="new-badge" title="Added ' + escapeHtml(c.added) + '">New</span>' : ""}
              <div class="muted">${escapeHtml(c.model)}</div>
            </td>
            ${showCountry ? `<td>${escapeHtml(c.country)}</td>` : ""}
            <td>${escapeHtml(c.industry)}</td>
            <td><span class="score-badge">${c.weighted}</span></td>
            <td><span class="tier-badge ${tierClass(tier.label)}">${escapeHtml(tier.label)}</span></td>
            <td><span class="ticker">${escapeHtml(c.ibkr)}</span></td>
          </tr>`;
          })
          .join("")}
      </tbody>
    </table>`;
}

function bindTableEvents() {
  const sort = document.getElementById("sort-select");
  if (sort) {
    sort.addEventListener("change", () => {
      state.sort = sort.value;
      render();
    });
  }

  const segment = document.getElementById("segment-select");
  if (segment) {
    segment.addEventListener("change", () => {
      state.segment = segment.value;
      render();
    });
  }

  document.querySelectorAll(".rank-input").forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.dataset.rankFor;
      const next = Number(input.value);
      if (!Number.isFinite(next)) return;
      setRank(id, next);
      render();
    });
  });

  document.querySelectorAll(".company-table tbody tr").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".rank-input") || e.target.closest(".drag-handle")) return;
      openCompany(row.dataset.id);
    });

    if (row.draggable) {
      row.addEventListener("dragstart", () => {
        state.dragId = row.dataset.id;
        row.classList.add("dragging");
      });
      row.addEventListener("dragend", () => {
        state.dragId = null;
        row.classList.remove("dragging");
      });
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const fromId = state.dragId;
        const toId = row.dataset.id;
        if (!fromId || fromId === toId) return;
        reorderRanks(fromId, toId);
        render();
      });
    }
  });
}

function setRank(id, desired) {
  const company = state.companies.find((c) => c.id === id);
  if (!company) return;
  const target = Math.max(1, Math.min(state.companies.length, Math.round(desired)));
  const others = state.companies
    .filter((c) => c.id !== id)
    .sort((a, b) => a.userRank - b.userRank);
  others.splice(target - 1, 0, company);
  others.forEach((c, i) => {
    c.userRank = i + 1;
  });
  persistRanks();
}

function reorderRanks(fromId, toId) {
  const ordered = [...state.companies].sort((a, b) => a.userRank - b.userRank);
  const fromIdx = ordered.findIndex((c) => c.id === fromId);
  const toIdx = ordered.findIndex((c) => c.id === toId);
  if (fromIdx < 0 || toIdx < 0) return;
  const [item] = ordered.splice(fromIdx, 1);
  ordered.splice(toIdx, 0, item);
  ordered.forEach((c, i) => {
    c.userRank = i + 1;
  });
  persistRanks();
}

function openCompany(id) {
  const c = state.companies.find((x) => x.id === id);
  if (!c) return;
  const tier = tierFor(c.weighted, state.framework.scoreGuide.tiers);
  const allDevs = [...(c.developments || []), ...c.userDevelopments].sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );
  const body = document.getElementById("modal-body");
  body.innerHTML = `
    <p class="brand-mark">${escapeHtml(c.country)} · ${escapeHtml(c.industry)}</p>
    <h2>${escapeHtml(c.name)}</h2>
    <p class="ticker">${escapeHtml(c.ticker)} · IBKR: ${escapeHtml(c.ibkr)} · Exchange: ${escapeHtml(c.exchange)}</p>
    ${c.ceo ? `<p class="ceo-line"><strong>Capital allocator:</strong> ${escapeHtml(c.ceo)}</p>` : ""}
    <p>${escapeHtml(c.thesis)}</p>
    ${
      c.bank
        ? `<div class="bank-box">
      <p><span class="tier-badge ${statusClass(c.bank.status)}">${escapeHtml(c.bank.status)}</span> <span class="muted">${escapeHtml(c.bank.assets)} assets</span></p>
      <p><strong>Deal record:</strong> ${escapeHtml(c.bank.record)}</p>
      <p><strong>Evidence it worked:</strong> ${escapeHtml(c.bank.proof)}</p>
    </div>`
        : ""
    }
    <p><span class="rank-badge">#${c.userRank}</span>
       <span class="score-badge">${c.weighted}</span>
       <span class="tier-badge ${tierClass(tier.label)}">${escapeHtml(tier.label)}</span></p>
    <div class="score-grid">
      ${Object.entries(c.scores)
        .map(
          ([k, v]) => `
        <div class="score-card">
          <span>${escapeHtml(PILLAR_LABELS[k] || k)}</span>
          <strong>${v}/10</strong>
        </div>`
        )
        .join("")}
    </div>
    <p class="muted"><strong>Sources:</strong> ${(c.sources || []).map(escapeHtml).join(" · ") || "—"}</p>
    <h3 style="font-family:var(--display);margin:1.2rem 0 0.35rem">Developments</h3>
    <ul class="developments">
      ${
        allDevs.length
          ? allDevs
              .map(
                (d) => `
        <li>
          <div class="dev-date">${escapeHtml(d.date)}${d.user ? " · you" : ""}</div>
          <div>${escapeHtml(d.note)}</div>
        </li>`
              )
              .join("")
          : `<li class="muted">No developments logged yet.</li>`
      }
    </ul>
    <div class="add-dev">
      <input id="dev-date" type="text" placeholder="Date (e.g. 2026-Q3)" />
      <textarea id="dev-note" placeholder="What changed? Deal, leadership, capital allocation, etc."></textarea>
      <button type="button" class="btn" id="save-dev">Add development</button>
    </div>
  `;
  const modal = document.getElementById("company-modal");
  modal.showModal();
  document.getElementById("save-dev").addEventListener("click", () => {
    const date = document.getElementById("dev-date").value.trim() || new Date().toISOString().slice(0, 10);
    const note = document.getElementById("dev-note").value.trim();
    if (!note) return;
    c.userDevelopments.unshift({ date, note, user: true });
    persistDevs();
    openCompany(id);
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wireChrome() {
  document.getElementById("search").addEventListener("input", (e) => {
    state.search = e.target.value;
    render();
  });
  document.getElementById("reset-ranks").addEventListener("click", () => {
    if (!confirm("Reset your ranks to the default first-pass ranking?")) return;
    state.companies.forEach((c) => {
      c.userRank = c.rank;
    });
    persistRanks();
    render();
  });
}

async function main() {
  await loadData();
  wireChrome();
  render();
}

main().catch((err) => {
  document.getElementById("app").innerHTML = `<div class="empty">Failed to load data: ${escapeHtml(err.message)}</div>`;
  console.error(err);
});
