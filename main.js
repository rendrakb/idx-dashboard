// ============================================================
// CONSTANTS & CONFIG
// ============================================================
const BATCH_SIZE = 30;

const INVESTOR_TYPE_MAP = {
  CP: { label: "Corporate", cls: "badge-cp" },
  ID: { label: "Individual", cls: "badge-id" },
  IB: { label: "Bank", cls: "badge-ib" },
  IS: { label: "Insurance", cls: "badge-is" },
  OT: { label: "Other", cls: "badge-ot" },
  MF: { label: "Mutual Fund", cls: "badge-mf" },
  PF: { label: "Pension Fund", cls: "badge-pf" },
  SC: { label: "Securities", cls: "badge-sc" },
  FD: { label: "Foundation", cls: "badge-fd" },
  "": { label: "Unknown", cls: "badge-unknown" },
};

// ============================================================
// STATE
// ============================================================
let state = {
  searchQuery: "",
  displayedCount: 0,
  allGroups: [],
  filteredGroups: [],
  expandedCards: new Set(),
  expandAll: false,
  ffMin: 0,
  ffMax: 100,
  sortKey: "ticker", // 'ticker' | 'freefloat' | 'hhi' | 'marketcap'
  sortDir: "asc", // 'asc' | 'desc'
  sectorFilter: "", // '' = all, or specific sector name
};

// ============================================================
// DATA PROCESSING
// ============================================================
function buildGroups(data) {
  const map = new Map();
  for (const rec of data) {
    const key = rec.share_code;
    if (!map.has(key)) {
      map.set(key, {
        share_code: rec.share_code,
        issuer_name: rec.issuer_name,
        records: [],
      });
    }
    map.get(key).records.push(rec);
  }
  for (const g of map.values()) {
    g.records.sort((a, b) => b.percentage - a.percentage);
    g.holderCount = g.records.length;
    g.pctSum = g.records.reduce((s, r) => s + (r.percentage || 0), 0);
    // Free float = 100% - pctSum (shares not held by >1% holders)
    g.freeFloat = Math.max(0, 100 - g.pctSum);
    g.hasScripData = g.records.some(
      (r) => r.holdings_scrip && r.holdings_scrip > 0,
    );
    // --- Concentration metrics ---
    // HHI: sum of squared percentages of known 1%+ holders (classic approach)
    g.hhiRaw = Math.round(
      g.records.reduce((s, r) => s + (r.percentage || 0) ** 2, 0),
    );
    // CR3: top-3 holder concentration ratio
    g.cr3 = +g.records
      .slice(0, 3)
      .reduce((s, r) => s + (r.percentage || 0), 0)
      .toFixed(2);
    // CR1: largest single holder
    g.cr1 =
      g.records.length > 0 ? +(g.records[0].percentage || 0).toFixed(2) : 0;
    // Composite Concentration Score (CCS) 0–100
    // Blends HHI (normalized), CR3, and inverse holder count for a holistic view
    var hhiNorm = Math.min(g.hhiRaw / 10000, 1); // 0–1
    var cr3Norm = Math.min(g.cr3 / 100, 1); // 0–1
    var holderNorm = Math.max(0, 1 - (g.holderCount - 1) / 19); // 1 holder=1, 20+=0
    g.ccs = Math.round(
      (hhiNorm * 0.45 + cr3Norm * 0.35 + holderNorm * 0.2) * 100,
    );
    // Keep hhi as the display value (CCS replaces old HHI for pill)
    g.hhi = g.ccs;
    // Ownership type classification
    if (g.cr1 >= 50) g.ownershipType = "Mayoritas";
    else if (g.cr3 >= 60) g.ownershipType = "Oligopoli";
    else if (g.pctSum >= 70) g.ownershipType = "Terkonsentrasi";
    else if (g.pctSum <= 40) g.ownershipType = "Tersebar";
    else g.ownershipType = "Moderat";
    // Top-3 holder share (legacy compat)
    g.top3 = g.cr3;
    // Sector / industry from SECTOR_DATA
    const sd =
      typeof SECTOR_DATA !== "undefined" ? SECTOR_DATA[g.share_code] : null;
    g.sector = sd ? sd.sector : "";
    g.industry = sd ? sd.industry : "";
    // Market cap from PRICE_DATA
    const pi = getPriceInfo(g.share_code);
    g.marketCap = pi && pi.mc ? pi.mc : 0;
  }
  return Array.from(map.values()).sort((a, b) =>
    a.share_code.localeCompare(b.share_code),
  );
}

function applyFilters() {
  const q = state.searchQuery.toLowerCase().trim();

  state.filteredGroups = state.allGroups.filter((g) => {
    // Text search
    if (q) {
      const inCode = g.share_code.toLowerCase().includes(q);
      const inName = g.issuer_name.toLowerCase().includes(q);
      const inInvestor = g.records.some((r) =>
        r.investor_name.toLowerCase().includes(q),
      );
      if (!inCode && !inName && !inInvestor) return false;
    }
    // Free float range filter
    if (g.freeFloat < state.ffMin || g.freeFloat > state.ffMax) return false;
    // Sector filter
    if (state.sectorFilter && g.sector !== state.sectorFilter) return false;
    return true;
  });

  // Apply sorting
  applySorting();

  renderPage(true);
}

function applySorting() {
  const { sortKey, sortDir } = state;
  if (!sortDir) return; // no sort active
  state.filteredGroups.sort((a, b) => {
    let cmp;
    if (sortKey === "ticker") {
      cmp = a.share_code.localeCompare(b.share_code);
    } else if (sortKey === "hhi") {
      cmp = a.hhi - b.hhi;
    } else if (sortKey === "marketcap") {
      // Sort by market cap, but treat stocks without data (0) as having the lowest value
      const aVal = a.marketCap || 0;
      const bVal = b.marketCap || 0;
      cmp = aVal - bVal;
    } else {
      cmp = a.freeFloat - b.freeFloat;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });
}

// ============================================================
// NUMBER FORMATTING (Indonesian locale)
// ============================================================
function fmtNum(n) {
  if (n === null || n === undefined || n === "") return "—";
  if (n === 0) return "0";
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function fmtPct(p) {
  if (p === null || p === undefined) return "—";
  return p.toFixed(2).replace(".", ",") + "%";
}

function fmtPctSum(p) {
  return p.toFixed(2).replace(".", ",") + "%";
}

// Format IDR price (Rp 1.234)
function fmtPrice(n) {
  if (n === null || n === undefined) return "—";
  return (
    "Rp " +
    Math.round(n)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ".")
  );
}

// Format large IDR amounts with T (Triliun), B (Miliar), M (Juta) suffixes
function fmtMoney(n) {
  if (n === null || n === undefined || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2).replace(".", ",") + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2).replace(".", ",") + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + "M";
  return fmtNum(Math.round(n));
}

// Format market cap (shorter: 851,2T)
function fmtMcap(n) {
  if (n === null || n === undefined || n === 0) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1).replace(".", ",") + " T";
  if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(".", ",") + " B";
  if (abs >= 1e6) return (n / 1e6).toFixed(0).replace(".", ",") + " M";
  return fmtNum(Math.round(n));
}

// Get price data for a ticker
function getPriceInfo(code) {
  if (typeof PRICE_DATA === "undefined") return null;
  return PRICE_DATA[code] || null;
}

// ============================================================
// ANIMATED KPI UPDATE
// ============================================================
function animateKPI(el, value, formatter) {
  if (!el) return;
  const text = formatter ? formatter(value) : fmtNum(value);
  el.textContent = text;
  el.classList.remove("counting");
  void el.offsetWidth; // reflow to restart animation
  el.classList.add("counting");
}

// ============================================================
// BADGE HELPERS
// ============================================================
function hhiPill(ccs, group) {
  // CCS = Composite Concentration Score (0–100)
  let cls, label;
  if (ccs <= 25) {
    cls = "hhi-low";
    label = "Rendah";
  } else if (ccs <= 55) {
    cls = "hhi-med";
    label = "Sedang";
  } else {
    cls = "hhi-high";
    label = "Tinggi";
  }
  let tip = "CCS " + ccs + "/100 (" + label + ")";
  if (group) {
    tip += "\nTipe: " + (group.ownershipType || "-");
    tip +=
      "\nCR1: " + fmtPct(group.cr1) + "% · CR3: " + fmtPct(group.cr3) + "%";
    tip += "\nHHI klasik: " + fmtNum(group.hhiRaw);
    tip += "\nHolder 1%+: " + group.holderCount;
  }
  return (
    '<span class="hhi-pill ' +
    cls +
    '" title="' +
    tip.replace(/"/g, "&quot;") +
    '">CCS ' +
    ccs +
    "</span>"
  );
}

function typeBadge(code) {
  const t = INVESTOR_TYPE_MAP[code] || INVESTOR_TYPE_MAP[""];
  return `<span class="type-badge ${t.cls}">${t.label}</span>`;
}

function lfBadge(lf, nationality, domicile) {
  if (lf === "D") return `<span class="lf-badge badge-local">Lokal</span>`;
  if (lf === "F") {
    const nat = (nationality || domicile || "").trim();
    return `<span class="lf-badge badge-foreign">Asing</span>${nat ? `<span class="nationality-text">${nat}</span>` : ""}`;
  }
  return `<span class="lf-badge badge-lf-unknown">—</span>`;
}

// ============================================================
// RENDER KPIs
// ============================================================
function renderKPIs(data) {
  // KPIs moved to Metrics tab — this function is now a no-op.
  // Metrics tab handles its own rendering via renderMetricsTab().
}

// ============================================================
// RENDER GROUP CARD
// ============================================================
function renderGroupCard(group) {
  const isOpen = state.expandedCards.has(group.share_code);
  const card = document.createElement("div");
  card.className = "stock-card" + (isOpen ? " open" : "");
  card.dataset.code = group.share_code;

  let tableRows = "";
  let mobileRows = "";
  group.records.forEach((rec, i) => {
    const pctWidth = Math.min(100, rec.percentage).toFixed(1);

    let invChangeBadge = "";
    let invChangeBadgeMobile = "";

    // Combined shares column with labeled Scripless/Scrip lines
    let sharesHtml = `<div class="shares-combined">${fmtNum(rec.total_holding_shares)}`;
    if (rec.holdings_scrip > 0 && rec.holdings_scripless > 0) {
      sharesHtml += `<div class="shares-detail"><span class="shares-detail-label">Scripless:</span> ${fmtNum(rec.holdings_scripless)}<br><span class="shares-detail-label">Scrip:</span> ${fmtNum(rec.holdings_scrip)}</div>`;
    } else if (
      rec.holdings_scrip > 0 &&
      (!rec.holdings_scripless || rec.holdings_scripless === 0)
    ) {
      sharesHtml += `<div class="shares-detail"><span class="shares-detail-label">Scrip:</span> ${fmtNum(rec.holdings_scrip)}</div>`;
    }
    sharesHtml += `</div>`;

    tableRows += `
      <tr style="--row-pct:${pctWidth}%">
        <td class="rank">${i + 1}</td>
        <td class="inv-name"><span class="inv-name-text inv-name-link" onclick="event.stopPropagation(); navigateToInvestor('${escOnclick(rec.investor_name)}')" title="${esc(rec.investor_name)}">${esc(rec.investor_name)}${pepBadge(rec.investor_name)}${invChangeBadge}</span></td>
        <td>${typeBadge(rec.investor_type)}</td>
        <td class="status-col">${lfBadge(rec.local_foreign, rec.nationality, rec.domicile)}</td>
        <td class="right">${sharesHtml}</td>
        <td class="pct-col"><span class="pct-num">${fmtPct(rec.percentage)}</span></td>
      </tr>`;

    mobileRows += `
      <div class="mobile-inv-row" style="--row-pct:${pctWidth}%">
        <span class="mobile-inv-name inv-name-link" onclick="event.stopPropagation(); navigateToInvestor('${escOnclick(rec.investor_name)}')">${esc(rec.investor_name)}${pepBadge(rec.investor_name)}${invChangeBadgeMobile}</span>
        <span class="mobile-inv-pct">${fmtPct(rec.percentage)}</span>
        <div class="mobile-inv-badges">
          ${typeBadge(rec.investor_type)}
          ${lfBadge(rec.local_foreign, rec.nationality, rec.domicile)}
        </div>
        <span class="mobile-inv-shares">${fmtNum(rec.total_holding_shares)} saham</span>
      </div>`;
  });

  const isNewStock = false;

  card.innerHTML = `
    <div class="card-header" role="button" aria-expanded="${isOpen}" tabindex="0">
      <div class="card-header-left">
        <span class="ticker-badge">${esc(group.share_code)}</span>

        <span class="issuer-name" title="${esc(group.issuer_name)}">${esc(group.issuer_name)}</span>
      </div>
      <div class="card-header-right">
        ${(() => {
          const pi = getPriceInfo(group.share_code);
          const hasPrice = pi && pi.p;
          const hasMCap = pi && pi.mc;
          return `<span class="price-pill"><span class="pill-label">Harga:</span> ${hasPrice ? fmtPrice(pi.p) : '<span class="no-data">no data</span>'}</span><span class="mcap-pill"><span class="pill-label">MCap:</span> ${hasMCap ? fmtMcap(pi.mc) : '<span class="no-data">no data</span>'}</span>`;
        })()}
        ${group.sector ? `<span class="sector-badge" title="${esc(group.industry || group.sector)}">${esc(group.sector)}</span>` : ""}
        ${hhiPill(group.hhi, group)}
        <span class="holder-count">${group.holderCount} pemegang saham</span>
        <span class="pct-sum">${fmtPctSum(group.pctSum)}</span>
        <span class="remaining-float-pill" title="Sisa float = 100% − ${fmtPctSum(group.pctSum)}">Float ${fmtPctSum(group.freeFloat)}</span>
      </div>
    </div>
    <div class="card-body">
      <div class="mobile-card-meta">
        ${(() => {
          const pi = getPriceInfo(group.share_code);
          const hasPrice = pi && pi.p;
          const hasMCap = pi && pi.mc;
          return `<span class="price-pill"><span class="pill-label">Harga:</span> ${hasPrice ? fmtPrice(pi.p) : '<span class="no-data">no price data</span>'}</span><span class="mcap-pill"><span class="pill-label">MCap:</span> ${hasMCap ? fmtMcap(pi.mc) : '<span class="no-data">no mcap data</span>'}</span>`;
        })()}
        ${group.sector ? `<span class="sector-badge" title="${esc(group.industry || group.sector)}">${esc(group.sector)}</span>` : ""}
        ${hhiPill(group.hhi, group)}
      </div>
      <div class="card-body-inner">
        <div class="card-body-table">
          <div class="table-scroll">
            <table class="inv-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pemegang Saham</th>
                  <th>Tipe Investor</th>
                  <th>Status</th>
                  <th class="right">Saham</th>
                  <th class="right">% Kepemilikan</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
            <div class="mobile-inv-list">${mobileRows}</div>
          </div>
        </div>
        <div class="card-body-graph">
          <div class="network-section open">
            <button class="network-toggle-btn" onclick="event.stopPropagation(); toggleNetworkGraph(this)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/>
                <line x1="12" y1="8" x2="5" y2="16"/><line x1="12" y1="8" x2="19" y2="16"/>
              </svg>
              Jaringan Koneksi
              <svg class="network-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
            <div class="network-graph-container">
              <div class="graph-zoom-controls">
                <button class="graph-zoom-btn" onclick="event.stopPropagation(); graphZoom(this, 1.4)" title="Zoom In">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button class="graph-zoom-btn" onclick="event.stopPropagation(); graphZoom(this, 0.7)" title="Zoom Out">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button class="graph-zoom-btn" onclick="event.stopPropagation(); graphZoomReset(this)" title="Reset">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
                <button class="graph-zoom-btn" onclick="event.stopPropagation(); openGraphFullscreen(this)" title="Fullscreen">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                </button>
              </div>
            </div>
      </div>
    </div>`;

  const header = card.querySelector(".card-header");
  const toggleCard = () => {
    const code = group.share_code;
    const isNowOpen = card.classList.toggle("open");
    header.setAttribute("aria-expanded", isNowOpen);
    if (isNowOpen) {
      state.expandedCards.add(code);
      // Auto-render network graph when card opens
      const gc = card.querySelector(".network-graph-container");
      if (gc) setTimeout(() => autoRenderGraph(gc), 50);
    } else {
      state.expandedCards.delete(code);
    }
  };
  header.addEventListener("click", (e) => {
    if (compareMode) {
      e.preventDefault();
      e.stopPropagation();
      toggleCompareStock(group.share_code);
      return;
    }
    toggleCard();
  });
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (compareMode) {
        toggleCompareStock(group.share_code);
        return;
      }
      toggleCard();
    }
  });

  // Auto-render graph if card is open on creation
  if (isOpen) {
    const gc = card.querySelector(".network-graph-container");
    if (gc) setTimeout(() => autoRenderGraph(gc), 80);
  }

  return card;
}

// ============================================================
// RENDER PAGE (infinite scroll)
// ============================================================
function renderPage(reset) {
  const list = document.getElementById("groupList");
  const empty = document.getElementById("emptyState");
  const statusEl = document.getElementById("scrollStatus");

  const total = state.filteredGroups.length;

  const rc = document.getElementById("resultsCount");
  if (rc) rc.textContent = `${fmtNum(total)} emiten`;

  if (total === 0) {
    list.style.display = "none";
    empty.style.display = "flex";
    statusEl.innerHTML = "";
    return;
  }

  empty.style.display = "none";
  list.style.display = "flex";

  if (reset) {
    list.innerHTML = "";
    state.displayedCount = 0;
    list.style.animation = "none";
    list.offsetHeight;
    list.style.animation = "";
  }

  const end = Math.min(state.displayedCount + BATCH_SIZE, total);
  const frag = document.createDocumentFragment();
  const startIdx = state.displayedCount;
  for (let i = state.displayedCount; i < end; i++) {
    const card = renderGroupCard(state.filteredGroups[i]);
    card.style.setProperty("--stagger", `${(i - startIdx) * 30}ms`);
    frag.appendChild(card);
  }
  list.appendChild(frag);
  state.displayedCount = end;

  updateScrollStatus(statusEl, state.displayedCount, total, "emiten");
}

function loadMoreItems() {
  if (state.displayedCount >= state.filteredGroups.length) return;
  renderPage(false);
}

function updateScrollStatus(el, displayed, total, label) {
  if (displayed >= total) {
    el.innerHTML = `<div class="scroll-end">Menampilkan semua ${fmtNum(total)} ${label}</div>`;
  } else {
    el.innerHTML = `<div class="scroll-end">Menampilkan ${fmtNum(displayed)} dari ${fmtNum(total)} ${label}</div>`;
  }
}

// ============================================================
// CROSS-TAB NAVIGATION
// ============================================================
function navigateToInvestor(investorName) {
  switchTab("investor");
  const searchInput = document.getElementById("invSearchInput");
  searchInput.value = investorName;
  invState.searchQuery = investorName;
  const searchClear = document.getElementById("invSearchClear");
  if (searchClear) searchClear.classList.add("visible");
  applyInvFilters();
  invState.expandedCards.clear();
  // Try exact match first, then case-insensitive
  let match = invState.filteredGroups.find(
    (g) => g.investor_name === investorName,
  );
  if (!match)
    match = invState.filteredGroups.find(
      (g) => g.investor_name.toLowerCase() === investorName.toLowerCase(),
    );
  if (match) {
    invState.expandedCards.add(match.investor_name);
    renderInvPage(true);
    setTimeout(() => {
      const card = document.querySelector(
        `[data-investor="${CSS.escape(match.investor_name)}"]`,
      );
      if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }
  updateHash();
}

function navigateToStock(shareCode, issuerName) {
  switchTab("summary");
  const searchInput = document.getElementById("searchInput");
  // Use issuer name for more precise filtering, fall back to share code
  const searchTerm = issuerName || shareCode;
  searchInput.value = searchTerm;
  state.searchQuery = searchTerm;
  const searchClear = document.getElementById("searchClear");
  if (searchClear) searchClear.classList.add("visible");
  applyFilters();
  state.expandedCards.clear();
  const match = state.filteredGroups.find((g) => g.share_code === shareCode);
  if (match) {
    state.expandedCards.add(match.share_code);
    renderPage(true);
    setTimeout(() => {
      const card = document.querySelector(
        `[data-code="${CSS.escape(match.share_code)}"]`,
      );
      if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }
  updateHash();
}

// ============================================================
// ESCAPE HTML
// ============================================================
function esc(str) {
  return (str || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// Safe encoding for use in onclick="fn('...')" HTML attributes
function escOnclick(str) {
  return (str || "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pepBadge(investorName) {
  let badges = "";
  const isPep = typeof PEP_DATA !== "undefined" && PEP_DATA[investorName];
  const isConglo =
    typeof CONGLO_DATA !== "undefined" && CONGLO_DATA[investorName];
  // PEP check
  if (isPep) {
    const info = PEP_DATA[investorName];
    const tooltipItems = info.roles.map((r) => `<li>${esc(r)}</li>`).join("");
    badges += ` <span class="marker-pill marker-pill--pep" data-tip-html="<ul>${tooltipItems}</ul>"><span class="marker-pill-dot"></span>PEP</span>`;
  }
  // Conglo check
  if (isConglo) {
    const info = CONGLO_DATA[investorName];
    const tooltipItems = info.roles.map((r) => `<li>${esc(r)}</li>`).join("");
    badges += ` <span class="marker-pill marker-pill--conglo" data-tip-html="<ul>${tooltipItems}</ul>"><span class="marker-pill-dot"></span>Konglo</span>`;
  }
  return badges;
}

// ============================================================
// DEBOUNCE
// ============================================================
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ============================================================
// THEME TOGGLE
// ============================================================
function initTheme() {
  const btn = document.getElementById("themeToggle");
  const icon = document.getElementById("themeIcon");
  const html = document.documentElement;

  const moonPath =
    "M7.5 1.5C4.19 1.5 1.5 4.19 1.5 7.5c0 3.31 2.69 6 6 6 3.31 0 6-2.69 6-6 0-.17-.01-.34-.03-.5A4.5 4.5 0 017.5 1.5z";
  const sunPaths =
    "M7.5 1.5V0M7.5 15v-1.5M1.5 7.5H0M15 7.5h-1.5M3 3L2 2M13 13l-1-1M12 3l1-1M2 13l1-1M10.5 7.5a3 3 0 11-6 0 3 3 0 016 0z";

  const setTheme = (theme) => {
    html.setAttribute("data-theme", theme);
    if (theme === "dark") {
      icon.innerHTML = `<path d="${moonPath}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`;
    } else {
      icon.innerHTML = `<path d="${sunPaths}" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>`;
    }
  };

  // Default to dark mode
  setTheme("dark");

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => {
      setTheme(e.matches ? "dark" : "light");
      // Refresh Chart.js metrics charts
      if (typeof refreshMetricsChartColors === "function")
        refreshMetricsChartColors();
      // Re-render all visible network graphs with new theme colors
      document.querySelectorAll(".network-graph-container").forEach((gc) => {
        if (gc.dataset.rendered) {
          gc.dataset.rendered = "";
          if (
            gc.closest(".network-section.open") ||
            gc.style.display === "block"
          ) {
            autoRenderGraph(gc);
          }
        }
      });
    });

  btn.addEventListener("click", () => {
    const current = html.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
    // Refresh Chart.js metrics charts
    if (typeof refreshMetricsChartColors === "function")
      refreshMetricsChartColors();
    // Re-render all visible network graphs with new theme colors
    document.querySelectorAll(".network-graph-container").forEach((gc) => {
      if (gc.dataset.rendered) {
        gc.dataset.rendered = "";
        if (
          gc.closest(".network-section.open") ||
          gc.style.display === "block"
        ) {
          autoRenderGraph(gc);
        }
      }
    });
  });
}

// ============================================================
// RANGE SLIDER
// ============================================================
function updateSliderFill() {
  const fill = document.getElementById("rangeSliderFill");
  const minVal = parseFloat(document.getElementById("rangeMin").value);
  const maxVal = parseFloat(document.getElementById("rangeMax").value);
  const left = minVal;
  const right = maxVal;
  fill.style.left = left + "%";
  fill.style.width = right - left + "%";
}

function initRangeSlider() {
  const rangeMin = document.getElementById("rangeMin");
  const rangeMax = document.getElementById("rangeMax");
  const ffMinInput = document.getElementById("ffMin");
  const ffMaxInput = document.getElementById("ffMax");

  const syncAndFilter = debounce(() => applyFilters(), 200);

  rangeMin.addEventListener("input", () => {
    let val = parseFloat(rangeMin.value);
    if (val > parseFloat(rangeMax.value) - 0.5) {
      val = parseFloat(rangeMax.value) - 0.5;
      rangeMin.value = val;
    }
    state.ffMin = val;
    ffMinInput.value = val > 0 ? val : "";
    updateSliderFill();
    syncAndFilter();
  });

  rangeMax.addEventListener("input", () => {
    let val = parseFloat(rangeMax.value);
    if (val < parseFloat(rangeMin.value) + 0.5) {
      val = parseFloat(rangeMin.value) + 0.5;
      rangeMax.value = val;
    }
    state.ffMax = val;
    ffMaxInput.value = val < 100 ? val : "";
    updateSliderFill();
    syncAndFilter();
  });

  const inputSync = debounce(() => {
    let minVal = parseFloat(ffMinInput.value);
    let maxVal = parseFloat(ffMaxInput.value);
    if (isNaN(minVal) || minVal < 0) minVal = 0;
    if (isNaN(maxVal) || maxVal > 100) maxVal = 100;
    if (minVal > maxVal) minVal = maxVal;
    state.ffMin = minVal;
    state.ffMax = maxVal;
    rangeMin.value = minVal;
    rangeMax.value = maxVal;
    updateSliderFill();
    applyFilters();
  }, 400);

  ffMinInput.addEventListener("input", inputSync);
  ffMaxInput.addEventListener("input", inputSync);

  updateSliderFill();
}

// ============================================================
// SORT CONTROLS
// ============================================================
function initSort() {
  const sortTicker = document.getElementById("sortTicker");
  const sortFF = document.getElementById("sortFF");
  const sortHHI = document.getElementById("sortHHI");
  const sortMCap = document.getElementById("sortMCap");
  const buttons = [sortTicker, sortFF, sortHHI, sortMCap];

  function refreshSortUI() {
    buttons.forEach((btn) => {
      if (!btn) return;
      const key = btn.dataset.sort;
      const isActive = key === state.sortKey;
      btn.classList.toggle("active", isActive);
      const arrow = btn.querySelector(".sort-arrow");
      if (isActive) {
        arrow.textContent = state.sortDir === "desc" ? "↓" : "↑";
      } else {
        arrow.textContent = "";
      }
    });
  }

  function doSort(key) {
    if (state.sortKey === key) {
      // Toggle direction
      state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
    } else {
      // Switch to new key, start ascending
      state.sortKey = key;
      state.sortDir = "asc";
    }
    refreshSortUI();
    applySorting();
    renderPage(true);
  }

  sortTicker.addEventListener("click", () => doSort("ticker"));
  sortFF.addEventListener("click", () => doSort("freefloat"));
  if (sortHHI) sortHHI.addEventListener("click", () => doSort("hhi"));
  if (sortMCap) sortMCap.addEventListener("click", () => doSort("marketcap"));

  refreshSortUI();
}

// ============================================================
// FILTER WIRING
// ============================================================
function initFilters() {
  const searchInput = document.getElementById("searchInput");
  const searchClear = document.getElementById("searchClear");
  const expandBtn = document.getElementById("expandAllBtn");
  const resetBtn = document.getElementById("filterReset");

  const doSearch = debounce(() => {
    state.searchQuery = searchInput.value;
    searchClear.classList.toggle("visible", !!searchInput.value);
    applyFilters();
    updateHash();
  }, 300);

  searchInput.addEventListener("input", doSearch);

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    state.searchQuery = "";
    searchClear.classList.remove("visible");
    applyFilters();
    updateHash();
  });

  expandBtn.addEventListener("click", () => {
    state.expandAll = !state.expandAll;
    if (state.expandAll) {
      state.filteredGroups
        .slice(0, state.displayedCount)
        .forEach((g) => state.expandedCards.add(g.share_code));
      expandBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 8l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Tutup Semua`;
    } else {
      state.filteredGroups
        .slice(0, state.displayedCount)
        .forEach((g) => state.expandedCards.delete(g.share_code));
      expandBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Buka Semua`;
    }
    renderPage(true);
  });

  // Reset all filters
  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    state.searchQuery = "";
    searchClear.classList.remove("visible");
    state.ffMin = 0;
    state.ffMax = 100;
    document.getElementById("ffMin").value = "";
    document.getElementById("ffMax").value = "";
    document.getElementById("rangeMin").value = 0;
    document.getElementById("rangeMax").value = 100;
    updateSliderFill();
    // Reset sector filter
    state.sectorFilter = "";
    const sectorSel = document.getElementById("sectorFilter");
    if (sectorSel) {
      sectorSel.value = "";
      sectorSel.classList.remove("active");
    }
    state.sortKey = "ticker";
    state.sortDir = "asc";
    document.querySelectorAll("#toolbar .sort-btn").forEach((btn) => {
      const key = btn.dataset.sort;
      const isActive = key === "ticker";
      btn.classList.toggle("active", isActive);
      const arrow = btn.querySelector(".sort-arrow");
      arrow.textContent = isActive ? "↑" : "";
    });
    applyFilters();
  });

  // Sector dropdown
  const sectorSelect = document.getElementById("sectorFilter");
  if (sectorSelect) {
    sectorSelect.addEventListener("change", () => {
      state.sectorFilter = sectorSelect.value;
      sectorSelect.classList.toggle("active", !!sectorSelect.value);
      applyFilters();
    });
  }

  initRangeSlider();
  initSort();

  // Mobile filter toggle
  const summaryFilterToggle = document.getElementById(
    "summaryMobileFilterToggle",
  );
  if (summaryFilterToggle) {
    summaryFilterToggle.addEventListener("click", () => {
      const toolbar = document.getElementById("toolbar");
      toolbar.classList.toggle("mobile-filters-expanded");
      summaryFilterToggle.classList.toggle("expanded");
    });
  }
}

// ============================================================
// FEATURE 1: EXPORT CSV
// ============================================================
function downloadCsv(filename, csvContent) {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(val) {
  const s = String(val == null ? "" : val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function exportStockCsv() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rows = [
    [
      "Kode",
      "Emiten",
      "Investor",
      "Tipe",
      "Lokal/Asing",
      "Nasionalitas",
      "Lembar Saham",
      "Persentase",
      "HHI",
      "Sektor",
      "Industri",
    ].join(","),
  ];
  for (const g of state.filteredGroups) {
    for (const r of g.records) {
      rows.push(
        [
          csvEscape(r.share_code),
          csvEscape(r.issuer_name),
          csvEscape(r.investor_name),
          csvEscape(
            (INVESTOR_TYPE_MAP[r.investor_type] || {}).label || r.investor_type,
          ),
          csvEscape(
            r.local_foreign === "D"
              ? "Lokal"
              : r.local_foreign === "F"
                ? "Asing"
                : "",
          ),
          csvEscape(r.nationality || r.domicile || ""),
          csvEscape(r.total_holding_shares || 0),
          csvEscape(
            r.percentage != null
              ? r.percentage.toFixed(2).replace(".", ",")
              : "",
          ),
          csvEscape(g.hhi),
          csvEscape(g.sector || ""),
          csvEscape(g.industry || ""),
        ].join(","),
      );
    }
  }
  downloadCsv(`ksei_saham_${today}.csv`, rows.join("\n"));
}

function exportInvestorCsv() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rows = [
    [
      "Investor",
      "Tipe",
      "Lokal/Asing",
      "Kode Saham",
      "Emiten",
      "Lembar Saham",
      "Persentase",
    ].join(","),
  ];
  for (const g of invState.filteredGroups) {
    for (const s of g.stocks) {
      rows.push(
        [
          csvEscape(g.investor_name),
          csvEscape(
            (INVESTOR_TYPE_MAP[g.investor_type] || {}).label || g.investor_type,
          ),
          csvEscape(
            g.local_foreign === "D"
              ? "Lokal"
              : g.local_foreign === "F"
                ? "Asing"
                : "",
          ),
          csvEscape(s.share_code),
          csvEscape(s.issuer_name),
          csvEscape(s.total_holding_shares || 0),
          csvEscape(
            s.percentage != null
              ? s.percentage.toFixed(2).replace(".", ",")
              : "",
          ),
        ].join(","),
      );
    }
  }
  downloadCsv(`ksei_investor_${today}.csv`, rows.join("\n"));
}

function exportKongloCsv() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rows = [["Grup Konglo", "Ticker", "Kategori", "Ditemukan"].join(",")];
  for (const g of kongloState.filteredGroups) {
    for (const t of g.tickers) {
      rows.push(
        [
          csvEscape(g.name),
          csvEscape(t.ticker),
          csvEscape(t.category),
          csvEscape(t.found ? "Ya" : "Tidak"),
        ].join(","),
      );
    }
  }
  downloadCsv(`ksei_konglo_${today}.csv`, rows.join("\n"));
}

function initExportButtons() {
  document
    .getElementById("exportCsvStock")
    .addEventListener("click", exportStockCsv);
  document
    .getElementById("exportCsvInvestor")
    .addEventListener("click", exportInvestorCsv);
  document
    .getElementById("exportCsvKonglo")
    .addEventListener("click", exportKongloCsv);
}

// ============================================================
// FEATURE 2: SHAREABLE URL WITH HASH
// ============================================================
let hashUpdatePaused = false;

function getCurrentTab() {
  if (!document.getElementById("tabSummary").classList.contains("hidden"))
    return "summary";
  if (!document.getElementById("tabInvestor").classList.contains("hidden"))
    return "investor";
  if (!document.getElementById("tabKonglo").classList.contains("hidden"))
    return "konglo";
  if (!document.getElementById("tabMetrics").classList.contains("hidden"))
    return "metrics";
  return "summary";
}

function updateHash() {
  if (hashUpdatePaused) return;
  const tab = getCurrentTab();
  let q = "";
  if (tab === "summary") q = state.searchQuery || "";
  else if (tab === "investor") q = invState.searchQuery || "";
  else if (tab === "konglo") q = kongloState.searchQuery || "";
  let hash = "#tab=" + tab;
  if (q) hash += "&q=" + encodeURIComponent(q);
  history.replaceState(null, "", hash);
}

function parseHash() {
  const hash = location.hash.slice(1);
  if (!hash) return null;
  const params = {};
  hash.split("&").forEach((pair) => {
    const [k, v] = pair.split("=");
    if (k && v !== undefined) params[k] = decodeURIComponent(v);
  });
  return params;
}

function applyHashState() {
  const params = parseHash();
  if (!params) return;
  hashUpdatePaused = true;
  const tab = params.tab || "summary";
  if (tab !== "summary") switchTab(tab);
  const q = params.q || "";
  if (q) {
    if (tab === "summary") {
      document.getElementById("searchInput").value = q;
      state.searchQuery = q;
      document.getElementById("searchClear").classList.toggle("visible", !!q);
      applyFilters();
    } else if (tab === "investor") {
      // Investor tab may need lazy init
      setTimeout(() => {
        document.getElementById("invSearchInput").value = q;
        invState.searchQuery = q;
        document
          .getElementById("invSearchClear")
          .classList.toggle("visible", !!q);
        applyInvFilters();
      }, 100);
    } else if (tab === "konglo") {
      setTimeout(() => {
        document.getElementById("kongloSearchInput").value = q;
        kongloState.searchQuery = q;
        document
          .getElementById("kongloSearchClear")
          .classList.toggle("visible", !!q);
        applyKongloFilters();
      }, 100);
    }
    // Metrics tab has no search
  }
  hashUpdatePaused = false;
}

// ============================================================
// GUIDE MODAL
// ============================================================
function openGuide() {
  document.getElementById("guideOverlay").classList.add("open");
}
function closeGuide() {
  document.getElementById("guideOverlay").classList.remove("open");
}
(function initGuide() {
  const overlay = document.getElementById("guideOverlay");
  if (!overlay) return;
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeGuide();
  });
})();

// ============================================================
// FEATURE 3: KEYBOARD SHORTCUTS
// ============================================================
function initKeyboardShortcuts() {
  const kbdModal = document.getElementById("kbdModalOverlay");
  const kbdBtn = document.getElementById("kbdHelpBtn");

  function toggleKbdModal() {
    kbdModal.classList.toggle("open");
  }
  kbdBtn.addEventListener("click", toggleKbdModal);
  kbdModal.addEventListener("click", (e) => {
    if (e.target === kbdModal) kbdModal.classList.remove("open");
  });

  document.addEventListener("keydown", (e) => {
    // Don't handle if fullscreen graph overlay is open
    if (document.querySelector(".graph-fullscreen-overlay.open")) return;
    // Don't handle if compare panel is open
    if (
      document.getElementById("comparePanelOverlay").classList.contains("open")
    )
      return;

    const isInput =
      e.target.tagName === "INPUT" ||
      e.target.tagName === "TEXTAREA" ||
      e.target.tagName === "SELECT";

    // Close guide modal
    if (
      e.key === "Escape" &&
      document.getElementById("guideOverlay").classList.contains("open")
    ) {
      closeGuide();
      return;
    }

    // Close kbd modal
    if (e.key === "Escape" && kbdModal.classList.contains("open")) {
      kbdModal.classList.remove("open");
      return;
    }

    // `/` or Ctrl+K: focus search
    if (
      (e.key === "/" && !isInput) ||
      (e.key === "k" && (e.ctrlKey || e.metaKey))
    ) {
      e.preventDefault();
      const tab = getCurrentTab();
      if (tab === "summary") document.getElementById("searchInput").focus();
      else if (tab === "investor")
        document.getElementById("invSearchInput").focus();
      else if (tab === "konglo")
        document.getElementById("kongloSearchInput").focus();
      return;
    }

    // Tab switching 1/2/3
    if (!isInput && ["1", "2", "3", "4", "5"].includes(e.key)) {
      e.preventDefault();
      if (e.key === "1") switchTab("summary");
      else if (e.key === "2") switchTab("investor");
      else if (e.key === "3") switchTab("konglo");
      else if (e.key === "4") switchTab("metrics");
      updateHash();
      return;
    }

    // Escape: clear search
    if (e.key === "Escape" && !isInput) {
      const tab = getCurrentTab();
      if (tab === "summary") {
        document.getElementById("searchInput").value = "";
        state.searchQuery = "";
        document.getElementById("searchClear").classList.remove("visible");
        applyFilters();
      } else if (tab === "investor") {
        document.getElementById("invSearchInput").value = "";
        invState.searchQuery = "";
        document.getElementById("invSearchClear").classList.remove("visible");
        applyInvFilters();
      } else if (tab === "konglo") {
        document.getElementById("kongloSearchInput").value = "";
        kongloState.searchQuery = "";
        document
          .getElementById("kongloSearchClear")
          .classList.remove("visible");
        applyKongloFilters();
      }
      updateHash();
      return;
    }

    // Escape on input: blur and clear
    if (e.key === "Escape" && isInput) {
      e.target.blur();
      return;
    }
  });
}

// ============================================================
// FEATURE 4: TOP INVESTORS LEADERBOARD
// ============================================================
function renderTopInvestors(data) {
  // Top investors section moved to Metrics tab charts. Check if legacy containers exist.
  if (!document.getElementById("topForeignBars")) return;
  // Count stocks per investor, split by local/foreign
  const foreignCounts = new Map();
  const localCounts = new Map();
  const investorStocks = new Map(); // investor -> Set of share_codes

  for (const rec of data) {
    const name = rec.investor_name;
    if (!investorStocks.has(name)) investorStocks.set(name, new Set());
    investorStocks.get(name).add(rec.share_code);
  }

  for (const rec of data) {
    const name = rec.investor_name;
    const count = investorStocks.get(name).size;
    if (rec.local_foreign === "F") {
      foreignCounts.set(name, count);
    } else if (rec.local_foreign === "D") {
      localCounts.set(name, count);
    }
  }

  const topForeign = [...foreignCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topLocal = [...localCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const maxForeign = topForeign.length > 0 ? topForeign[0][1] : 1;
  const maxLocal = topLocal.length > 0 ? topLocal[0][1] : 1;

  function renderBars(items, maxVal, cssClass, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = items
      .map(([name, count], i) => {
        const pct = ((count / maxVal) * 100).toFixed(1);
        return `<div class="top-inv-bar-row">
        <span class="top-inv-rank">${i + 1}</span>
        <span class="top-inv-name" title="${esc(name)}">${esc(name)}</span>
        <div class="top-inv-bar-wrap"><div class="top-inv-bar ${cssClass}" style="width:${pct}%"></div></div>
        <span class="top-inv-count">${count}</span>
      </div>`;
      })
      .join("");
  }

  renderBars(topForeign, maxForeign, "bar-foreign", "topForeignBars");
  renderBars(topLocal, maxLocal, "bar-local", "topLocalBars");
}

// ============================================================
// FEATURE 7: COUNTRY/NATIONALITY BREAKDOWN
// ============================================================
function renderCountryBreakdown(data) {
  // Country breakdown moved to Metrics tab charts. Check if legacy container exists.
  if (!document.getElementById("countryBreakdownBody")) return;
  // Normalize nationality mappings
  const normalizeMap = {
    INDONESIA: "Indonesia",
    INDONESIAN: "Indonesia",
    SINGAPORE: "Singapore",
    SINGAPOREAN: "Singapore",
    MALAYSIA: "Malaysia",
    MALAYSIAN: "Malaysia",
    CHINA: "China",
    CHINESE: "China",
    JAPAN: "Japan",
    JAPANESE: "Japan",
    KOREA: "Korea",
    KOREAN: "Korea",
    "SOUTH KOREA": "Korea",
    "SOUTH KOREAN": "Korea",
    INDIA: "India",
    INDIAN: "India",
    THAILAND: "Thailand",
    THAI: "Thailand",
    USA: "United States",
    "UNITED STATES": "United States",
    AMERICAN: "United States",
    US: "United States",
    UK: "United Kingdom",
    "UNITED KINGDOM": "United Kingdom",
    BRITISH: "United Kingdom",
    AUSTRALIA: "Australia",
    AUSTRALIAN: "Australia",
    NETHERLANDS: "Netherlands",
    DUTCH: "Netherlands",
    GERMANY: "Germany",
    GERMAN: "Germany",
    FRANCE: "France",
    FRENCH: "France",
    PHILIPPINES: "Philippines",
    PHILIPPINE: "Philippines",
    FILIPINO: "Philippines",
    TAIWAN: "Taiwan",
    TAIWANESE: "Taiwan",
    "HONG KONG": "Hong Kong",
    VIETNAM: "Vietnam",
    VIETNAMESE: "Vietnam",
    MYANMAR: "Myanmar",
    CAMBODIA: "Cambodia",
    CAMBODIAN: "Cambodia",
    BRUNEI: "Brunei",
    LUXEMBOURG: "Luxembourg",
    SWITZERLAND: "Switzerland",
    SWISS: "Switzerland",
    CANADA: "Canada",
    CANADIAN: "Canada",
    "NEW ZEALAND": "New Zealand",
    NORWAY: "Norway",
    NORWEGIAN: "Norway",
    SWEDEN: "Sweden",
    SWEDISH: "Sweden",
    DENMARK: "Denmark",
    DANISH: "Denmark",
  };

  const countryCounts = new Map();
  let total = 0;

  for (const rec of data) {
    const raw = (rec.nationality || rec.domicile || "").trim().toUpperCase();
    if (!raw) continue;
    const normalized =
      normalizeMap[raw] || raw.charAt(0) + raw.slice(1).toLowerCase();
    countryCounts.set(normalized, (countryCounts.get(normalized) || 0) + 1);
    total++;
  }

  const sorted = [...countryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const top15 = sorted.slice(0, 15);
  const remaining = sorted.length - 15;
  const maxCount = top15.length > 0 ? top15[0][1] : 1;

  const container = document.getElementById("countryBreakdownBody");
  let html = top15
    .map(([country, count]) => {
      const pct = ((count / total) * 100).toFixed(1).replace(".", ",");
      const barPct = ((count / maxCount) * 100).toFixed(1);
      const isIndonesia = country === "Indonesia";
      return `<div class="country-bar-row">
      <span class="country-bar-name" title="${esc(country)}">${esc(country)}</span>
      <div class="country-bar-wrap"><div class="country-bar ${isIndonesia ? "bar-indonesia" : "bar-other"}" style="width:${barPct}%"></div></div>
      <span class="country-bar-stats"><strong>${fmtNum(count)}</strong> (${pct}%)</span>
    </div>`;
    })
    .join("");

  if (remaining > 0) {
    html += `<div class="country-others-note">Lainnya: ${remaining} negara</div>`;
  }

  container.innerHTML = html;
}

// ============================================================
// FEATURE 5&6: STOCK COMPARISON + INVESTOR OVERLAP
// ============================================================
let compareMode = false;
let compareSelected = new Set(); // Set of share_codes

function initCompare() {
  const toggleBtn = document.getElementById("compareToggleBtn");
  const overlay = document.getElementById("comparePanelOverlay");

  toggleBtn.addEventListener("click", () => {
    compareMode = !compareMode;
    toggleBtn.classList.toggle("active", compareMode);
    const mainContent = document.getElementById("mainContent");
    mainContent.classList.toggle("compare-mode", compareMode);
    if (!compareMode) {
      compareSelected.clear();
      updateCompareUI();
    } else {
      updateCompareUI();
    }
  });

  // Close compare panel on overlay click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeComparePanel();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) {
      closeComparePanel();
    }
  });
}

function toggleCompareStock(code) {
  if (compareSelected.has(code)) {
    compareSelected.delete(code);
  } else {
    if (compareSelected.size >= 6) {
      showToast("Maksimal 6 saham untuk perbandingan");
      return;
    }
    compareSelected.add(code);
  }
  updateCompareUI();
}

function updateCompareUI() {
  // Update checkboxes
  document.querySelectorAll(".compare-checkbox").forEach((cb) => {
    const code = cb.dataset.code;
    cb.classList.toggle("checked", compareSelected.has(code));
  });
  // Update card selected highlight
  document.querySelectorAll(".stock-card").forEach((card) => {
    const cb = card.querySelector(".compare-checkbox");
    if (cb)
      card.classList.toggle(
        "compare-selected",
        compareSelected.has(cb.dataset.code),
      );
  });
  // Update floating bar with chips
  const bar = document.getElementById("compareFloatingBar");
  const tickersDiv = document.getElementById("compareSelectedTickers");
  if (compareMode && compareSelected.size > 0) {
    bar.classList.add("visible");
    tickersDiv.innerHTML = [...compareSelected]
      .map(
        (code) =>
          `<span class="compare-chip">${code} <button onclick="removeCompareStock('${code}')">&times;</button></span>`,
      )
      .join("");
  } else {
    bar.classList.remove("visible");
    tickersDiv.innerHTML = "";
  }
}

function removeCompareStock(code) {
  compareSelected.delete(code);
  updateCompareUI();
}

function showToast(msg) {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3100);
}

function openComparePanel() {
  if (compareSelected.size < 2) return;
  // Hide floating bar while modal is open
  document
    .getElementById("compareFloatingBar")
    .classList.add("compare-bar-hidden");
  const overlay = document.getElementById("comparePanelOverlay");
  const body = document.getElementById("comparePanelBody");

  // Build comparison data
  const selectedGroups = [...compareSelected]
    .map((code) => state.allGroups.find((g) => g.share_code === code))
    .filter(Boolean);

  if (selectedGroups.length < 2) return;

  const numCols = selectedGroups.length;
  const colsPerRow = Math.min(numCols, 3);
  let html = `<div class="compare-cols" style="grid-template-columns:repeat(${colsPerRow},1fr)">`;

  // Pre-compute theme-aware colors
  const isDarkMode =
    document.documentElement.getAttribute("data-theme") === "dark";
  const localDotC = isDarkMode ? "#5eead4" : "#0f766e";
  const foreignDotC = isDarkMode ? "#fda4af" : "#9f1239";
  const unclassDotC = isDarkMode ? "#475569" : "#cbd5e1";
  const _typeColors = {
    CP: isDarkMode ? "#60a5fa" : "#2563eb",
    ID: isDarkMode ? "#f472b6" : "#db2777",
    IB: isDarkMode ? "#34d399" : "#059669",
    IS: isDarkMode ? "#a78bfa" : "#7c3aed",
    OT: isDarkMode ? "#94a3b8" : "#64748b",
    MF: isDarkMode ? "#fbbf24" : "#d97706",
    PF: isDarkMode ? "#fb923c" : "#ea580c",
    SC: isDarkMode ? "#22d3ee" : "#0891b2",
    FD: isDarkMode ? "#f87171" : "#dc2626",
    "": isDarkMode ? "#94a3b8" : "#64748b",
  };

  selectedGroups.forEach((g) => {
    const top10 = g.records.slice(0, 10);
    const localCount = g.records.filter((r) => r.local_foreign === "D").length;
    const foreignCount = g.records.filter(
      (r) => r.local_foreign === "F",
    ).length;
    const unclassCount = g.records.filter((r) => !r.local_foreign).length;
    const totalR = g.records.length || 1;
    const localPct = ((localCount / totalR) * 100).toFixed(1);
    const foreignPct = ((foreignCount / totalR) * 100).toFixed(1);
    const unclassPct = ((unclassCount / totalR) * 100).toFixed(1);

    html += `<div class="compare-col">`;
    html += `<div class="compare-col-title">${esc(g.share_code)}</div>`;
    html += `<div class="compare-col-sub">${esc(g.issuer_name)}</div>`;

    // Top 10 investors — table format
    html += `<div class="compare-section-investors">`;
    html += `<div class="compare-section-title">Top ${Math.min(10, g.records.length)} Investor</div>`;
    html += `<table class="compare-inv-table"><tbody>`;
    top10.forEach((r) => {
      const barW = r.percentage.toFixed(1);
      const tColor = _typeColors[r.investor_type || ""] || _typeColors[""];
      const lfLabel =
        r.local_foreign === "D" ? "D" : r.local_foreign === "F" ? "F" : "";
      const lfClass =
        r.local_foreign === "D"
          ? "cmp-lf-local"
          : r.local_foreign === "F"
            ? "cmp-lf-foreign"
            : "cmp-lf-na";
      const lfBadge = lfLabel
        ? `<span class="cmp-lf-badge ${lfClass}">${lfLabel}</span>`
        : "";
      html += `<tr>
        <td title="${esc(r.investor_name)}"><span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${tColor};margin-right:5px;flex-shrink:0;vertical-align:middle;"></span>${esc(r.investor_name)}${lfBadge}</td>
        <td><div class="compare-inv-bar-wrap"><div class="compare-inv-bar" style="width:${barW}%"></div></div></td>
        <td>${fmtPct(r.percentage)}</td>
      </tr>`;
    });
    // Pad empty rows to 10 so all columns align
    for (let i = top10.length; i < 10; i++) {
      html += `<tr><td>&nbsp;</td><td></td><td></td></tr>`;
    }
    html += `</tbody></table>`;
    html += `</div>`;

    // Pie charts row: Lokal vs Asing + Investor Type side by side
    html += `<div class="compare-section-pies">`;

    // Local vs Foreign ratio — mini pie chart
    html += `<div class="compare-section-pie">`;
    html += `<div class="compare-section-title" style="align-self:flex-start;width:100%">Lokal vs Asing</div>`;
    html += `<div class="compare-mini-pie-wrap">`;
    html += `<canvas class="compare-mini-pie" data-local="${localPct}" data-foreign="${foreignPct}" data-unclass="${unclassPct}" width="80" height="80"></canvas>`;
    html += `<div class="compare-ratio-legend">`;
    html += `<span><span class="compare-ratio-dot" style="background:${localDotC}"></span>Lokal ${localPct.replace(".", ",")}%</span>`;
    html += `<span><span class="compare-ratio-dot" style="background:${foreignDotC}"></span>Asing ${foreignPct.replace(".", ",")}%</span>`;
    if (parseFloat(unclassPct) > 0)
      html += `<span><span class="compare-ratio-dot" style="background:${unclassDotC}"></span>Lainnya ${unclassPct.replace(".", ",")}%</span>`;
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;

    // Investor Type — mini pie chart
    const typeCounts = {};
    g.records.forEach((r) => {
      const t = r.investor_type || "OT";
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
    const typeTotal = g.records.length || 1;
    const typeDataStr = encodeURIComponent(
      JSON.stringify(
        typeEntries.map(([k, v]) => ({
          type: k,
          pct: ((v / typeTotal) * 100).toFixed(1),
        })),
      ),
    );
    html += `<div class="compare-section-pie">`;
    html += `<div class="compare-section-title" style="align-self:flex-start;width:100%">Tipe Investor</div>`;
    html += `<div class="compare-mini-pie-wrap">`;
    html += `<canvas class="compare-type-pie" data-types="${typeDataStr}" width="80" height="80"></canvas>`;
    html += `<div class="compare-ratio-legend" style="flex-wrap:wrap">`;
    typeEntries.forEach(([k, v]) => {
      const pct = ((v / typeTotal) * 100).toFixed(1).replace(".", ",");
      const label = (INVESTOR_TYPE_MAP[k] || INVESTOR_TYPE_MAP[""]).label;
      html += `<span><span class="compare-ratio-dot compare-type-dot" data-type="${k}"></span>${label} ${pct}%</span>`;
    });
    html += `</div>`;
    html += `</div>`;
    html += `</div>`;

    html += `</div>`;

    // Float
    html += `<div class="compare-section-float">`;
    html += `<div class="compare-section-title">Free Float</div>`;
    html += `<div style="font-size:var(--text-sm);font-weight:700;color:var(--text-primary)">${fmtPctSum(g.freeFloat)}</div>`;
    html += `</div>`;

    html += `</div>`;
  });

  html += `</div>`;

  // Investor overlap
  const investorMap = new Map(); // investor_name -> { stocks: [{code, pct}] }
  selectedGroups.forEach((g) => {
    for (const r of g.records) {
      if (!investorMap.has(r.investor_name))
        investorMap.set(r.investor_name, []);
      investorMap
        .get(r.investor_name)
        .push({ code: g.share_code, pct: r.percentage });
    }
  });

  const overlapping = [...investorMap.entries()]
    .filter(([, stocks]) => stocks.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  if (overlapping.length > 0) {
    html += `<div class="compare-overlap-section">`;
    html += `<div class="compare-section-title">Investor yang Sama (${overlapping.length})</div>`;
    html += `<table class="compare-overlap-table">`;
    html += `<thead><tr><th>Nama Investor</th>`;
    selectedGroups.forEach((g) => {
      html += `<th class="pct-col">${esc(g.share_code)}</th>`;
    });
    html += `</tr></thead><tbody>`;
    overlapping.forEach(([name, stocks]) => {
      html += `<tr>`;
      html += `<td title="${esc(name)}">${esc(name)}</td>`;
      selectedGroups.forEach((g) => {
        const match = stocks.find((s) => s.code === g.share_code);
        html += `<td class="pct-cell">${match ? fmtPct(match.pct) : "—"}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table>`;
    html += `</div>`;
  }

  body.innerHTML = html;
  overlay.classList.add("open");

  // Render mini pie charts (Lokal vs Asing)
  body.querySelectorAll(".compare-mini-pie").forEach((canvas) => {
    const localVal = parseFloat(canvas.dataset.local) || 0;
    const foreignVal = parseFloat(canvas.dataset.foreign) || 0;
    const unclassVal = parseFloat(canvas.dataset.unclass) || 0;
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    const localColor = isDark ? "#5eead4" : "#0f766e"; // teal - domestic
    const foreignColor = isDark ? "#fda4af" : "#9f1239"; // rose - foreign
    const unclassColor = isDark ? "#475569" : "#cbd5e1"; // slate gray
    // Sort slices biggest first
    const slices = [
      { label: "Lokal", value: localVal, color: localColor },
      { label: "Asing", value: foreignVal, color: foreignColor },
      { label: "Lainnya", value: unclassVal, color: unclassColor },
    ].sort((a, b) => b.value - a.value);
    new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: slices.map((s) => s.label),
        datasets: [
          {
            data: slices.map((s) => s.value),
            backgroundColor: slices.map((s) => s.color),
            borderWidth: 0,
          },
        ],
      },
      options: {
        responsive: false,
        cutout: "55%",
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
      },
    });
  });

  // Render type pie charts
  body.querySelectorAll(".compare-type-pie").forEach((canvas) => {
    const typeData = JSON.parse(decodeURIComponent(canvas.dataset.types));
    const labels = typeData.map(
      (d) => (INVESTOR_TYPE_MAP[d.type] || INVESTOR_TYPE_MAP[""]).label,
    );
    const values = typeData.map((d) => parseFloat(d.pct));
    const colors = typeData.map((d) => _typeColors[d.type] || _typeColors[""]);
    new Chart(canvas, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
      },
      options: {
        responsive: false,
        cutout: "55%",
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
      },
    });
  });

  // Apply type colors to legend dots
  body.querySelectorAll(".compare-type-dot").forEach((dot) => {
    dot.style.background = _typeColors[dot.dataset.type] || _typeColors[""];
  });
}

function closeComparePanel() {
  document.getElementById("comparePanelOverlay").classList.remove("open");
  // Restore floating bar visibility
  document
    .getElementById("compareFloatingBar")
    .classList.remove("compare-bar-hidden");
}

// Patch renderGroupCard to inject compare checkbox
const _origRenderGroupCard = renderGroupCard;
renderGroupCard = function (group) {
  const card = _origRenderGroupCard(group);
  // Inject compare checkbox
  const cb = document.createElement("div");
  cb.className =
    "compare-checkbox" +
    (compareSelected.has(group.share_code) ? " checked" : "");
  cb.dataset.code = group.share_code;
  cb.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleCompareStock(group.share_code);
  });
  card.appendChild(cb);
  return card;
};

// ============================================================
// NETWORK GRAPH — LOOKUP MAPS (populated in init)
// ============================================================
const stockHoldersMap = new Map(); // share_code → [{investor_name, percentage, ...}]
const investorStocksMap = new Map(); // investor_name → [{share_code, percentage, ...}]

// ============================================================
// METRICS TAB — Chart.js charts
// ============================================================
let metricsCharts = []; // track chart instances for theme updates

function getMetricsColors() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    accent: isDark ? "#4ade80" : "#15803d",
    foreign: isDark ? "#f87171" : "#b91c1c",
    unclass: isDark ? "#475569" : "#94a3b8",
    textPrimary: isDark ? "#f5f0eb" : "#1a1410",
    textSecondary: isDark ? "#b0a89e" : "#5c4f42",
    textMuted: isDark ? "#726a60" : "#9c8e80",
    gridColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
    bgCard: isDark ? "#262626" : "#faf8f5",
    // Distinct colors for investor type chart
    typeColors: isDark
      ? [
          "#4ade80",
          "#a78bfa",
          "#38bdf8",
          "#f87171",
          "#fbbf24",
          "#f472b6",
          "#6ee7b7",
          "#fb923c",
          "#60a5fa",
          "#94a3b8",
        ]
      : [
          "#15803d",
          "#7c3aed",
          "#0284c7",
          "#b91c1c",
          "#d97706",
          "#db2777",
          "#059669",
          "#ea580c",
          "#2563eb",
          "#64748b",
        ],
  };
}

function renderMetricsTab(data) {
  const colors = getMetricsColors();
  const total = data.length;
  const foreign = data.filter((d) => d.local_foreign === "F").length;
  const local = data.filter((d) => d.local_foreign === "D").length;
  const unclass = data.filter((d) => !d.local_foreign).length;
  const issuers = new Set(data.map((d) => d.share_code)).size;

  // KPI Row 1
  document.getElementById("mKpiIssuers").textContent = fmtNum(issuers);
  document.getElementById("mKpiInvestors").textContent = fmtNum(total);
  document.getElementById("mKpiForeign").textContent = fmtNum(foreign);
  document.getElementById("mKpiForeignPct").textContent =
    ((foreign / total) * 100).toFixed(1).replace(".", ",") + "% dari total";
  document.getElementById("mKpiLocal").textContent = fmtNum(local);
  document.getElementById("mKpiLocalPct").textContent =
    ((local / total) * 100).toFixed(1).replace(".", ",") + "% dari total";
  document.getElementById("mKpiUnclass").textContent = fmtNum(unclass);
  document.getElementById("mKpiUnclassPct").textContent =
    ((unclass / total) * 100).toFixed(1).replace(".", ",") + "% dari total";

  // KPI: Investor stats
  const invMap = new Map();
  for (const rec of data) {
    if (!invMap.has(rec.investor_name))
      invMap.set(rec.investor_name, new Set());
    invMap.get(rec.investor_name).add(rec.share_code);
  }
  const invTotal = invMap.size;
  const invMulti = [...invMap.values()].filter((s) => s.size >= 2).length;
  const invMax =
    invTotal > 0 ? Math.max(...[...invMap.values()].map((s) => s.size)) : 0;

  document.getElementById("mKpiUniqueInv").textContent = fmtNum(invTotal);
  document.getElementById("mInvKpiMulti").textContent = fmtNum(invMulti);
  document.getElementById("mInvKpiMax").textContent = fmtNum(invMax);
  // Find the investor with max stocks for the sub label
  if (invMax > 0) {
    const maxInv = [...invMap.entries()].find(([, s]) => s.size === invMax);
    if (maxInv) {
      const subEl = document.getElementById("mInvKpiMaxSub");
      if (subEl)
        subEl.textContent =
          maxInv[0].length > 30 ? maxInv[0].slice(0, 28) + "..." : maxInv[0];
    }
  }

  // Destroy old charts
  metricsCharts.forEach((c) => c.destroy());
  metricsCharts = [];

  // Chart 1: Lokal vs Asing doughnut — sorted biggest first
  const laData = [
    { label: "Lokal", value: local, color: colors.accent },
    { label: "Asing", value: foreign, color: colors.foreign },
    { label: "Tidak Terklasifikasi", value: unclass, color: colors.unclass },
  ].sort((a, b) => b.value - a.value);
  const ctx1 = document.getElementById("chartLokalAsing");
  metricsCharts.push(
    new Chart(ctx1, {
      type: "doughnut",
      data: {
        labels: laData.map((d) => d.label),
        datasets: [
          {
            data: laData.map((d) => d.value),
            backgroundColor: laData.map((d) => d.color),
            borderWidth: 2,
            borderColor: colors.bgCard,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "45%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: colors.textSecondary,
              font: { size: 11, family: "'Inter', sans-serif" },
              padding: 12,
              usePointStyle: true,
              pointStyleWidth: 8,
            },
          },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                const val = ctx.parsed;
                const pct = ((val / total) * 100).toFixed(1).replace(".", ",");
                return ` ${ctx.label}: ${fmtNum(val)} (${pct}%)`;
              },
            },
          },
        },
      },
    }),
  );

  // Chart 2: Investor Type doughnut
  const typeCounts = {};
  const TYPE_LABELS = {
    CP: "Perusahaan",
    IB: "Bank",
    IC: "Asuransi",
    ID: "Individu",
    IS: "Sekuritas",
    MF: "Reksa Dana",
    PF: "Dana Pensiun",
    SC: "Kustodian",
    FD: "Yayasan",
    OT: "Lainnya",
  };
  for (const rec of data) {
    const t = rec.investor_type || "OT";
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
  const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const typeLabels = typeEntries.map(([k]) => TYPE_LABELS[k] || k);
  const typeValues = typeEntries.map(([, v]) => v);

  const ctx2 = document.getElementById("chartInvestorType");
  metricsCharts.push(
    new Chart(ctx2, {
      type: "doughnut",
      data: {
        labels: typeLabels,
        datasets: [
          {
            data: typeValues,
            backgroundColor: colors.typeColors.slice(0, typeEntries.length),
            borderWidth: 2,
            borderColor: colors.bgCard,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "45%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: colors.textSecondary,
              font: { size: 10, family: "'Inter', sans-serif" },
              padding: 8,
              usePointStyle: true,
              pointStyleWidth: 8,
            },
          },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                const val = ctx.parsed;
                const pct = ((val / total) * 100).toFixed(1).replace(".", ",");
                return ` ${ctx.label}: ${fmtNum(val)} (${pct}%)`;
              },
            },
          },
        },
      },
    }),
  );

  // Chart 2b: AUM by Local vs Foreign doughnut
  const aumByLF = { D: 0, F: 0, other: 0 };
  for (const rec of data) {
    const price = PRICE_DATA[rec.share_code]?.p || 0;
    const value = rec.total_holding_shares * price;
    const lf = rec.local_foreign || "other";
    aumByLF[lf] += value;
  }
  const aumLFData = [
    { label: "Lokal", value: aumByLF.D, color: colors.accent },
    { label: "Asing", value: aumByLF.F, color: colors.foreign },
    {
      label: "Tidak Terklasifikasi",
      value: aumByLF.other,
      color: colors.unclass,
    },
  ]
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const totalAUM = aumLFData.reduce((sum, d) => sum + d.value, 0);

  const ctx2b = document.getElementById("chartAUMDistribution");
  metricsCharts.push(
    new Chart(ctx2b, {
      type: "doughnut",
      data: {
        labels: aumLFData.map((d) => d.label),
        datasets: [
          {
            data: aumLFData.map((d) => d.value),
            backgroundColor: aumLFData.map((d) => d.color),
            borderWidth: 2,
            borderColor: colors.bgCard,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "45%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: colors.textSecondary,
              font: { size: 11, family: "'Inter', sans-serif" },
              padding: 12,
              usePointStyle: true,
              pointStyleWidth: 8,
            },
          },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                const val = ctx.parsed;
                const pct = ((val / totalAUM) * 100)
                  .toFixed(1)
                  .replace(".", ",");
                return ` ${ctx.label}: ${fmtNum(val)} IDR (${pct}%)`;
              },
            },
          },
        },
      },
    }),
  );

  // Chart 2c: AUM by Investor Type doughnut
  const aumByType = {};
  for (const rec of data) {
    const price = PRICE_DATA[rec.share_code]?.p || 0;
    const value = rec.total_holding_shares * price;
    const t = rec.investor_type || "OT";
    aumByType[t] = (aumByType[t] || 0) + value;
  }
  const aumTypeEntries = Object.entries(aumByType).sort((a, b) => b[1] - a[1]);
  const aumTypeLabels = aumTypeEntries.map(([k]) => TYPE_LABELS[k] || k);
  const aumTypeValues = aumTypeEntries.map(([, v]) => v);
  const totalAUMType = aumTypeValues.reduce((sum, v) => sum + v, 0);

  const ctx2c = document.getElementById("chartAUMCategories");
  metricsCharts.push(
    new Chart(ctx2c, {
      type: "doughnut",
      data: {
        labels: aumTypeLabels,
        datasets: [
          {
            data: aumTypeValues,
            backgroundColor: colors.typeColors.slice(0, aumTypeEntries.length),
            borderWidth: 2,
            borderColor: colors.bgCard,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "45%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: colors.textSecondary,
              font: { size: 10, family: "'Inter', sans-serif" },
              padding: 8,
              usePointStyle: true,
              pointStyleWidth: 8,
            },
          },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                const val = ctx.parsed;
                const pct = ((val / totalAUMType) * 100)
                  .toFixed(1)
                  .replace(".", ",");
                return ` ${ctx.label}: ${fmtNum(val)} IDR (${pct}%)`;
              },
            },
          },
        },
      },
    }),
  );

  // Chart 3: Top 20 Investors - horizontal bar (with tooltip stock codes + click + hover cursor)
  const investorStockCounts = new Map();
  for (const rec of data) {
    if (!investorStockCounts.has(rec.investor_name))
      investorStockCounts.set(rec.investor_name, new Set());
    investorStockCounts.get(rec.investor_name).add(rec.share_code);
  }
  const top20 = [...investorStockCounts.entries()]
    .map(([name, codes]) => ({
      name,
      count: codes.size,
      codes: [...codes].sort(),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .reverse(); // reverse for horizontal bar (bottom to top)

  const ctx3 = document.getElementById("chartTop20Investors");
  metricsCharts.push(
    new Chart(ctx3, {
      type: "bar",
      data: {
        labels: top20.map((d) => d.name),
        datasets: [
          {
            data: top20.map((d) => d.count),
            backgroundColor: colors.accent,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        onClick: function (event, elements) {
          if (elements.length > 0) {
            const idx = elements[0].index;
            const investorName = top20[idx].name;
            navigateToInvestor(investorName);
          }
        },
        onHover: function (event, elements) {
          event.native.target.style.cursor =
            elements.length > 0 ? "pointer" : "default";
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              title: function (items) {
                return items[0].label;
              },
              label: function (ctx) {
                return ` ${ctx.parsed.x} saham`;
              },
              afterBody: function (items) {
                const idx = items[0].dataIndex;
                const codes = top20[idx].codes;
                const lines = ["", "Saham:"];
                for (let i = 0; i < codes.length; i += 6) {
                  lines.push(codes.slice(i, i + 6).join(", "));
                }
                return lines;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: colors.gridColor },
            ticks: {
              color: colors.textMuted,
              font: { size: 11, family: "'Inter', sans-serif" },
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: colors.textSecondary,
              font: { size: 10, family: "'Inter', sans-serif" },
              autoSkip: false,
            },
          },
        },
      },
    }),
  );

  // Chart 3b: Top 20 Investors by AUM - horizontal bar (with tooltip stock codes + click + hover cursor)
  const investorAUM = new Map();
  for (const rec of data) {
    const price = PRICE_DATA[rec.share_code]?.p || 0;
    const value = rec.total_holding_shares * price;
    if (!investorAUM.has(rec.investor_name))
      investorAUM.set(rec.investor_name, { aum: 0, codes: new Set() });
    investorAUM.get(rec.investor_name).aum += value;
    investorAUM.get(rec.investor_name).codes.add(rec.share_code);
  }
  const top20AUM = [...investorAUM.entries()]
    .map(([name, data]) => ({
      name,
      aum: data.aum,
      codes: [...data.codes].sort(),
    }))
    .sort((a, b) => b.aum - a.aum)
    .slice(0, 20)
    .reverse(); // reverse for horizontal bar (bottom to top)

  const ctx3b = document.getElementById("chartTop20InvestorsAUM");
  metricsCharts.push(
    new Chart(ctx3b, {
      type: "bar",
      data: {
        labels: top20AUM.map((d) => d.name),
        datasets: [
          {
            data: top20AUM.map((d) => d.aum),
            backgroundColor: colors.accent,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        onClick: function (event, elements) {
          if (elements.length > 0) {
            const idx = elements[0].index;
            const investorName = top20AUM[idx].name;
            navigateToInvestor(investorName);
          }
        },
        onHover: function (event, elements) {
          event.native.target.style.cursor =
            elements.length > 0 ? "pointer" : "default";
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              title: function (items) {
                return items[0].label;
              },
              label: function (ctx) {
                return ` ${fmtNum(ctx.parsed.x)} IDR`;
              },
              afterBody: function (items) {
                const idx = items[0].dataIndex;
                const codes = top20AUM[idx].codes;
                const lines = ["", "Saham:"];
                for (let i = 0; i < codes.length; i += 6) {
                  lines.push(codes.slice(i, i + 6).join(", "));
                }
                return lines;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: colors.gridColor },
            ticks: {
              color: colors.textMuted,
              font: { size: 11, family: "'Inter', sans-serif" },
              callback: function (value) {
                return fmtNum(value);
              },
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: colors.textSecondary,
              font: { size: 10, family: "'Inter', sans-serif" },
              autoSkip: false,
            },
          },
        },
      },
    }),
  );

  // Chart 4: Country breakdown - horizontal bar
  const normalizeMap = {
    INDONESIA: "Indonesia",
    INDONESIAN: "Indonesia",
    SINGAPORE: "Singapore",
    SINGAPOREAN: "Singapore",
    MALAYSIA: "Malaysia",
    MALAYSIAN: "Malaysia",
    CHINA: "China",
    CHINESE: "China",
    JAPAN: "Japan",
    JAPANESE: "Japan",
    KOREA: "Korea",
    KOREAN: "Korea",
    "SOUTH KOREA": "Korea",
    "SOUTH KOREAN": "Korea",
    INDIA: "India",
    INDIAN: "India",
    THAILAND: "Thailand",
    THAI: "Thailand",
    USA: "United States",
    "UNITED STATES": "United States",
    AMERICAN: "United States",
    US: "United States",
    UK: "United Kingdom",
    "UNITED KINGDOM": "United Kingdom",
    BRITISH: "United Kingdom",
    AUSTRALIA: "Australia",
    AUSTRALIAN: "Australia",
    NETHERLANDS: "Netherlands",
    DUTCH: "Netherlands",
    GERMANY: "Germany",
    GERMAN: "Germany",
    FRANCE: "France",
    FRENCH: "France",
    PHILIPPINES: "Philippines",
    PHILIPPINE: "Philippines",
    FILIPINO: "Philippines",
    TAIWAN: "Taiwan",
    TAIWANESE: "Taiwan",
    "HONG KONG": "Hong Kong",
    VIETNAM: "Vietnam",
    VIETNAMESE: "Vietnam",
    MYANMAR: "Myanmar",
    CAMBODIA: "Cambodia",
    CAMBODIAN: "Cambodia",
    BRUNEI: "Brunei",
    LUXEMBOURG: "Luxembourg",
    SWITZERLAND: "Switzerland",
    SWISS: "Switzerland",
    CANADA: "Canada",
    CANADIAN: "Canada",
    "NEW ZEALAND": "New Zealand",
    NORWAY: "Norway",
    NORWEGIAN: "Norway",
    SWEDEN: "Sweden",
    SWEDISH: "Sweden",
    DENMARK: "Denmark",
    DANISH: "Denmark",
  };
  const countryCounts = new Map();
  for (const rec of data) {
    const raw = (rec.nationality || rec.domicile || "").trim().toUpperCase();
    if (!raw) continue;
    const normalized =
      normalizeMap[raw] || raw.charAt(0) + raw.slice(1).toLowerCase();
    countryCounts.set(normalized, (countryCounts.get(normalized) || 0) + 1);
  }
  const top15countries = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .reverse();

  const ctx4 = document.getElementById("chartCountryBreakdown");
  metricsCharts.push(
    new Chart(ctx4, {
      type: "bar",
      data: {
        labels: top15countries.map((d) => d[0]),
        datasets: [
          {
            data: top15countries.map((d) => d[1]),
            backgroundColor: top15countries.map((d) =>
              d[0] === "Indonesia" ? colors.accent : colors.accent + "99",
            ),
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                const countryTotal = [...countryCounts.values()].reduce(
                  (a, b) => a + b,
                  0,
                );
                const pct = ((ctx.parsed.x / countryTotal) * 100)
                  .toFixed(1)
                  .replace(".", ",");
                return ` ${fmtNum(ctx.parsed.x)} (${pct}%)`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: colors.gridColor },
            ticks: {
              color: colors.textMuted,
              font: { size: 11, family: "'Inter', sans-serif" },
              callback: function (v) {
                return fmtNum(v);
              },
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: colors.textSecondary,
              font: { size: 11, family: "'Inter', sans-serif" },
              autoSkip: false,
            },
          },
        },
      },
    }),
  );

  // Chart 5: Distribusi Kepemilikan — histogram of ownership brackets
  const brackets = [
    { label: "0-5%", min: 0, max: 5 },
    { label: "5-10%", min: 5, max: 10 },
    { label: "10-20%", min: 10, max: 20 },
    { label: "20-50%", min: 20, max: 50 },
    { label: "50-100%", min: 50, max: 100.01 },
  ];
  const bracketCounts = brackets.map(() => 0);
  for (const rec of data) {
    const pct = parseFloat(rec.percentage) || 0;
    for (let i = 0; i < brackets.length; i++) {
      if (pct >= brackets[i].min && pct < brackets[i].max) {
        bracketCounts[i]++;
        break;
      }
    }
  }
  const ctx5 = document.getElementById("chartOwnershipDist");
  metricsCharts.push(
    new Chart(ctx5, {
      type: "bar",
      data: {
        labels: brackets.map((b) => b.label),
        datasets: [
          {
            data: bracketCounts,
            backgroundColor: [
              colors.accent,
              colors.accent + "cc",
              colors.accent + "99",
              colors.foreign + "cc",
              colors.foreign,
            ],
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                const pct = ((ctx.parsed.y / total) * 100)
                  .toFixed(1)
                  .replace(".", ",");
                return ` ${fmtNum(ctx.parsed.y)} record (${pct}%)`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: colors.textSecondary,
              font: { size: 11, family: "'Inter', sans-serif" },
            },
          },
          y: {
            grid: { color: colors.gridColor },
            ticks: {
              color: colors.textMuted,
              font: { size: 11, family: "'Inter', sans-serif" },
              callback: function (v) {
                return fmtNum(v);
              },
            },
          },
        },
      },
    }),
  );

  // Chart 6: Top 20 Saham Paling Banyak Investor — horizontal bar
  const stockInvestorCounts = new Map();
  for (const rec of data) {
    stockInvestorCounts.set(
      rec.share_code,
      (stockInvestorCounts.get(rec.share_code) || 0) + 1,
    );
  }
  const top10stocks = [...stockInvestorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .reverse();

  const ctx6 = document.getElementById("chartTop20Stocks");
  metricsCharts.push(
    new Chart(ctx6, {
      type: "bar",
      data: {
        labels: top10stocks.map((d) => d[0]),
        datasets: [
          {
            data: top10stocks.map((d) => d[1]),
            backgroundColor: colors.accent,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              label: function (ctx) {
                return ` ${fmtNum(ctx.parsed.x)} investor`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: colors.gridColor },
            ticks: {
              color: colors.textMuted,
              font: { size: 11, family: "'Inter', sans-serif" },
              callback: function (v) {
                return fmtNum(v);
              },
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: colors.textSecondary,
              font: { size: 11, family: "'Inter', sans-serif" },
              autoSkip: false,
            },
          },
        },
      },
    }),
  );

  // Chart 7: Jejak Konglo & PEP di Pasar
  // Cross-reference PEP_DATA and CONGLO_DATA against actual KSEI records
  const pepNames =
    typeof PEP_DATA !== "undefined"
      ? new Set(Object.keys(PEP_DATA).map((n) => n.toUpperCase()))
      : new Set();
  const congloNames =
    typeof CONGLO_DATA !== "undefined"
      ? new Set(Object.keys(CONGLO_DATA).map((n) => n.toUpperCase()))
      : new Set();

  // Exclusion list — not actual konglo/tycoons
  const kongloExcluded = new Set(
    ["LO KHENG  HONG. DRS", "LO KHENG HONG. DRS", "LO KHENG HONG"].map((n) =>
      n.toUpperCase(),
    ),
  );

  // Build group footprint: group_name -> { stocks: Set, totalPct: number, type: 'PEP'|'Konglo' }
  const groupFootprint = new Map();

  // Helper to get group name for a person
  function getPersonGroup(name) {
    const upper = name.toUpperCase();
    if (kongloExcluded.has(upper)) return null;
    if (
      typeof PEP_DATA !== "undefined" &&
      PEP_DATA[upper] &&
      PEP_DATA[upper].group
    )
      return { group: PEP_DATA[upper].group, type: "PEP" };
    if (typeof PEP_DATA !== "undefined") {
      for (const [k, v] of Object.entries(PEP_DATA)) {
        if (k.toUpperCase() === upper && v.group)
          return { group: v.group, type: "PEP" };
      }
    }
    if (
      typeof CONGLO_DATA !== "undefined" &&
      CONGLO_DATA[upper] &&
      CONGLO_DATA[upper].group
    )
      return { group: CONGLO_DATA[upper].group, type: "Konglo" };
    if (typeof CONGLO_DATA !== "undefined") {
      for (const [k, v] of Object.entries(CONGLO_DATA)) {
        if (k.toUpperCase() === upper && v.group)
          return { group: v.group, type: "Konglo" };
      }
    }
    // Standalone PEP or Conglo without group
    if (pepNames.has(upper)) return { group: upper, type: "PEP" };
    if (congloNames.has(upper)) return { group: upper, type: "Konglo" };
    return null;
  }

  for (const rec of data) {
    const info = getPersonGroup(rec.investor_name);
    if (!info) continue;
    if (!groupFootprint.has(info.group))
      groupFootprint.set(info.group, {
        stocks: new Set(),
        totalPct: 0,
        recordCount: 0,
        type: info.type,
        stockPcts: new Map(),
      });
    const entry = groupFootprint.get(info.group);
    entry.stocks.add(rec.share_code);
    entry.totalPct += rec.percentage || 0;
    entry.recordCount += 1;
    // Accumulate per-stock pct for tooltip
    entry.stockPcts.set(
      rec.share_code,
      (entry.stockPcts.get(rec.share_code) || 0) + (rec.percentage || 0),
    );
  }

  const footprintData = [...groupFootprint.entries()]
    .map(([group, d]) => ({
      group,
      stockCount: d.stocks.size,
      totalPct: d.totalPct / (d.recordCount || 1),
      type: d.type,
      stockList: [...d.stockPcts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([code, pct]) => ({ code, pct })),
    }))
    .sort((a, b) => b.stockCount - a.stockCount)
    .slice(0, 20)
    .reverse(); // reverse for horizontal bar (biggest at top)

  const ctx7 = document.getElementById("chartCongloPepFootprint");
  metricsCharts.push(
    new Chart(ctx7, {
      type: "bar",
      data: {
        labels: footprintData.map((d) => d.group),
        datasets: [
          {
            label: "Jumlah Saham",
            data: footprintData.map((d) => d.stockCount),
            backgroundColor: footprintData.map((d) =>
              d.type === "PEP" ? "#d97706" : colors.accent,
            ),
            borderColor: footprintData.map((d) =>
              d.type === "PEP" ? "#b45309" : colors.accentDark || colors.accent,
            ),
            borderWidth: 1,
            borderRadius: 3,
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              title: function (items) {
                const d = footprintData[items[0].dataIndex];
                return d.group + " (" + d.type + ")";
              },
              label: function (ctx) {
                const d = footprintData[ctx.dataIndex];
                const lines = [
                  `Saham dimiliki: ${d.stockCount}`,
                  `Rata-rata kepemilikan: ${d.totalPct.toFixed(2).replace(".", ",")}%`,
                  "",
                ];
                const maxShow = 15;
                d.stockList.slice(0, maxShow).forEach((s) => {
                  lines.push(
                    `  ${s.code}: ${s.pct.toFixed(2).replace(".", ",")}%`,
                  );
                });
                if (d.stockList.length > maxShow)
                  lines.push(`  ...+${d.stockList.length - maxShow} lainnya`);
                return lines;
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Jumlah Saham",
              color: colors.textMuted,
              font: { size: 11 },
            },
            grid: { color: colors.gridColor },
            ticks: { color: colors.textMuted, font: { size: 10 }, stepSize: 1 },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: footprintData.map((d) =>
                d.type === "PEP" ? "#d97706" : colors.textSecondary,
              ),
              font: { size: 10 },
              autoSkip: false,
            },
          },
        },
      },
    }),
  );

  // Chart 8: Bubble — Diversifikasi Investor (top 50 by stock count)
  const invDivMap = new Map();
  for (const rec of data) {
    if (!invDivMap.has(rec.investor_name))
      invDivMap.set(rec.investor_name, { codes: new Set(), pcts: [] });
    const entry = invDivMap.get(rec.investor_name);
    entry.codes.add(rec.share_code);
    entry.pcts.push(rec.percentage || 0);
  }
  const invDivData = [...invDivMap.entries()]
    .map(([name, d]) => ({
      name,
      stockCount: d.codes.size,
      avgPct: d.pcts.reduce((a, b) => a + b, 0) / d.pcts.length,
      totalRecs: d.pcts.length,
    }))
    .filter((d) => d.stockCount >= 2)
    .sort((a, b) => b.stockCount - a.stockCount)
    .slice(0, 50);

  const maxBubbleRecs = Math.max(...invDivData.map((d) => d.totalRecs), 1);

  const ctx8 = document.getElementById("chartDiversificationBubble");
  metricsCharts.push(
    new Chart(ctx8, {
      type: "bubble",
      data: {
        datasets: [
          {
            label: "Investor",
            data: invDivData.map((d) => ({
              x: d.stockCount,
              y: d.avgPct,
              r: Math.max(4, Math.min(25, (d.totalRecs / maxBubbleRecs) * 25)),
              name: d.name,
              recs: d.totalRecs,
            })),
            backgroundColor: colors.accent + "55",
            borderColor: colors.accent,
            borderWidth: 1.5,
            hoverBackgroundColor: colors.accent + "aa",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              title: function (items) {
                return items[0].raw.name;
              },
              label: function (ctx) {
                return [
                  `Saham: ${ctx.raw.x}`,
                  `Rata-rata: ${ctx.raw.y.toFixed(2).replace(".", ",")}%`,
                  `Record: ${ctx.raw.recs}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Jumlah Saham Berbeda",
              color: colors.textMuted,
              font: { size: 11 },
            },
            grid: { color: colors.gridColor },
            ticks: { color: colors.textMuted, font: { size: 10 } },
          },
          y: {
            title: {
              display: true,
              text: "Rata-rata Kepemilikan (%)",
              color: colors.textMuted,
              font: { size: 11 },
            },
            grid: { color: colors.gridColor },
            ticks: {
              color: colors.textMuted,
              font: { size: 10 },
              callback: (v) => v.toFixed(1).replace(".", ",") + "%",
            },
          },
        },
      },
    }),
  );

  // Chart 9: Top 20 Saham Kepemilikan Konglo Tertinggi (horizontal bar)
  // For each stock in KONGLO_GROUPS, compute total konglo/PEP ownership %
  if (typeof KONGLO_GROUPS !== "undefined") {
    const stockKongloMap = new Map(); // ticker -> { groups: Set }
    for (const kg of KONGLO_GROUPS) {
      const allTickers = [
        ...(kg.main || []),
        ...(kg.small_micro || []),
        ...(kg.investor_sharing || []),
      ];
      const uniqueTickers = [...new Set(allTickers)];
      for (const ticker of uniqueTickers) {
        if (!stockKongloMap.has(ticker))
          stockKongloMap.set(ticker, { groups: new Set() });
        stockKongloMap.get(ticker).groups.add(kg.name);
      }
    }

    // Cross-reference with KSEI data for actual ownership %
    const stockKongloOwnership = new Map(); // ticker -> { totalPct, groups: Set, investors: [{name, pct}] }
    for (const rec of data) {
      const code = rec.share_code;
      if (!stockKongloMap.has(code)) continue;
      const upper = rec.investor_name.toUpperCase();
      if (kongloExcluded.has(upper)) continue;
      let isCongloInvestor = false;
      if (typeof CONGLO_DATA !== "undefined") {
        for (const k of Object.keys(CONGLO_DATA)) {
          if (k.toUpperCase() === upper) {
            isCongloInvestor = true;
            break;
          }
        }
      }
      if (typeof PEP_DATA !== "undefined" && !isCongloInvestor) {
        for (const k of Object.keys(PEP_DATA)) {
          if (k.toUpperCase() === upper) {
            isCongloInvestor = true;
            break;
          }
        }
      }
      if (!isCongloInvestor) continue;
      if (!stockKongloOwnership.has(code))
        stockKongloOwnership.set(code, {
          totalPct: 0,
          groups: new Set(),
          investors: [],
        });
      const entry = stockKongloOwnership.get(code);
      entry.totalPct += rec.percentage || 0;
      stockKongloMap.get(code).groups.forEach((g) => entry.groups.add(g));
      entry.investors.push({
        name: rec.investor_name,
        pct: rec.percentage || 0,
      });
    }

    const topKongloStocks = [...stockKongloOwnership.entries()]
      .map(([ticker, d]) => ({
        ticker,
        totalPct: d.totalPct,
        groupCount: d.groups.size,
        groups: [...d.groups],
        investors: d.investors.sort((a, b) => b.pct - a.pct),
      }))
      .filter((d) => d.totalPct > 0)
      .sort((a, b) => b.totalPct - a.totalPct)
      .slice(0, 20)
      .reverse(); // biggest at top for horizontal bar

    const ctx9 = document.getElementById("chartTopKongloStocks");
    metricsCharts.push(
      new Chart(ctx9, {
        type: "bar",
        data: {
          labels: topKongloStocks.map((d) => d.ticker),
          datasets: [
            {
              label: "Total Kepemilikan (%)",
              data: topKongloStocks.map((d) => d.totalPct),
              backgroundColor: colors.accent,
              borderRadius: 3,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: colors.bgCard,
              titleColor: colors.textPrimary,
              bodyColor: colors.textSecondary,
              borderColor: colors.gridColor,
              borderWidth: 1,
              callbacks: {
                title: function (items) {
                  return items[0].label;
                },
                label: function (ctx) {
                  const d = topKongloStocks[ctx.dataIndex];
                  const lines = [
                    `Total kepemilikan: ${d.totalPct.toFixed(2).replace(".", ",")}%`,
                    `Grup konglo: ${d.groupCount}`,
                    "",
                  ];
                  d.investors.slice(0, 8).forEach((inv) => {
                    lines.push(
                      `  ${inv.name}: ${inv.pct.toFixed(2).replace(".", ",")}%`,
                    );
                  });
                  if (d.investors.length > 8)
                    lines.push(`  ...+${d.investors.length - 8} lainnya`);
                  return lines;
                },
              },
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Total Kepemilikan Konglo/PEP (%)",
                color: colors.textMuted,
                font: { size: 11 },
              },
              grid: { color: colors.gridColor },
              ticks: {
                color: colors.textMuted,
                font: { size: 10 },
                callback: (v) => v.toFixed(0) + "%",
              },
            },
            y: {
              grid: { display: false },
              ticks: {
                color: colors.textSecondary,
                font: { size: 10, family: "'Inter', sans-serif" },
                autoSkip: false,
              },
            },
          },
        },
      }),
    );

    // Chart 10: Total Kepemilikan per Grup Konglo (horizontal bar)
    // Reuse groupFootprint data but filter only Konglo type, add KONGLO_GROUPS-based data
    const kongloOwnershipData = [...groupFootprint.entries()]
      .map(([group, d]) => ({
        group,
        totalPct: d.totalPct,
        stockCount: d.stocks.size,
        type: d.type,
      }))
      .sort((a, b) => b.totalPct - a.totalPct)
      .slice(0, 20)
      .reverse(); // reverse for horizontal bar (biggest at top)

    const ctx10 = document.getElementById("chartKongloTotalOwnership");
    metricsCharts.push(
      new Chart(ctx10, {
        type: "bar",
        data: {
          labels: kongloOwnershipData.map((d) => d.group),
          datasets: [
            {
              label: "Total Kepemilikan (%)",
              data: kongloOwnershipData.map((d) => d.totalPct),
              backgroundColor: kongloOwnershipData.map((d) =>
                d.type === "PEP" ? "#d97706" : colors.accent,
              ),
              borderColor: kongloOwnershipData.map((d) =>
                d.type === "PEP"
                  ? "#b45309"
                  : colors.accentDark || colors.accent,
              ),
              borderWidth: 1,
              borderRadius: 3,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: colors.bgCard,
              titleColor: colors.textPrimary,
              bodyColor: colors.textSecondary,
              borderColor: colors.gridColor,
              borderWidth: 1,
              callbacks: {
                title: function (items) {
                  const d = kongloOwnershipData[items[0].dataIndex];
                  return d.group + " (" + d.type + ")";
                },
                label: function (ctx) {
                  const d = kongloOwnershipData[ctx.dataIndex];
                  return [
                    `Total kepemilikan: ${d.totalPct.toFixed(2).replace(".", ",")}%`,
                    `Jumlah saham: ${d.stockCount}`,
                  ];
                },
              },
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Total Kepemilikan (%)",
                color: colors.textMuted,
                font: { size: 11 },
              },
              grid: { color: colors.gridColor },
              ticks: {
                color: colors.textMuted,
                font: { size: 10 },
                callback: (v) => v.toFixed(0) + "%",
              },
            },
            y: {
              grid: { display: false },
              ticks: {
                color: kongloOwnershipData.map((d) =>
                  d.type === "PEP" ? "#d97706" : colors.textSecondary,
                ),
                font: { size: 10 },
                autoSkip: false,
              },
            },
          },
        },
      }),
    );
  }

  // ========== Chart 11: Sector Distribution (horizontal bar) ==========
  if (typeof SECTOR_DATA !== "undefined") {
    const sectorCount = new Map();
    for (const g of state.allGroups) {
      const s = g.sector || "Tidak Diketahui";
      sectorCount.set(s, (sectorCount.get(s) || 0) + 1);
    }
    const sectorDistData = [...sectorCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .reverse(); // biggest at top

    const sectorPalette = [
      colors.accent,
      "#d97706",
      "#0f766e",
      "#7c3aed",
      "#dc2626",
      "#0369a1",
      "#15803d",
      "#9333ea",
      "#b91c1c",
      "#0891b2",
      "#4338ca",
      "#be123c",
    ];

    const ctx11 = document.getElementById("chartSectorDist");
    metricsCharts.push(
      new Chart(ctx11, {
        type: "bar",
        data: {
          labels: sectorDistData.map((d) => d[0]),
          datasets: [
            {
              label: "Jumlah Emiten",
              data: sectorDistData.map((d) => d[1]),
              backgroundColor: sectorDistData.map(
                (_, i) => sectorPalette[i % sectorPalette.length],
              ),
              borderRadius: 3,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: colors.bgCard,
              titleColor: colors.textPrimary,
              bodyColor: colors.textSecondary,
              borderColor: colors.gridColor,
              borderWidth: 1,
              callbacks: {
                label: function (ctx) {
                  const total = sectorDistData.reduce((s, d) => s + d[1], 0);
                  const pct = ((ctx.parsed.x / total) * 100)
                    .toFixed(1)
                    .replace(".", ",");
                  return ` ${ctx.parsed.x} emiten (${pct}%)`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: { color: colors.gridColor },
              ticks: { color: colors.textMuted, font: { size: 10 } },
            },
            y: {
              grid: { display: false },
              ticks: {
                color: colors.textSecondary,
                font: { size: 10 },
                autoSkip: false,
              },
            },
          },
        },
      }),
    );
  }

  // ========== Chart 12: CCS Distribution (histogram-style bar) ==========
  const ccsBuckets = [
    { label: "0–10", min: 0, max: 11, color: "#16a34a" },
    { label: "11–25", min: 11, max: 26, color: "#22c55e" },
    { label: "26–40", min: 26, max: 41, color: "#facc15" },
    { label: "41–55", min: 41, max: 56, color: "#f59e0b" },
    { label: "56–70", min: 56, max: 71, color: "#f87171" },
    { label: "71–85", min: 71, max: 86, color: "#ef4444" },
    { label: "86–100", min: 86, max: 101, color: "#dc2626" },
  ];
  const ccsCounts = ccsBuckets.map((b) => ({
    ...b,
    count: state.allGroups.filter((g) => g.hhi >= b.min && g.hhi < b.max)
      .length,
  }));

  const ctx12 = document.getElementById("chartHHIDist");
  metricsCharts.push(
    new Chart(ctx12, {
      type: "bar",
      data: {
        labels: ccsCounts.map((b) => b.label),
        datasets: [
          {
            label: "Jumlah Emiten",
            data: ccsCounts.map((b) => b.count),
            backgroundColor: ccsCounts.map((b) => b.color),
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors.bgCard,
            titleColor: colors.textPrimary,
            bodyColor: colors.textSecondary,
            borderColor: colors.gridColor,
            borderWidth: 1,
            callbacks: {
              title: function (items) {
                return "CCS " + items[0].label;
              },
              label: function (ctx) {
                var total = state.allGroups.length;
                var pct = ((ctx.parsed.y / total) * 100)
                  .toFixed(1)
                  .replace(".", ",");
                return " " + ctx.parsed.y + " emiten (" + pct + "%)";
              },
            },
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Rentang CCS",
              color: colors.textMuted,
              font: { size: 11 },
            },
            grid: { display: false },
            ticks: { color: colors.textSecondary, font: { size: 10 } },
          },
          y: {
            title: {
              display: true,
              text: "Jumlah Emiten",
              color: colors.textMuted,
              font: { size: 11 },
            },
            grid: { color: colors.gridColor },
            ticks: { color: colors.textMuted, font: { size: 10 } },
          },
        },
      },
    }),
  );

  // ========== Chart 13: Average CCS per Sector (horizontal bar) ==========
  if (typeof SECTOR_DATA !== "undefined") {
    const sectorCCSMap = new Map();
    for (const g of state.allGroups) {
      if (!g.sector) continue;
      if (!sectorCCSMap.has(g.sector))
        sectorCCSMap.set(g.sector, { sum: 0, count: 0, values: [] });
      const entry = sectorCCSMap.get(g.sector);
      entry.sum += g.hhi;
      entry.count++;
      entry.values.push(g.hhi);
    }
    const sectorCCSData = [...sectorCCSMap.entries()]
      .map(([sector, d]) => ({
        sector,
        avg: Math.round(d.sum / d.count),
        count: d.count,
        median: d.values.sort((a, b) => a - b)[Math.floor(d.values.length / 2)],
        min: Math.min(...d.values),
        max: Math.max(...d.values),
      }))
      .sort((a, b) => b.avg - a.avg)
      .reverse();

    function ccsBarColor(avg) {
      if (avg <= 25) return "#16a34a";
      if (avg <= 55) return "#d97706";
      return "#dc2626";
    }

    const ctx13 = document.getElementById("chartSectorHHI");
    metricsCharts.push(
      new Chart(ctx13, {
        type: "bar",
        data: {
          labels: sectorCCSData.map((d) => d.sector),
          datasets: [
            {
              label: "Rata-rata CCS",
              data: sectorCCSData.map((d) => d.avg),
              backgroundColor: sectorCCSData.map((d) => ccsBarColor(d.avg)),
              borderRadius: 3,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: colors.bgCard,
              titleColor: colors.textPrimary,
              bodyColor: colors.textSecondary,
              borderColor: colors.gridColor,
              borderWidth: 1,
              callbacks: {
                title: function (items) {
                  return items[0].label;
                },
                label: function (ctx) {
                  var d = sectorCCSData[ctx.dataIndex];
                  return [
                    "Rata-rata CCS: " + d.avg,
                    "Median CCS: " + d.median,
                    "Min: " + d.min + " \u2014 Max: " + d.max,
                    "Jumlah emiten: " + d.count,
                  ];
                },
              },
            },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: "Rata-rata CCS (0\u2013100)",
                color: colors.textMuted,
                font: { size: 11 },
              },
              grid: { color: colors.gridColor },
              ticks: { color: colors.textMuted, font: { size: 10 } },
              max: 100,
            },
            y: {
              grid: { display: false },
              ticks: {
                color: colors.textSecondary,
                font: { size: 10 },
                autoSkip: false,
              },
            },
          },
        },
      }),
    );
  }
}

function refreshMetricsChartColors() {
  if (!metricsInitialized || metricsCharts.length === 0) return;
  // Simplest approach: re-render
  metricsCharts.forEach((c) => c.destroy());
  metricsCharts = [];
  metricsInitialized = false;
  // Only re-render if metrics tab is visible
  if (getCurrentTab() === "metrics") {
    metricsInitialized = true;
    renderMetricsTab(KSEI_DATA);
  }
}

// ============================================================
// INIT
// ============================================================
function init() {
  initTheme();
  initTabs();
  
  // Update date-info with price data fetch time
  const dateInfoEl = document.getElementById("dateInfo");
  if (dateInfoEl && typeof PRICE_DATA_META !== "undefined") {
    dateInfoEl.textContent = `Sumber: KSEI \u00A0·\u00A0 Harga: ${PRICE_DATA_META.fetchTime}`;
  }

  requestAnimationFrame(() => {
    state.allGroups = buildGroups(KSEI_DATA);
    state.filteredGroups = [...state.allGroups];

    // Populate sector dropdown from built groups
    const sectorSet = new Set();
    for (const g of state.allGroups) {
      if (g.sector) sectorSet.add(g.sector);
    }
    const sectorList = [...sectorSet].sort();
    const sectorSel = document.getElementById("sectorFilter");
    if (sectorSel) {
      sectorList.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s;
        const count = state.allGroups.filter((g) => g.sector === s).length;
        opt.textContent = `${s} (${count})`;
        sectorSel.appendChild(opt);
      });
    }

    // Pre-compute lookups for network graph
    for (const rec of KSEI_DATA) {
      if (!stockHoldersMap.has(rec.share_code))
        stockHoldersMap.set(rec.share_code, []);
      stockHoldersMap.get(rec.share_code).push(rec);
      if (!investorStocksMap.has(rec.investor_name))
        investorStocksMap.set(rec.investor_name, []);
      investorStocksMap.get(rec.investor_name).push(rec);
    }

    renderKPIs(KSEI_DATA);
    renderTopInvestors(KSEI_DATA); // Feature 4
    renderCountryBreakdown(KSEI_DATA); // Feature 7

    document.getElementById("loadingState").style.display = "none";
    document.getElementById("groupList").style.display = "flex";

    renderPage(true);
    initFilters();
    initScrollObserver();
    initExportButtons(); // Feature 1
    initKeyboardShortcuts(); // Feature 3
    initCompare(); // Feature 5&6

    // Feature 2: apply hash state after init
    applyHashState();
  });
}

// ============================================================
// INFINITE SCROLL — IntersectionObserver setup
// ============================================================
function isMobile() {
  return window.innerWidth <= 768;
}

function initScrollObserver() {
  const sentinel = document.getElementById("scrollSentinel");
  const scrollRoot = document.getElementById("mainContent");
  if (!sentinel) return;

  const observer = new IntersectionObserver(
    (entries) => {
      if (
        entries[0].isIntersecting &&
        state.displayedCount < state.filteredGroups.length
      ) {
        loadMoreItems();
      }
    },
    { root: isMobile() ? null : scrollRoot, rootMargin: "300px" },
  );

  observer.observe(sentinel);
}

function initInvScrollObserver() {
  const sentinel = document.getElementById("invScrollSentinel");
  const scrollRoot = document.getElementById("invMainContent");
  if (!sentinel) return;

  const observer = new IntersectionObserver(
    (entries) => {
      if (
        entries[0].isIntersecting &&
        invState.displayedCount < invState.filteredGroups.length
      ) {
        loadMoreInvItems();
      }
    },
    { root: isMobile() ? null : scrollRoot, rootMargin: "300px" },
  );

  observer.observe(sentinel);
}

document.addEventListener("DOMContentLoaded", init);

// ============================================================
// INVESTOR TAB — STATE
// ============================================================
let invState = {
  searchQuery: "",
  displayedCount: 0,
  allGroups: [],
  filteredGroups: [],
  expandedCards: new Set(),
  expandAll: false,
  sortKey: "stocks",
  sortDir: "desc",
  minPct: 0,
  minStocks: 1,
  maxStocks: Infinity,
  pepCongloFilter: "all", // 'all', 'pep', 'conglo', 'pep_conglo'
  typeFilter: new Set(), // empty = all; otherwise Set of selected type codes
  originFilter: "all", // 'all', 'D', 'F'
};

// ============================================================
// INVESTOR TAB — DATA BUILDING
// ============================================================
function buildInvestorGroups(data) {
  const map = new Map();
  for (const rec of data) {
    const key = rec.investor_name;
    if (!map.has(key)) {
      map.set(key, {
        investor_name: rec.investor_name,
        investor_type: rec.investor_type || "",
        local_foreign: rec.local_foreign || "",
        nationality: rec.nationality || "",
        domicile: rec.domicile || "",
        stocks: [],
      });
    }
    map.get(key).stocks.push({
      share_code: rec.share_code,
      issuer_name: rec.issuer_name,
      percentage: rec.percentage,
      total_holding_shares: rec.total_holding_shares,
      holdings_scripless: rec.holdings_scripless,
      holdings_scrip: rec.holdings_scrip,
      investor_type: rec.investor_type,
      local_foreign: rec.local_foreign,
      nationality: rec.nationality,
      domicile: rec.domicile,
    });
  }
  for (const g of map.values()) {
    g.stocks.sort((a, b) => b.percentage - a.percentage);
    g.stockCount = g.stocks.length;
    g.totalShares = g.stocks.reduce(
      (sum, s) => sum + (s.total_holding_shares || 0),
      0,
    );
    g.maxPct = g.stocks.reduce((mx, s) => Math.max(mx, s.percentage || 0), 0);
    // Calculate AUM: shares * price per stock
    g.totalAUM = 0;
    for (const s of g.stocks) {
      const pi = getPriceInfo(s.share_code);
      s.value = pi && pi.p ? (s.total_holding_shares || 0) * pi.p : null;
      if (s.value) g.totalAUM += s.value;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.investor_name.localeCompare(b.investor_name),
  );
}

// ============================================================
// INVESTOR TAB — KPIs
// ============================================================
function renderInvKPIs(groups) {
  // Investor KPIs moved to Metrics tab. This is now a no-op.
  // Metrics tab handles its own rendering via renderMetricsTab().
}

// ============================================================
// INVESTOR TAB — FILTERS & SORT
// ============================================================
function applyInvFilters() {
  const q = invState.searchQuery.toLowerCase().trim();

  invState.filteredGroups = invState.allGroups.filter((g) => {
    // Text search: investor_name, share_code, issuer_name
    if (q) {
      const inName = g.investor_name.toLowerCase().includes(q);
      const inStock = g.stocks.some(
        (s) =>
          s.share_code.toLowerCase().includes(q) ||
          s.issuer_name.toLowerCase().includes(q),
      );
      if (!inName && !inStock) return false;
    }
    // Min % filter: at least one holding >= minPct
    if (invState.minPct > 0) {
      const hasQualifying = g.stocks.some(
        (s) => (s.percentage || 0) >= invState.minPct,
      );
      if (!hasQualifying) return false;
    }
    // Stock count range
    if (g.stockCount < invState.minStocks) return false;
    if (invState.maxStocks !== Infinity && g.stockCount > invState.maxStocks)
      return false;
    // PEP/Conglo filter
    if (invState.pepCongloFilter !== "all") {
      const isPep =
        typeof PEP_DATA !== "undefined" && !!PEP_DATA[g.investor_name];
      const isConglo =
        typeof CONGLO_DATA !== "undefined" && !!CONGLO_DATA[g.investor_name];
      if (invState.pepCongloFilter === "pep" && !isPep) return false;
      if (invState.pepCongloFilter === "conglo" && !isConglo) return false;
      if (invState.pepCongloFilter === "pep_conglo" && !isPep && !isConglo)
        return false;
    }
    // Investor type filter (multi-select)
    if (invState.typeFilter.size > 0) {
      const gType = (g.investor_type || "").toUpperCase();
      if (!invState.typeFilter.has(gType)) return false;
    }
    // Local/Foreign origin filter
    if (invState.originFilter !== "all") {
      const gOrigin = (g.local_foreign || "").toUpperCase();
      if (gOrigin !== invState.originFilter) return false;
    }
    return true;
  });

  applyInvSorting();
  renderInvPage(true);
}

function applyInvSorting() {
  const { sortKey, sortDir } = invState;
  if (!sortDir) return;
  invState.filteredGroups.sort((a, b) => {
    let cmp;
    if (sortKey === "name") {
      cmp = a.investor_name.localeCompare(b.investor_name);
    } else if (sortKey === "aum") {
      // Sort by AUM, treat investors without data (0) as having the lowest value
      const aVal = a.totalAUM || 0;
      const bVal = b.totalAUM || 0;
      cmp = aVal - bVal;
    } else {
      cmp = a.stockCount - b.stockCount;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });
}

// ============================================================
// INVESTOR TAB — RENDER INVESTOR CARD
// ============================================================
function renderInvestorCard(group) {
  const isOpen = invState.expandedCards.has(group.investor_name);
  const card = document.createElement("div");
  card.className = "stock-card" + (isOpen ? " open" : "");
  card.dataset.investor = group.investor_name;

  let tableRows = "";
  let mobileRows = "";
  group.stocks.forEach((s, i) => {
    const pctWidth = Math.min(100, s.percentage || 0).toFixed(1);
    // Scrip indicator for Per Investor tab
    let sharesHtml = `<div class="shares-combined">${fmtNum(s.total_holding_shares)}`;
    if (s.holdings_scrip > 0 && s.holdings_scripless > 0) {
      sharesHtml += `<div class="shares-detail"><span class="shares-detail-label">Scripless:</span> ${fmtNum(s.holdings_scripless)}<br><span class="shares-detail-label">Scrip:</span> ${fmtNum(s.holdings_scrip)}</div>`;
    } else if (
      s.holdings_scrip > 0 &&
      (!s.holdings_scripless || s.holdings_scripless === 0)
    ) {
      sharesHtml += `<span class="scrip-pill">Scrip</span>`;
    }
    sharesHtml += `</div>`;
    // Mobile scrip indicator
    let mobileScrip = "";
    if (s.holdings_scrip > 0 && s.holdings_scripless > 0) {
      mobileScrip = `<span class="mobile-inv-shares">Scripless: ${fmtNum(s.holdings_scripless)} · Scrip: ${fmtNum(s.holdings_scrip)}</span>`;
    } else if (
      s.holdings_scrip > 0 &&
      (!s.holdings_scripless || s.holdings_scripless === 0)
    ) {
      mobileScrip = `<span class="scrip-pill">Scrip</span>`;
    }
    tableRows += `
      <tr style="--row-pct:${pctWidth}%">
        <td class="rank">${i + 1}</td>
        <td class="rank" style="width:54px;text-align:left"><span class="ticker-badge ticker-link" onclick="event.stopPropagation(); navigateToStock('${esc(s.share_code)}', '${escOnclick(s.issuer_name)}')" style="font-size:10px;padding:2px 5px;cursor:pointer">${esc(s.share_code)}</span></td>
        <td class="inv-name"><span class="inv-name-text inv-name-link" onclick="event.stopPropagation(); navigateToStock('${esc(s.share_code)}', '${escOnclick(s.issuer_name)}')" title="${esc(s.issuer_name)}">${esc(s.issuer_name)}</span></td>
        <td class="right">${sharesHtml}</td>
        <td class="right aum-col">${s.value ? fmtMoney(s.value) : "—"}</td>
        <td class="pct-col"><span class="pct-num">${fmtPct(s.percentage)}</span></td>
      </tr>`;

    mobileRows += `
      <div class="mobile-inv-row" style="--row-pct:${pctWidth}%">
        <span class="mobile-inv-name inv-name-link" onclick="event.stopPropagation(); navigateToStock('${esc(s.share_code)}', '${escOnclick(s.issuer_name)}')"><span class="mobile-inv-ticker ticker-link">${esc(s.share_code)}</span> ${esc(s.issuer_name)}</span>
        <span class="mobile-inv-pct">${fmtPct(s.percentage)}</span>
        ${s.value ? `<span class="mobile-inv-shares">${fmtMoney(s.value)}</span>` : ""}
        ${mobileScrip}
      </div>`;
  });

  card.innerHTML = `
    <div class="card-header inv-card-header" role="button" aria-expanded="${isOpen}" tabindex="0">
      <div class="card-header-left">
        <span class="issuer-name" style="font-weight:500;color:var(--text-primary)" title="${esc(group.investor_name)}">${esc(group.investor_name)}${pepBadge(group.investor_name)}</span>
        <span class="stock-count-pill">${group.stockCount} Emiten</span>
      </div>
      <div class="card-header-right inv-header-badges">
        ${group.totalAUM > 0 ? `<span class="aum-pill" title="Estimasi nilai total kepemilikan: Rp ${fmtNum(Math.round(group.totalAUM))}">Rp ${fmtMoney(group.totalAUM)}</span>` : ""}
        ${typeBadge(group.investor_type)}
        ${lfBadge(group.local_foreign, group.nationality, group.domicile)}
      </div>
    </div>
    <div class="card-body">
      ${
        group.totalAUM > 0
          ? `<div class="aum-hero">
        <span class="aum-hero-label">Total AUM</span>
        <span class="aum-hero-value">Rp ${fmtMoney(group.totalAUM)}</span>
        <span class="aum-hero-detail">(${fmtNum(Math.round(group.totalAUM))})</span>
      </div>`
          : ""
      }
      <div class="card-body-inner">
        <div class="card-body-table">
          <div class="table-scroll">
            <table class="inv-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th style="min-width:60px">Kode</th>
                  <th>Nama Emiten</th>
                  <th class="right">Saham</th>
                  <th class="right">Nilai (Rp)</th>
                  <th class="right">%</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
            <div class="mobile-inv-list">${mobileRows}</div>
          </div>
        </div>
        <div class="card-body-graph">
          <div class="network-section open">
            <button class="network-toggle-btn" onclick="event.stopPropagation(); toggleNetworkGraph(this)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/>
                <line x1="12" y1="8" x2="5" y2="16"/><line x1="12" y1="8" x2="19" y2="16"/>
              </svg>
              Jaringan Koneksi
              <svg class="network-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
            <div class="network-graph-container">
              <div class="graph-zoom-controls">
                <button class="graph-zoom-btn" onclick="event.stopPropagation(); graphZoom(this, 1.4)" title="Zoom In">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button class="graph-zoom-btn" onclick="event.stopPropagation(); graphZoom(this, 0.7)" title="Zoom Out">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
                <button class="graph-zoom-btn" onclick="event.stopPropagation(); graphZoomReset(this)" title="Reset">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                </button>
                <button class="graph-zoom-btn" onclick="event.stopPropagation(); openGraphFullscreen(this)" title="Fullscreen">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                </button>
              </div>
            </div>
      </div>
    </div>`;

  const header = card.querySelector(".card-header");
  const toggleCard = () => {
    const key = group.investor_name;
    const isNowOpen = card.classList.toggle("open");
    header.setAttribute("aria-expanded", isNowOpen);
    if (isNowOpen) {
      invState.expandedCards.add(key);
      // Auto-render network graph when card opens
      const gc = card.querySelector(".network-graph-container");
      if (gc) setTimeout(() => autoRenderGraph(gc), 50);
    } else {
      invState.expandedCards.delete(key);
    }
  };
  header.addEventListener("click", toggleCard);
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCard();
    }
  });

  // Auto-render graph if card is open on creation
  if (isOpen) {
    const gc = card.querySelector(".network-graph-container");
    if (gc) setTimeout(() => autoRenderGraph(gc), 80);
  }

  return card;
}

// ============================================================
// INVESTOR TAB — RENDER PAGE (infinite scroll)
// ============================================================
function renderInvPage(reset) {
  const list = document.getElementById("invGroupList");
  const empty = document.getElementById("invEmptyState");
  const statusEl = document.getElementById("invScrollStatus");

  const total = invState.filteredGroups.length;

  const rc = document.getElementById("invResultsCount");
  if (rc) rc.textContent = `${fmtNum(total)} investor`;

  if (total === 0) {
    list.style.display = "none";
    empty.style.display = "flex";
    statusEl.innerHTML = "";
    return;
  }

  empty.style.display = "none";
  list.style.display = "flex";

  if (reset) {
    list.innerHTML = "";
    invState.displayedCount = 0;
    list.style.animation = "none";
    list.offsetHeight;
    list.style.animation = "";
  }

  const end = Math.min(invState.displayedCount + BATCH_SIZE, total);
  const frag = document.createDocumentFragment();
  const startIdx = invState.displayedCount;
  for (let i = invState.displayedCount; i < end; i++) {
    const card = renderInvestorCard(invState.filteredGroups[i]);
    card.style.setProperty("--stagger", `${(i - startIdx) * 30}ms`);
    frag.appendChild(card);
  }
  list.appendChild(frag);
  invState.displayedCount = end;

  updateScrollStatus(statusEl, invState.displayedCount, total, "investor");
}

function loadMoreInvItems() {
  if (invState.displayedCount >= invState.filteredGroups.length) return;
  renderInvPage(false);
}

// ============================================================
// INVESTOR TAB — FILTER INIT
// ============================================================
function initInvFilters() {
  const searchInput = document.getElementById("invSearchInput");
  const searchClear = document.getElementById("invSearchClear");
  const expandBtn = document.getElementById("invExpandAllBtn");
  const resetBtn = document.getElementById("invFilterReset");
  const sortNameBtn = document.getElementById("invSortName");
  const sortStocksBtn = document.getElementById("invSortStocks");
  const sortAUMBtn = document.getElementById("invSortAUM");

  // Label filter dropdown
  const labelSelect = document.getElementById("invLabelSelect");
  labelSelect.addEventListener("change", () => {
    invState.pepCongloFilter = labelSelect.value;
    applyInvFilters();
  });

  // Investor type filter (multi-select dropdown)
  const typeBtn = document.getElementById("invTypeBtn");
  const typePanel = document.getElementById("invTypePanel");
  const typeOptions = Array.from(
    typePanel.querySelectorAll(".multi-select-option"),
  );

  function updateTypeBtnLabel() {
    if (invState.typeFilter.size === 0) {
      typeBtn.innerHTML =
        'Semua <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
    } else {
      typeBtn.innerHTML = `<span class="ms-count">${invState.typeFilter.size}</span> Tipe <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M3 5l3 3 3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    }
  }

  typeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    typePanel.classList.toggle("open");
  });

  typeOptions.forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = opt.dataset.type;
      if (invState.typeFilter.has(val)) {
        invState.typeFilter.delete(val);
        opt.classList.remove("selected");
      } else {
        invState.typeFilter.add(val);
        opt.classList.add("selected");
      }
      updateTypeBtnLabel();
      applyInvFilters();
    });
  });

  // Close dropdown on outside click
  document.addEventListener("click", () => typePanel.classList.remove("open"));

  // Local/Foreign origin dropdown
  const originSelect = document.getElementById("invOriginSelect");
  originSelect.addEventListener("change", () => {
    invState.originFilter = originSelect.value;
    applyInvFilters();
  });

  const doSearch = debounce(() => {
    invState.searchQuery = searchInput.value;
    searchClear.classList.toggle("visible", !!searchInput.value);
    applyInvFilters();
    updateHash();
  }, 300);

  searchInput.addEventListener("input", doSearch);

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    invState.searchQuery = "";
    searchClear.classList.remove("visible");
    applyInvFilters();
    updateHash();
  });

  expandBtn.addEventListener("click", () => {
    invState.expandAll = !invState.expandAll;
    if (invState.expandAll) {
      invState.filteredGroups
        .slice(0, invState.displayedCount)
        .forEach((g) => invState.expandedCards.add(g.investor_name));
      expandBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 8l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Tutup Semua`;
    } else {
      invState.filteredGroups
        .slice(0, invState.displayedCount)
        .forEach((g) => invState.expandedCards.delete(g.investor_name));
      expandBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Buka Semua`;
    }
    renderInvPage(true);
  });

  // Sort buttons
  function refreshInvSortUI() {
    [sortNameBtn, sortStocksBtn, sortAUMBtn].forEach((btn) => {
      const key = btn.dataset.sort;
      const isActive = key === invState.sortKey;
      btn.classList.toggle("active", isActive);
      const arrow = btn.querySelector(".sort-arrow");
      if (isActive) {
        arrow.textContent = invState.sortDir === "desc" ? "↓" : "↑";
      } else {
        arrow.textContent = "";
      }
    });
  }

  function doInvSort(key) {
    if (invState.sortKey === key) {
      invState.sortDir = invState.sortDir === "asc" ? "desc" : "asc";
    } else {
      invState.sortKey = key;
      invState.sortDir = key === "stocks" || key === "aum" ? "desc" : "asc";
    }
    refreshInvSortUI();
    applyInvSorting();
    renderInvPage(true);
  }

  sortNameBtn.addEventListener("click", () => doInvSort("name"));
  sortStocksBtn.addEventListener("click", () => doInvSort("stocks"));
  sortAUMBtn.addEventListener("click", () => doInvSort("aum"));

  // Reset
  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    invState.searchQuery = "";
    searchClear.classList.remove("visible");
    invState.sortKey = "stocks";
    invState.sortDir = "desc";
    invState.pepCongloFilter = "all";
    labelSelect.value = "all";
    // Reset type filter
    invState.typeFilter.clear();
    typeOptions.forEach((o) => o.classList.remove("selected"));
    updateTypeBtnLabel();
    // Reset origin filter
    invState.originFilter = "all";
    originSelect.value = "all";
    refreshInvSortUI();
    applyInvFilters();
  });

  refreshInvSortUI();

  // Mobile filter toggle
  const mobileFilterToggle = document.getElementById("invMobileFilterToggle");
  if (mobileFilterToggle) {
    mobileFilterToggle.addEventListener("click", () => {
      const toolbar = document.getElementById("invToolbar");
      toolbar.classList.toggle("mobile-filters-expanded");
      mobileFilterToggle.classList.toggle("expanded");
    });
  }
}

// ============================================================
// TAB SWITCHING — 3 tabs
// ============================================================
let invInitialized = false;
let kongloInitialized = false;
let metricsInitialized = false;

function switchTab(tab) {
  const summaryEl = document.getElementById("tabSummary");
  const investorEl = document.getElementById("tabInvestor");
  const kongloEl = document.getElementById("tabKonglo");
  const metricsEl = document.getElementById("tabMetrics");
  const btnSummary = document.getElementById("tabBtnSummary");
  const btnInvestor = document.getElementById("tabBtnInvestor");
  const btnKonglo = document.getElementById("tabBtnKonglo");
  const btnMetrics = document.getElementById("tabBtnMetrics");

  // Hide all
  summaryEl.classList.add("hidden");
  investorEl.classList.add("hidden");
  kongloEl.classList.add("hidden");
  metricsEl.classList.add("hidden");
  btnSummary.classList.remove("active");
  btnInvestor.classList.remove("active");
  btnKonglo.classList.remove("active");
  btnMetrics.classList.remove("active");

  // Fade-in helper for main content
  const fadeInMain = (tabId) => {
    const mains = document.querySelectorAll(
      `#${tabId} .main, #${tabId} .toolbar, #${tabId} .kpi-bar, #${tabId} .inv-kpi-bar`,
    );
    mains.forEach((el) => {
      el.classList.remove("tab-fade-in");
      void el.offsetWidth;
      el.classList.add("tab-fade-in");
    });
  };

  if (tab === "summary") {
    summaryEl.classList.remove("hidden");
    btnSummary.classList.add("active");
    fadeInMain("tabSummary");
  } else if (tab === "investor") {
    investorEl.classList.remove("hidden");
    btnInvestor.classList.add("active");
    fadeInMain("tabInvestor");

    // Lazy-init investor tab on first switch
    if (!invInitialized) {
      invInitialized = true;
      invState.allGroups = buildInvestorGroups(KSEI_DATA);
      invState.filteredGroups = [...invState.allGroups];

      renderInvKPIs(invState.allGroups);

      document.getElementById("invLoadingState").style.display = "none";
      document.getElementById("invGroupList").style.display = "flex";

      applyInvSorting();
      renderInvPage(true);
      initInvFilters();
      initInvScrollObserver();
    }
  } else if (tab === "konglo") {
    kongloEl.classList.remove("hidden");
    btnKonglo.classList.add("active");
    fadeInMain("tabKonglo");

    // Lazy-init konglo tab on first switch
    if (!kongloInitialized) {
      kongloInitialized = true;
      initKongloTab();
    }
  } else if (tab === "metrics") {
    metricsEl.classList.remove("hidden");
    btnMetrics.classList.add("active");
    fadeInMain("tabMetrics");

    // Lazy-init metrics tab on first switch
    if (!metricsInitialized) {
      metricsInitialized = true;
      renderMetricsTab(KSEI_DATA);
    }
  }
  updateHash();
}

function initTabs() {
  document
    .getElementById("tabBtnSummary")
    .addEventListener("click", () => switchTab("summary"));
  document
    .getElementById("tabBtnInvestor")
    .addEventListener("click", () => switchTab("investor"));
  document
    .getElementById("tabBtnKonglo")
    .addEventListener("click", () => switchTab("konglo"));
  document
    .getElementById("tabBtnMetrics")
    .addEventListener("click", () => switchTab("metrics"));
}

// ============================================================
// KONGLO TAB — STATE & LOGIC
// ============================================================
let kongloState = {
  searchQuery: "",
  allGroups: [],
  filteredGroups: [],
  expandedCards: new Set(),
  expandAll: false,
  sortKey: "name",
  sortDir: "asc",
};

function buildKongloGroups() {
  // Build lookup of share_codes in KSEI_DATA
  const kseiCodes = new Set();
  for (const rec of KSEI_DATA) {
    kseiCodes.add(rec.share_code);
  }

  // Build per-stock data map from KSEI_DATA (grouped by share_code)
  const stockMap = new Map();
  for (const rec of KSEI_DATA) {
    if (!stockMap.has(rec.share_code)) {
      stockMap.set(rec.share_code, {
        share_code: rec.share_code,
        issuer_name: rec.issuer_name,
        records: [],
      });
    }
    stockMap.get(rec.share_code).records.push(rec);
  }

  // Build a map of ticker -> list of group names it belongs to (for shared tooltip)
  const tickerGroupNames = new Map();
  for (const group of KONGLO_GROUPS) {
    const allTickers = [
      ...(group.main || []),
      ...(group.small_micro || []),
      ...(group.investor_sharing || []),
    ];
    const seen = new Set();
    for (const t of allTickers) {
      if (!seen.has(t)) {
        seen.add(t);
        if (!tickerGroupNames.has(t)) tickerGroupNames.set(t, []);
        tickerGroupNames.get(t).push(group.name);
      }
    }
  }

  // Count how many groups each ticker belongs to (for "shared" detection)
  const tickerGroupCount = new Map();
  for (const [t, groups] of tickerGroupNames) {
    tickerGroupCount.set(t, groups.length);
  }

  function buildTickerDetail(ticker, category) {
    const found = kseiCodes.has(ticker);
    const stockData = stockMap.get(ticker) || null;
    const shared = (tickerGroupCount.get(ticker) || 1) > 1;
    let totalListedShares = 0;
    if (stockData) {
      for (const r of stockData.records) {
        if (r.percentage > 0 && r.total_holding_shares > 0) {
          totalListedShares = Math.round(
            r.total_holding_shares / (r.percentage / 100),
          );
          break;
        }
      }
    }
    return {
      ticker,
      found,
      shared,
      category,
      sharedGroups: tickerGroupNames.get(ticker) || [],
      issuer_name: stockData ? stockData.issuer_name : "",
      records: stockData ? stockData.records : [],
      holderCount: stockData ? stockData.records.length : 0,
      pctSum: stockData
        ? stockData.records.reduce((s, r) => s + (r.percentage || 0), 0)
        : 0,
      totalListedShares,
    };
  }

  const groups = KONGLO_GROUPS.map((g) => {
    // Build deduplicated ticker list preserving category order
    const seen = new Set();
    const tickerDetails = [];
    for (const t of g.main || []) {
      if (!seen.has(t)) {
        seen.add(t);
        tickerDetails.push(buildTickerDetail(t, "main"));
      }
    }
    for (const t of g.small_micro || []) {
      if (!seen.has(t)) {
        seen.add(t);
        tickerDetails.push(buildTickerDetail(t, "small"));
      }
    }
    for (const t of g.investor_sharing || []) {
      if (!seen.has(t)) {
        seen.add(t);
        tickerDetails.push(buildTickerDetail(t, "sharing"));
      }
    }

    const foundCount = tickerDetails.filter((t) => t.found).length;
    const totalHolders = tickerDetails.reduce((s, t) => s + t.holderCount, 0);
    const totalShares = tickerDetails.reduce(
      (s, t) => s + t.totalListedShares,
      0,
    );
    const totalMcap = tickerDetails.reduce((s, t) => {
      const priceInfo = getPriceInfo(t.ticker);
      return s + (priceInfo ? priceInfo.mc : 0);
    }, 0);

    return {
      name: g.name,
      tickers: tickerDetails,
      tickerCount: tickerDetails.length,
      foundCount,
      totalHolders,
      totalShares,
      totalMcap,
    };
  });

  return groups;
}

function renderKongloKPIs(groups) {
  const totalGroups = groups.length;
  // Unique tickers across all groups
  const allTickers = new Set();
  const sharedTickers = new Set();
  const tickerGroupCount = new Map();

  for (const g of groups) {
    for (const t of g.tickers) {
      allTickers.add(t.ticker);
      tickerGroupCount.set(t.ticker, (tickerGroupCount.get(t.ticker) || 0) + 1);
    }
  }
  for (const [ticker, count] of tickerGroupCount) {
    if (count > 1) sharedTickers.add(ticker);
  }

  const foundTickers = new Set();
  for (const g of groups) {
    for (const t of g.tickers) {
      if (t.found) foundTickers.add(t.ticker);
    }
  }
}

function applyKongloFilters() {
  const q = kongloState.searchQuery.toLowerCase().trim();

  kongloState.filteredGroups = kongloState.allGroups.filter((g) => {
    if (!q) return true;
    const inName = g.name.toLowerCase().includes(q);
    const inTicker = g.tickers.some((t) => t.ticker.toLowerCase().includes(q));
    const inIssuer = g.tickers.some((t) =>
      t.issuer_name.toLowerCase().includes(q),
    );
    return inName || inTicker || inIssuer;
  });

  applyKongloSorting();
  renderKongloPage();
}

function applyKongloSorting() {
  const { sortKey, sortDir } = kongloState;
  if (!sortDir) return;
  kongloState.filteredGroups.sort((a, b) => {
    let cmp;
    if (sortKey === "name") {
      cmp = a.name.localeCompare(b.name);
    } else if (sortKey === "stockcount") {
      cmp = a.tickerCount - b.tickerCount;
    } else if (sortKey === "mcap") {
      cmp = a.totalMcap - b.totalMcap;
    } else {
      cmp = a.foundCount - b.foundCount;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });
}

function renderKongloGroupCard(group) {
  const isOpen = kongloState.expandedCards.has(group.name);
  const card = document.createElement("div");
  card.className = "konglo-group-card" + (isOpen ? " open" : "");
  card.dataset.group = group.name;

  // Ticker chips grouped by category
  const catMain = group.tickers.filter((t) => t.category === "main");
  const catSmall = group.tickers.filter((t) => t.category === "small");
  const catSharing = group.tickers.filter((t) => t.category === "sharing");

  function chipGroup(tickers, label, currentGroupName) {
    if (!tickers.length) return "";
    const chips = tickers
      .map((t) => {
        const cls = t.found
          ? `konglo-chip--found konglo-chip--cat-${t.category}`
          : "konglo-chip--missing";
        let sharedHtml = "";
        if (t.shared) {
          const otherGroups = t.sharedGroups.filter(
            (g) => g !== currentGroupName,
          );
          const tipItems = otherGroups
            .map((g) => `<li>${esc(g)}</li>`)
            .join("");
          sharedHtml = ` <span class="konglo-shared-label" data-tip-html="<div style='font-size:11px;font-weight:600;margin-bottom:3px'>Juga di grup:</div><ul style='margin:0;padding-left:16px'>${tipItems}</ul>">shared</span>`;
        }
        const title = t.found
          ? `${t.issuer_name} — ${t.holderCount} pemegang saham, ${fmtPctSum(t.pctSum)} kepemilikan`
          : "Tidak ditemukan di data KSEI";
        return `<span class="konglo-chip ${cls}" title="${esc(title)}">${t.ticker}${sharedHtml}</span>`;
      })
      .join("");
    return `<div class="konglo-cat-group"><span class="konglo-cat-label">${label}</span>${chips}</div>`;
  }

  const chipHtml =
    chipGroup(catMain, "Main", group.name) +
    chipGroup(catSmall, "Small/Micro", group.name) +
    chipGroup(catSharing, "Sharing", group.name);

  // Stock table rows (only for found tickers)
  const foundTickers = group.tickers.filter((t) => t.found);
  let tableRows = "";
  let mobileRows = "";

  foundTickers.forEach((t) => {
    const topHolders = t.records.slice(0, 5);
    const catLabel =
      t.category === "main"
        ? ""
        : t.category === "small"
          ? '<span class="konglo-cat-badge konglo-cat-badge--small">Small/Micro</span>'
          : '<span class="konglo-cat-badge konglo-cat-badge--sharing">Sharing</span>';
    tableRows += `
        <tr class="konglo-ticker-header">
          <td colspan="6">
            <div class="konglo-ticker-header-inner">
              <span class="ticker-badge ticker-link" onclick="event.stopPropagation(); navigateToStock('${esc(t.ticker)}', '${escOnclick(t.issuer_name)}')" style="font-size:10px;padding:2px 5px;cursor:pointer">${esc(t.ticker)}</span>
              <span class="konglo-ticker-issuer inv-name-link" onclick="event.stopPropagation(); navigateToStock('${esc(t.ticker)}', '${escOnclick(t.issuer_name)}')">${esc(t.issuer_name)}</span>${catLabel}
              <span class="konglo-ticker-mcap"><strong>MCap: ${fmtMcap(getPriceInfo(t.ticker)?.mc || 0)}</strong></span>
              <span class="konglo-ticker-total"><strong class="konglo-ticker-pct">${fmtPctSum(t.pctSum)}</strong> kepemilikan · ${t.holderCount} pemegang saham</span>
            </div>
          </td>
        </tr>`;
    topHolders.forEach((rec, i) => {
      const pctWidth = Math.min(100, rec.percentage || 0).toFixed(1);
      // Scrip/Scripless
      let sharesHtml = `<div class="shares-combined">${fmtNum(rec.total_holding_shares)}`;
      if (rec.holdings_scrip > 0 && rec.holdings_scripless > 0) {
        sharesHtml += `<div class="shares-detail"><span class="shares-detail-label">Scripless:</span> ${fmtNum(rec.holdings_scripless)}<br><span class="shares-detail-label">Scrip:</span> ${fmtNum(rec.holdings_scrip)}</div>`;
      } else if (
        rec.holdings_scrip > 0 &&
        (!rec.holdings_scripless || rec.holdings_scripless === 0)
      ) {
        sharesHtml += `<div class="shares-detail"><span class="shares-detail-label">Scrip:</span> ${fmtNum(rec.holdings_scrip)}</div>`;
      }
      sharesHtml += `</div>`;

      tableRows += `
        <tr style="--row-pct:${pctWidth}%">
          <td class="inv-name"><span class="inv-name-text inv-name-link" onclick="event.stopPropagation(); navigateToInvestor('${escOnclick(rec.investor_name)}')">${esc(rec.investor_name)}${pepBadge(rec.investor_name)}</span></td>
          <td>${typeBadge(rec.investor_type)}</td>
          <td class="status-col">${lfBadge(rec.local_foreign, rec.nationality, rec.domicile)}</td>
          <td class="right">${sharesHtml}</td>
          <td class="pct-col"><span class="pct-num">${fmtPct(rec.percentage)}</span></td>
          <td></td>
        </tr>`;
    });

    // Mobile rows
    mobileRows += `<div class="konglo-ticker-header-mobile">
      <div style="display:flex;align-items:center;gap:var(--sp-2);flex-wrap:wrap">
        <span class="ticker-badge ticker-link" onclick="event.stopPropagation(); navigateToStock('${esc(t.ticker)}', '${escOnclick(t.issuer_name)}')" style="font-size:10px;padding:2px 5px;cursor:pointer">${esc(t.ticker)}</span>
        <span class="inv-name-link" onclick="event.stopPropagation(); navigateToStock('${esc(t.ticker)}', '${escOnclick(t.issuer_name)}')" style="font-size:var(--text-xs);color:var(--text-secondary)">${esc(t.issuer_name)}</span>${catLabel}
        <span class="konglo-ticker-mcap-mobile"><strong>${fmtMcap(getPriceInfo(t.ticker)?.mc || 0)}</strong></span>
        <strong style="font-size:var(--text-sm);font-weight:700;color:var(--accent);margin-left:auto">${fmtPctSum(t.pctSum)}</strong>
      </div>
    </div>`;
    topHolders.forEach((rec) => {
      const pctWidth = Math.min(100, rec.percentage || 0).toFixed(1);
      mobileRows += `
        <div class="mobile-inv-row" style="--row-pct:${pctWidth}%">
          <span class="mobile-inv-name inv-name-link" onclick="event.stopPropagation(); navigateToInvestor('${escOnclick(rec.investor_name)}')">${esc(rec.investor_name)}${pepBadge(rec.investor_name)}</span>
          <span class="mobile-inv-pct">${fmtPct(rec.percentage)}</span>
          <div class="mobile-inv-badges">
            ${typeBadge(rec.investor_type)}
            ${lfBadge(rec.local_foreign, rec.nationality, rec.domicile)}
          </div>
          <span class="mobile-inv-shares">${fmtNum(rec.total_holding_shares)} saham</span>
        </div>`;
    });
  });

  card.innerHTML = `
    <div class="konglo-header" role="button" aria-expanded="${isOpen}" tabindex="0">
      <div class="konglo-header-left">
        <span class="konglo-group-name">${esc(group.name)}</span>
        <span class="konglo-ticker-count">${group.tickerCount} Emiten</span>
      </div>
      <div class="konglo-header-right">
        <span class="konglo-stat">
          <strong>${fmtNum(group.totalHolders)}</strong> pemegang<br><strong>${fmtNum(group.totalShares)}</strong> lembar
        </span>
        <span class="konglo-mcap">
          Market Cap: <strong>${fmtMcap(group.totalMcap)}</strong>
        </span>
      </div>
    </div>
    <div class="konglo-tickers-row">${chipHtml}</div>
    <div class="konglo-body">
      ${
        foundTickers.length > 0
          ? `
      <div class="table-scroll">
        <table class="inv-table">
          <thead>
            <tr>
              <th>Pemegang Saham</th>
              <th>Tipe</th>
              <th>Status</th>
              <th class="right">Saham</th>
              <th class="right">%</th>
              <th class="right">Market Cap</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
        <div class="mobile-inv-list">${mobileRows}</div>
      </div>`
          : `<div style="padding:var(--sp-4);text-align:center;color:var(--text-muted);font-size:var(--text-sm)">Tidak ada data KSEI untuk grup ini</div>`
      }
    </div>`;

  const header = card.querySelector(".konglo-header");
  const toggleCard = () => {
    const isNowOpen = card.classList.toggle("open");
    header.setAttribute("aria-expanded", isNowOpen);
    if (isNowOpen) {
      kongloState.expandedCards.add(group.name);
    } else {
      kongloState.expandedCards.delete(group.name);
    }
  };
  header.addEventListener("click", (e) => {
    toggleCard();
  });
  header.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCard();
    }
  });

  return card;
}

function renderKongloPage() {
  const list = document.getElementById("kongloGroupList");
  const empty = document.getElementById("kongloEmptyState");

  const total = kongloState.filteredGroups.length;

  const rc = document.getElementById("kongloResultsCount");
  if (rc) rc.textContent = `${fmtNum(total)} grup`;

  if (total === 0) {
    list.style.display = "none";
    empty.style.display = "flex";
    return;
  }

  empty.style.display = "none";
  list.style.display = "flex";

  list.style.animation = "none";
  list.offsetHeight;
  list.style.animation = "";

  list.innerHTML = "";
  const frag = document.createDocumentFragment();
  kongloState.filteredGroups.forEach((g, idx) => {
    const card = renderKongloGroupCard(g);
    card.style.setProperty("--stagger", `${Math.min(idx, 15) * 30}ms`);
    frag.appendChild(card);
  });
  list.appendChild(frag);
}

function initKongloFilters() {
  const searchInput = document.getElementById("kongloSearchInput");
  const searchClear = document.getElementById("kongloSearchClear");
  const expandBtn = document.getElementById("kongloExpandAllBtn");
  const resetBtn = document.getElementById("kongloFilterReset");
  const sortNameBtn = document.getElementById("kongloSortName");
  const sortStockCountBtn = document.getElementById("kongloSortStockCount");
  const sortMcapBtn = document.getElementById("kongloSortMcap");
  const sortBtns = [sortNameBtn, sortStockCountBtn, sortMcapBtn];

  const doSearch = debounce(() => {
    kongloState.searchQuery = searchInput.value;
    searchClear.classList.toggle("visible", !!searchInput.value);
    applyKongloFilters();
    updateHash();
  }, 300);

  searchInput.addEventListener("input", doSearch);

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    kongloState.searchQuery = "";
    searchClear.classList.remove("visible");
    applyKongloFilters();
    updateHash();
  });

  expandBtn.addEventListener("click", () => {
    kongloState.expandAll = !kongloState.expandAll;
    if (kongloState.expandAll) {
      kongloState.filteredGroups.forEach((g) =>
        kongloState.expandedCards.add(g.name),
      );
      expandBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 8l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Tutup Semua`;
    } else {
      kongloState.filteredGroups.forEach((g) =>
        kongloState.expandedCards.delete(g.name),
      );
      expandBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Buka Semua`;
    }
    renderKongloPage();
  });

  function refreshKongloSortUI() {
    sortBtns.forEach((btn) => {
      const key = btn.dataset.sort;
      const isActive = key === kongloState.sortKey;
      btn.classList.toggle("active", isActive);
      const arrow = btn.querySelector(".sort-arrow");
      if (isActive) {
        arrow.textContent = kongloState.sortDir === "desc" ? "↓" : "↑";
      } else {
        arrow.textContent = "";
      }
    });
  }

  function doKongloSort(key) {
    if (kongloState.sortKey === key) {
      kongloState.sortDir = kongloState.sortDir === "asc" ? "desc" : "asc";
    } else {
      kongloState.sortKey = key;
      kongloState.sortDir =
        key === "found" || key === "stockcount" || key === "mcap"
          ? "desc"
          : "asc";
    }
    refreshKongloSortUI();
    applyKongloFilters();
  }

  sortNameBtn.addEventListener("click", () => doKongloSort("name"));
  sortStockCountBtn.addEventListener("click", () => doKongloSort("stockcount"));
  sortMcapBtn.addEventListener("click", () => doKongloSort("mcap"));

  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    kongloState.searchQuery = "";
    searchClear.classList.remove("visible");
    kongloState.sortKey = "name";
    kongloState.sortDir = "asc";
    refreshKongloSortUI();
    applyKongloFilters();
  });

  refreshKongloSortUI();

  // Mobile filter toggle
  const kongloFilterToggle = document.getElementById(
    "kongloMobileFilterToggle",
  );
  if (kongloFilterToggle) {
    kongloFilterToggle.addEventListener("click", () => {
      const toolbar = document.getElementById("kongloToolbar");
      toolbar.classList.toggle("mobile-filters-expanded");
      kongloFilterToggle.classList.toggle("expanded");
    });
  }
}

function initKongloTab() {
  kongloState.allGroups = buildKongloGroups();
  kongloState.filteredGroups = [...kongloState.allGroups];

  renderKongloKPIs(kongloState.allGroups);

  document.getElementById("kongloLoadingState").style.display = "none";
  document.getElementById("kongloGroupList").style.display = "flex";

  applyKongloSorting();
  renderKongloPage();
  initKongloFilters();
}

// ============================================================
// NETWORK GRAPH — TOGGLE
// ============================================================
function toggleNetworkGraph(btn) {
  const section = btn.closest(".network-section");
  const container = section.querySelector(".network-graph-container");
  const isOpen = section.classList.contains("open");

  if (isOpen) {
    container.style.display = "none";
    section.classList.remove("open");
  } else {
    container.style.display = "block";
    section.classList.add("open");
    // Render if not yet rendered
    if (!container.dataset.rendered) {
      autoRenderGraph(container);
    }
  }
}

// Auto-render graph when card opens (called from card toggle)
function autoRenderGraph(container) {
  if (container.dataset.rendered) return;
  container.dataset.rendered = "true";
  const card =
    container.closest(".stock-card") || container.closest(".konglo-group-card");
  if (card && card.dataset.code) {
    renderStockGraph(container, card.dataset.code);
  } else if (card && card.dataset.investor) {
    renderInvestorGraph(container, card.dataset.investor);
  }
}

// ============================================================
// NETWORK GRAPH — TOOLTIP HTML BUILDER
// ============================================================
function graphTooltipHtml(d) {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const accentC = isDark ? "#4ade80" : "#15803d";
  const greenC = isDark ? "#6ee7b7" : "#047857";
  const redC = isDark ? "#fca5a5" : "#b91c1c";
  const amberC = isDark ? "#fcd34d" : "#92400e";
  const mutedC = isDark ? "rgba(200,190,180,0.7)" : "rgba(60,70,90,0.6)";
  const dividerC = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";

  let html = '<div style="font-family:inherit;line-height:1.55;">';

  if (d.type === "stock") {
    html += `<div style="font-weight:700;font-size:13px;color:${accentC};letter-spacing:0.03em;">${esc(d.code)}</div>`;
    if (d.name)
      html += `<div style="font-size:11px;color:${mutedC};margin-top:1px;">${esc(d.name)}</div>`;
    // Show all shareholders with percentage when hovering a stock
    if (d.holders && d.holders.length) {
      html += `<div style="border-top:1px solid ${dividerC};margin:5px 0 4px;"></div>`;
      html += `<div style="font-size:10px;color:${mutedC};margin-bottom:3px;">Pemegang Saham (${d.holders.length})</div>`;
      d.holders.forEach((h) => {
        html += `<div style="display:flex;align-items:baseline;gap:6px;font-size:11px;padding:2px 0;border-bottom:1px solid ${dividerC};">`;
        html += `<span style="word-break:break-word;flex:1;">${esc(h.name)}</span>`;
        html += `<span style="font-weight:600;color:${greenC};white-space:nowrap;flex-shrink:0;">${fmtPct(h.pct)}</span>`;
        html += `</div>`;
      });
    } else if (d.detail) {
      html += `<div style="border-top:1px solid ${dividerC};margin:5px 0 4px;"></div>`;
      html += `<div style="font-size:11px;">${d.detail}</div>`;
    }
  } else {
    html += `<div style="font-weight:700;font-size:12px;margin-bottom:2px;">${esc(d.name)}</div>`;
    const tags = [];
    if (d.isPEP)
      tags.push(
        `<span style="display:inline-block;padding:1px 6px;border-radius:9px;font-size:9px;font-weight:600;background:${isDark ? "rgba(239,68,68,0.18)" : "rgba(185,28,28,0.1)"};color:${redC};">PEP</span>`,
      );
    if (d.isConglo)
      tags.push(
        `<span style="display:inline-block;padding:1px 6px;border-radius:9px;font-size:9px;font-weight:600;background:${isDark ? "rgba(245,158,11,0.18)" : "rgba(160,100,0,0.1)"};color:${amberC};">Konglo</span>`,
      );
    if (tags.length)
      html += `<div style="margin:3px 0 2px;display:flex;gap:4px;">${tags.join("")}</div>`;
    // Show all holdings if provided
    if (d.holdings && d.holdings.length) {
      html += `<div style="border-top:1px solid ${dividerC};margin:5px 0 4px;"></div>`;
      html += `<div style="font-size:10px;color:${mutedC};margin-bottom:3px;">Kepemilikan (${d.holdings.length} saham)</div>`;
      d.holdings.forEach((h) => {
        html += `<div style="display:flex;align-items:baseline;gap:6px;font-size:11px;padding:2px 0;border-bottom:1px solid ${dividerC};">`;
        html += `<span style="color:${accentC};font-weight:600;min-width:46px;">${esc(h.code)}</span>`;
        html += `<span style="color:${mutedC};font-size:10px;flex:1;">${fmtNum(h.shares)} lbr</span>`;
        html += `<span style="font-weight:600;color:${greenC};white-space:nowrap;">${fmtPct(h.pct)}</span>`;
        html += `</div>`;
      });
    } else if (d.pct !== undefined || d.shares !== undefined || d.stock) {
      html += `<div style="border-top:1px solid ${dividerC};margin:5px 0 4px;"></div>`;
      if (d.stock && d.pct !== undefined) {
        html += `<div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;"><span style="color:${accentC};font-weight:600;">${esc(d.stock)}</span><span style="font-weight:600;color:${greenC};">${fmtPct(d.pct)}</span></div>`;
      }
      if (d.shares !== undefined) {
        html += `<div style="font-size:10px;color:${mutedC};margin-top:1px;">${fmtNum(d.shares)} lembar</div>`;
      }
    }
    if (d.detail && !d.pct && !(d.holdings && d.holdings.length)) {
      html += `<div style="border-top:1px solid ${dividerC};margin:5px 0 4px;"></div>`;
      html += `<div style="font-size:11px;color:${mutedC};">${d.detail}</div>`;
    }
  }

  html += "</div>";
  return html;
}

// ============================================================
// NETWORK GRAPH — RENDER STOCK GRAPH (2 levels: stock → investors → their other stocks)
// ============================================================
function renderStockGraph(container, shareCode) {
  const nodes = [];
  const links = [];
  const nodeIds = new Set();

  const centerNodeId = "stock_" + shareCode;
  const holders = (stockHoldersMap.get(shareCode) || []).slice(0, 15);
  const issuerName = holders[0]?.issuer_name || shareCode;

  // Build holders list for tooltip
  const holdersList = holders.map((h) => ({
    name: h.investor_name,
    pct: h.percentage,
  }));

  nodes.push({
    id: centerNodeId,
    type: "stock",
    label: shareCode,
    fullName: issuerName,
    depth: 0,
    tooltipHtml: graphTooltipHtml({
      type: "stock",
      code: shareCode,
      name: issuerName,
      holders: holdersList,
    }),
  });
  nodeIds.add(centerNodeId);

  // Level 1: investors holding this stock
  holders.forEach((rec) => {
    const invId = "inv_" + rec.investor_name;
    if (!nodeIds.has(invId)) {
      const isPEP =
        typeof PEP_DATA !== "undefined" && !!PEP_DATA[rec.investor_name];
      const isConglo =
        typeof CONGLO_DATA !== "undefined" && !!CONGLO_DATA[rec.investor_name];
      // Build full holdings list for this investor (all stocks they hold)
      const allStocks = (investorStocksMap.get(rec.investor_name) || []).sort(
        (a, b) => (b.percentage || 0) - (a.percentage || 0),
      );
      const holdings = allStocks.map((s) => ({
        code: s.share_code,
        pct: s.percentage,
        shares: s.total_holding_shares,
      }));
      nodes.push({
        id: invId,
        type: "investor",
        label: rec.investor_name,
        fullName: rec.investor_name,
        depth: 1,
        isPEP,
        isConglo,
        tooltipHtml: graphTooltipHtml({
          type: "investor",
          name: rec.investor_name,
          holdings,
          isPEP,
          isConglo,
        }),
      });
      nodeIds.add(invId);
    }
    links.push({
      source: centerNodeId,
      target: invId,
      depth: 1,
      width: Math.max(1.5, (rec.percentage || 0) / 5),
    });
  });

  // Level 2: other stocks held by those investors (top 5 per investor, skip center stock)
  holders.forEach((rec) => {
    const invId = "inv_" + rec.investor_name;
    const otherStocks = (investorStocksMap.get(rec.investor_name) || [])
      .filter((s) => s.share_code !== shareCode)
      .sort((a, b) => (b.percentage || 0) - (a.percentage || 0))
      .slice(0, 5);
    otherStocks.forEach((s) => {
      const stockId = "stock_" + s.share_code;
      if (!nodeIds.has(stockId)) {
        const sHolders = (stockHoldersMap.get(s.share_code) || []).slice(0, 15);
        const sHoldersList = sHolders.map((h) => ({
          name: h.investor_name,
          pct: h.percentage,
        }));
        nodes.push({
          id: stockId,
          type: "stock",
          label: s.share_code,
          fullName: s.issuer_name || s.share_code,
          depth: 2,
          tooltipHtml: graphTooltipHtml({
            type: "stock",
            code: s.share_code,
            name: s.issuer_name || s.share_code,
            holders: sHoldersList,
          }),
        });
        nodeIds.add(stockId);
      }
      const linkId = invId + "->" + stockId;
      if (
        !links.find(
          (l) =>
            (typeof l.source === "string" ? l.source : l.source.id) === invId &&
            (typeof l.target === "string" ? l.target : l.target.id) === stockId,
        )
      ) {
        links.push({
          source: invId,
          target: stockId,
          depth: 2,
          width: Math.max(1, (s.percentage || 0) / 8),
        });
      }
    });
  });

  renderForceGraph(container, nodes, links, centerNodeId);
}

// ============================================================
// NETWORK GRAPH — RENDER INVESTOR GRAPH (2 levels: investor → stocks → other holders)
// ============================================================
function renderInvestorGraph(container, investorName) {
  const nodes = [];
  const links = [];
  const nodeIds = new Set();

  const centerNodeId = "inv_" + investorName;
  const stocks = (investorStocksMap.get(investorName) || []).sort(
    (a, b) => (b.percentage || 0) - (a.percentage || 0),
  );
  const isPEP = typeof PEP_DATA !== "undefined" && !!PEP_DATA[investorName];
  const isConglo =
    typeof CONGLO_DATA !== "undefined" && !!CONGLO_DATA[investorName];
  nodes.push({
    id: centerNodeId,
    type: "investor",
    label: investorName,
    fullName: investorName,
    depth: 0,
    isPEP,
    isConglo,
    tooltipHtml: graphTooltipHtml({
      type: "investor",
      name: investorName,
      holdings: stocks.map((s) => ({
        code: s.share_code,
        pct: s.percentage,
        shares: s.total_holding_shares,
      })),
      isPEP,
      isConglo,
    }),
  });
  nodeIds.add(centerNodeId);

  // Level 1: stocks this investor holds
  stocks.forEach((s) => {
    const stockId = "stock_" + s.share_code;
    if (!nodeIds.has(stockId)) {
      const sHolders = (stockHoldersMap.get(s.share_code) || []).slice(0, 15);
      const sHoldersList = sHolders.map((h) => ({
        name: h.investor_name,
        pct: h.percentage,
      }));
      nodes.push({
        id: stockId,
        type: "stock",
        label: s.share_code,
        fullName: s.issuer_name || s.share_code,
        depth: 1,
        tooltipHtml: graphTooltipHtml({
          type: "stock",
          code: s.share_code,
          name: s.issuer_name || s.share_code,
          holders: sHoldersList,
        }),
      });
      nodeIds.add(stockId);
    }
    links.push({
      source: centerNodeId,
      target: stockId,
      depth: 1,
      width: Math.max(1.5, (s.percentage || 0) / 5),
    });
  });

  // Level 2: top 3 other holders per stock (skip center investor)
  stocks.forEach((s) => {
    const stockId = "stock_" + s.share_code;
    const otherHolders = (stockHoldersMap.get(s.share_code) || [])
      .filter((h) => h.investor_name !== investorName)
      .slice(0, 3);
    otherHolders.forEach((h) => {
      const invId = "inv_" + h.investor_name;
      if (!nodeIds.has(invId)) {
        const hIsPEP =
          typeof PEP_DATA !== "undefined" && !!PEP_DATA[h.investor_name];
        const hIsConglo =
          typeof CONGLO_DATA !== "undefined" && !!CONGLO_DATA[h.investor_name];
        // Build full holdings for this investor
        const hAllStocks = (investorStocksMap.get(h.investor_name) || []).sort(
          (a, b) => (b.percentage || 0) - (a.percentage || 0),
        );
        const hHoldings = hAllStocks.map((st) => ({
          code: st.share_code,
          pct: st.percentage,
          shares: st.total_holding_shares,
        }));
        nodes.push({
          id: invId,
          type: "investor",
          label: h.investor_name,
          fullName: h.investor_name,
          depth: 2,
          isPEP: hIsPEP,
          isConglo: hIsConglo,
          tooltipHtml: graphTooltipHtml({
            type: "investor",
            name: h.investor_name,
            holdings: hHoldings,
            isPEP: hIsPEP,
            isConglo: hIsConglo,
          }),
        });
        nodeIds.add(invId);
      }
      if (
        !links.find(
          (l) =>
            (typeof l.source === "string" ? l.source : l.source.id) ===
              stockId &&
            (typeof l.target === "string" ? l.target : l.target.id) === invId,
        )
      ) {
        links.push({
          source: stockId,
          target: invId,
          depth: 2,
          width: Math.max(1, (h.percentage || 0) / 8),
        });
      }
    });
  });

  renderForceGraph(container, nodes, links, centerNodeId);
}

// ============================================================
// NETWORK GRAPH — D3 FORCE-DIRECTED RENDERER (reference-style)
// ============================================================
function renderForceGraph(container, nodes, links, centerNodeId) {
  const width = container.clientWidth || 480;
  const height = Math.max(450, container.clientHeight || 450);
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";

  // Colors: stock pills = blue-teal, investor circles = teal/green, distinct from konglo amber
  const colors = isDark
    ? {
        link: "rgba(255,255,255,0.35)",
        linkHi: "rgba(255,255,255,0.75)",
        stockFill: "#3b6b9c", // muted steel blue
        stockCenter: "#4a7fb5", // brighter steel blue center
        invFill: "#0d9488", // teal
        invCenter: "#14b8a6", // brighter teal center
        pepFill: "#dc2626", // red
        congloFill: "#d97706", // amber
        textLabel: "rgba(210,220,240,0.92)",
        textCenter: "#fff",
      }
    : {
        link: "rgba(0,0,0,0.5)",
        linkHi: "rgba(0,0,0,0.85)",
        stockFill: "#5b9bd5", // soft blue
        stockCenter: "#4a8bc2", // slightly deeper blue center
        invFill: "#2faa8a", // soft green-teal
        invCenter: "#1e9e7e", // deeper teal center
        pepFill: "#dc2626",
        congloFill: "#d97706",
        textLabel: "rgba(30,40,60,0.88)",
        textCenter: "#fff",
      };

  // Preserve zoom controls, clear everything else
  const zoomCtrl = container.querySelector(".graph-zoom-controls");
  container.innerHTML = "";
  if (zoomCtrl) container.appendChild(zoomCtrl);

  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .style("overflow", "hidden");

  const g = svg.append("g");
  const zoomBehavior = d3
    .zoom()
    .scaleExtent([0.2, 5])
    .on("zoom", (e) => g.attr("transform", e.transform));
  svg.call(zoomBehavior);
  // Store zoom reference for external controls
  container.__d3Zoom = zoomBehavior;
  container.__d3Svg = svg;

  // Node radius for circle nodes (investors only)
  function nodeRadius(d) {
    if (d.id === centerNodeId) return 28;
    if (d.depth === 1) return 18;
    return 12;
  }
  // Stock node pill size
  function stockPill(d) {
    if (d.id === centerNodeId) return { w: 72, h: 32, fs: "12px", rx: 16 };
    if (d.depth === 1) return { w: 56, h: 24, fs: "10px", rx: 12 };
    return { w: 46, h: 20, fs: "9px", rx: 10 };
  }

  // Force simulation
  const baseDist = Math.min(width, height) * 0.22;
  const simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance((d) => (d.depth === 1 ? baseDist : baseDist * 0.75))
        .strength((d) => (d.depth === 1 ? 0.5 : 0.3)),
    )
    .force(
      "charge",
      d3
        .forceManyBody()
        .strength((d) =>
          d.id === centerNodeId ? -600 : d.depth === 1 ? -250 : -120,
        )
        .distanceMax(baseDist * 4),
    )
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collision",
      d3
        .forceCollide()
        .radius((d) => {
          if (d.type === "stock") {
            const p = stockPill(d);
            return Math.max(p.w, p.h) / 2 + 6;
          }
          return nodeRadius(d) + 8;
        })
        .strength(0.8),
    )
    .alphaDecay(0.025);

  // Draw links
  const link = g
    .append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", colors.link)
    .attr("stroke-width", (d) => Math.max(0.8, d.width || 1.2))
    .attr("stroke-opacity", (d) => (d.depth === 1 ? 0.5 : 0.25));

  // Draw nodes — track drag vs click
  let dragStartPos = null;
  const node = g
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("cursor", "pointer")
    .call(
      d3
        .drag()
        .on("start", (e, d) => {
          dragStartPos = { x: e.x, y: e.y };
          if (!e.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (e, d) => {
          d.fx = e.x;
          d.fy = e.y;
        })
        .on("end", (e, d) => {
          if (!e.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
          // If barely moved, treat as click
          if (dragStartPos) {
            const dx = e.x - dragStartPos.x,
              dy = e.y - dragStartPos.y;
            if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
              if (d.type === "stock") navigateToStock(d.label, d.fullName);
              else if (d.type === "investor" && d.id !== centerNodeId)
                navigateToInvestor(d.fullName || d.label);
            }
          }
          dragStartPos = null;
        }),
    );

  // Stock nodes — rounded rectangle (pill shape) with label inside
  node
    .filter((d) => d.type === "stock")
    .append("rect")
    .attr("width", (d) => stockPill(d).w)
    .attr("height", (d) => stockPill(d).h)
    .attr("x", (d) => -stockPill(d).w / 2)
    .attr("y", (d) => -stockPill(d).h / 2)
    .attr("rx", (d) => stockPill(d).rx)
    .attr("fill", (d) =>
      d.id === centerNodeId ? colors.stockCenter : colors.stockFill,
    )
    .attr("stroke", (d) =>
      d.id === centerNodeId
        ? isDark
          ? "rgba(255,255,255,0.3)"
          : "rgba(0,0,0,0.15)"
        : "none",
    )
    .attr("stroke-width", (d) => (d.id === centerNodeId ? 2 : 0));

  // Stock label inside pill
  node
    .filter((d) => d.type === "stock")
    .append("text")
    .attr("x", 0)
    .attr("y", 0)
    .attr("dy", "0.35em")
    .attr("text-anchor", "middle")
    .attr("font-size", (d) => stockPill(d).fs)
    .attr("font-weight", 600)
    .attr("fill", "#fff")
    .attr("letter-spacing", "0.03em")
    .attr("pointer-events", "none")
    .text((d) => d.label);

  // Investor nodes — circles
  node
    .filter((d) => d.type === "investor")
    .append("circle")
    .attr("r", (d) => nodeRadius(d))
    .attr("fill", (d) => {
      if (d.id === centerNodeId) return colors.invCenter;
      if (d.isPEP) return colors.pepFill;
      if (d.isConglo) return colors.congloFill;
      return colors.invFill;
    })
    .attr("stroke", (d) =>
      d.id === centerNodeId
        ? isDark
          ? "rgba(255,255,255,0.3)"
          : "rgba(0,0,0,0.15)"
        : "none",
    )
    .attr("stroke-width", (d) => (d.id === centerNodeId ? 2.5 : 0));

  // Investor labels — always outside to the right
  node
    .filter((d) => d.type === "investor")
    .append("text")
    .attr("x", (d) => nodeRadius(d) + 5)
    .attr("y", 0)
    .attr("dy", "0.35em")
    .attr("text-anchor", "start")
    .attr("font-size", (d) =>
      d.id === centerNodeId ? "11px" : d.depth === 1 ? "10.5px" : "9px",
    )
    .attr("font-weight", (d) => (d.id === centerNodeId ? 700 : 500))
    .attr("fill", colors.textLabel)
    .attr("pointer-events", "none")
    .text((d) => d.label);

  // Tooltip
  const tooltip = d3
    .select(container)
    .append("div")
    .attr("class", "graph-tooltip")
    .style("display", "none");

  node
    .on("mouseover", (event, d) => {
      // Highlight connected
      const connected = new Set([d.id]);
      links.forEach((l) => {
        const sid = typeof l.source === "object" ? l.source.id : l.source;
        const tid = typeof l.target === "object" ? l.target.id : l.target;
        if (sid === d.id) connected.add(tid);
        if (tid === d.id) connected.add(sid);
      });
      node.style("opacity", (n) => (connected.has(n.id) ? 1 : 0.12));
      link
        .attr("stroke", (l) => {
          const sid = typeof l.source === "object" ? l.source.id : l.source;
          const tid = typeof l.target === "object" ? l.target.id : l.target;
          return sid === d.id || tid === d.id ? colors.linkHi : colors.link;
        })
        .attr("stroke-opacity", (l) => {
          const sid = typeof l.source === "object" ? l.source.id : l.source;
          const tid = typeof l.target === "object" ? l.target.id : l.target;
          return sid === d.id || tid === d.id ? 0.8 : 0.06;
        });

      // Show tooltip, position relative to the SVG container
      const rect = container.getBoundingClientRect();
      tooltip.style("display", "block").html(d.tooltipHtml || d.label);
      // Position near cursor but clamped to container
      let tx = event.clientX - rect.left + 16;
      let ty = event.clientY - rect.top - 10;
      const tw = tooltip.node().offsetWidth;
      const th = tooltip.node().offsetHeight;
      if (tx + tw > rect.width - 8) tx = event.clientX - rect.left - tw - 16;
      if (ty + th > rect.height - 8) ty = rect.height - th - 8;
      if (ty < 4) ty = 4;
      tooltip.style("left", tx + "px").style("top", ty + "px");
    })
    .on("mousemove", (event) => {
      const rect = container.getBoundingClientRect();
      let tx = event.clientX - rect.left + 16;
      let ty = event.clientY - rect.top - 10;
      const tw = tooltip.node().offsetWidth;
      const th = tooltip.node().offsetHeight;
      if (tx + tw > rect.width - 8) tx = event.clientX - rect.left - tw - 16;
      if (ty + th > rect.height - 8) ty = rect.height - th - 8;
      if (ty < 4) ty = 4;
      tooltip.style("left", tx + "px").style("top", ty + "px");
    })
    .on("mouseout", () => {
      node.style("opacity", 1);
      link
        .attr("stroke", colors.link)
        .attr("stroke-opacity", (d) => (d.depth === 1 ? 0.5 : 0.25));
      tooltip.style("display", "none");
    })
    .on("click", (event, d) => {
      // Navigation handled in drag end to avoid drag/click conflict
      event.stopPropagation();
    });

  // Tick — clamp nodes inside container bounds
  const pad = 40;
  simulation.on("tick", () => {
    nodes.forEach((d) => {
      d.x = Math.max(pad, Math.min(width - pad, d.x));
      d.y = Math.max(pad, Math.min(height - pad, d.y));
    });
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });
}

// ============================================================
// GRAPH ZOOM CONTROLS — interactive zoom in/out/reset
// ============================================================
function graphZoom(btn, factor) {
  const container = btn.closest(".network-graph-container");
  if (!container || !container.__d3Zoom || !container.__d3Svg) return;
  const svg = container.__d3Svg;
  const zoom = container.__d3Zoom;
  svg.transition().duration(300).call(zoom.scaleBy, factor);
}

function graphZoomReset(btn) {
  const container = btn.closest(".network-graph-container");
  if (!container || !container.__d3Zoom || !container.__d3Svg) return;
  const svg = container.__d3Svg;
  const zoom = container.__d3Zoom;
  svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
}

// ============================================================
// FULLSCREEN GRAPH MODAL
// ============================================================
function openGraphFullscreen(btn) {
  const srcContainer = btn.closest(".network-graph-container");
  if (!srcContainer) return;
  const card =
    srcContainer.closest(".stock-card") ||
    srcContainer.closest(".konglo-group-card");
  if (!card) return;

  const isStock = !!card.dataset.code;
  const key = isStock ? card.dataset.code : card.dataset.investor;
  const title = isStock
    ? card.querySelector(".card-header-title")?.textContent || key
    : key;

  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "graph-fullscreen-overlay";
  overlay.innerHTML = `
    <div class="graph-fullscreen-header">
      <div class="graph-fullscreen-title">Jaringan Koneksi — ${esc(title)}</div>
      <button class="graph-fullscreen-close" onclick="closeGraphFullscreen()" title="Close (Esc)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="graph-fullscreen-body">
      <div class="network-graph-container" style="width:100%;height:100%;min-height:0;">
        <div class="graph-zoom-controls">
          <button class="graph-zoom-btn" onclick="event.stopPropagation(); graphZoom(this, 1.4)" title="Zoom In">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="graph-zoom-btn" onclick="event.stopPropagation(); graphZoom(this, 0.7)" title="Zoom Out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          <button class="graph-zoom-btn" onclick="event.stopPropagation(); graphZoomReset(this)" title="Reset">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
          <button class="graph-zoom-btn" onclick="event.stopPropagation(); closeGraphFullscreen()" title="Exit Fullscreen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 4 20 10 20"/><polyline points="20 10 20 4 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  // Prevent body scroll
  document.body.style.overflow = "hidden";
  // Trigger open animation
  requestAnimationFrame(() => overlay.classList.add("open"));

  // Render graph in fullscreen container
  const fsContainer = overlay.querySelector(".network-graph-container");
  requestAnimationFrame(() => {
    if (isStock) {
      renderStockGraph(fsContainer, key);
    } else {
      renderInvestorGraph(fsContainer, key);
    }
  });

  // ESC to close
  overlay._escHandler = (e) => {
    if (e.key === "Escape") closeGraphFullscreen();
  };
  document.addEventListener("keydown", overlay._escHandler);
}

function closeGraphFullscreen() {
  const overlay = document.querySelector(".graph-fullscreen-overlay");
  if (!overlay) return;
  overlay.classList.remove("open");
  document.removeEventListener("keydown", overlay._escHandler);
  document.body.style.overflow = "";
  setTimeout(() => overlay.remove(), 220);
}

// ============================================================
// FLOATING TOOLTIP for PEP/Conglo pills
// ============================================================
(function initFloatingTooltip() {
  let tip = null;
  function getTip() {
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "pill-float-tip";
      document.body.appendChild(tip);
    }
    return tip;
  }

  document.addEventListener(
    "mouseenter",
    function (e) {
      const pill = e.target.closest("[data-tip-html]");
      if (!pill) return;
      const t = getTip();
      t.innerHTML = pill.getAttribute("data-tip-html");
      t.classList.remove("visible", "arrow-bottom", "arrow-top");
      t.style.display = "block";
      // Measure
      const pr = pill.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      let left = pr.left + pr.width / 2 - tr.width / 2;
      let top = pr.top - tr.height - 10;
      let arrowClass = "arrow-bottom";
      // If tooltip goes above viewport, flip below
      if (top < 4) {
        top = pr.bottom + 10;
        arrowClass = "arrow-top";
      }
      // Clamp horizontal
      if (left < 4) left = 4;
      if (left + tr.width > window.innerWidth - 4)
        left = window.innerWidth - tr.width - 4;
      t.style.left = left + "px";
      t.style.top = top + "px";
      t.classList.add(arrowClass);
      requestAnimationFrame(() => t.classList.add("visible"));
    },
    true,
  );

  document.addEventListener(
    "mouseleave",
    function (e) {
      const pill = e.target.closest("[data-tip-html]");
      if (!pill) return;
      const t = getTip();
      t.classList.remove("visible");
      setTimeout(() => {
        if (!t.classList.contains("visible")) t.style.display = "none";
      }, 150);
    },
    true,
  );
})();
