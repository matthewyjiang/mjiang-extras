const REPO = {
  name: "mjiang-extras",
  archPath: "x86_64",
  server: "https://repo.matthewyjiang.com/$arch",
};

const PACMAN_CONFIG = `[mjiang-extras]\nSigLevel = Never\nServer = https://repo.matthewyjiang.com/$arch`;

const state = {
  packages: [],
  filtered: [],
  selectedName: null,
};

const els = {
  status: document.querySelector("#load-status"),
  layout: document.querySelector(".package-layout"),
  list: document.querySelector("#package-list"),
  details: document.querySelector("#package-details"),
  search: document.querySelector("#package-search"),
  toast: document.querySelector("#toast"),
  statPackages: document.querySelector("#stat-packages"),
  statArches: document.querySelector("#stat-arches"),
  statSize: document.querySelector("#stat-size"),
  statUpdated: document.querySelector("#stat-updated"),
};

init();

async function init() {
  document.querySelectorAll("[data-copy-config]").forEach((button) => {
    button.addEventListener("click", () => copyText(PACMAN_CONFIG, "Copied pacman config"));
  });

  els.search.addEventListener("input", () => {
    filterPackages(els.search.value);
    renderPackages();
  });

  try {
    const packages = await loadPackages();
    state.packages = packages.sort((a, b) => a.name.localeCompare(b.name));
    state.filtered = [...state.packages];
    state.selectedName = packageNameFromHash() || state.packages[0]?.name || null;

    renderStats();
    renderPackages();
    els.status.hidden = true;
    els.layout.hidden = false;
  } catch (error) {
    console.error(error);
    els.status.textContent = `Could not load the package database: ${error.message}`;
  }
}

async function loadPackages() {
  try {
    if (!("DecompressionStream" in window)) {
      throw new Error("This browser cannot read gzip streams directly.");
    }

    const dbUrl = `${REPO.archPath}/${REPO.name}.files.tar.gz`;
    const response = await fetch(dbUrl);
    if (!response.ok) throw new Error(`Repository database returned ${response.status}`);

    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    const entries = parseTar(buffer);
    const packages = packagesFromTarEntries(entries);

    if (packages.length === 0) throw new Error("No packages found in repository database.");
    return packages;
  } catch (error) {
    console.warn("Falling back to packages.json", error);
    const response = await fetch("packages.json");
    if (!response.ok) throw error;
    const fallback = await response.json();
    return fallback.packages || [];
  }
}

function parseTar(buffer) {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const entries = [];
  let offset = 0;

  while (offset + 512 <= bytes.length) {
    const header = bytes.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sizeText = readTarString(header, 124, 12).trim();
    const size = parseInt(sizeText || "0", 8);
    const type = readTarString(header, 156, 1) || "0";
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;

    if (type === "0" || type === "") {
      entries.push({
        name: fullName,
        text: decoder.decode(bytes.slice(contentStart, contentEnd)),
      });
    }

    offset = contentStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

function readTarString(header, start, length) {
  const slice = header.slice(start, start + length);
  const nullIndex = slice.indexOf(0);
  const end = nullIndex === -1 ? slice.length : nullIndex;
  return new TextDecoder().decode(slice.slice(0, end));
}

function packagesFromTarEntries(entries) {
  const byDirectory = new Map();

  entries.forEach((entry) => {
    const parts = entry.name.split("/");
    if (parts.length < 2) return;
    const directory = parts[0];
    const file = parts[1];
    if (!byDirectory.has(directory)) byDirectory.set(directory, {});
    byDirectory.get(directory)[file] = entry.text;
  });

  return [...byDirectory.values()]
    .map((record) => {
      const desc = parseSections(record.desc || "");
      const files = parseSections(record.files || "").FILES || [];
      return normalizePackage(desc, files);
    })
    .filter((pkg) => pkg.name && pkg.version);
}

function parseSections(text) {
  const sections = {};
  let key = null;

  text.split(/\r?\n/).forEach((line) => {
    const heading = line.match(/^%([A-Z0-9_]+)%$/);
    if (heading) {
      key = heading[1];
      sections[key] = [];
    } else if (key && line !== "") {
      sections[key].push(line);
    }
  });

  return sections;
}

function normalizePackage(desc, files) {
  const first = (key) => desc[key]?.[0] || "";
  const all = (key) => desc[key] || [];
  const filename = first("FILENAME");

  return {
    filename,
    name: first("NAME"),
    base: first("BASE"),
    version: first("VERSION"),
    description: first("DESC"),
    csize: Number(first("CSIZE") || 0),
    isize: Number(first("ISIZE") || 0),
    sha256sum: first("SHA256SUM"),
    url: first("URL"),
    licenses: all("LICENSE"),
    arch: first("ARCH"),
    buildDate: Number(first("BUILDDATE") || 0),
    packager: first("PACKAGER"),
    depends: all("DEPENDS"),
    optdepends: all("OPTDEPENDS"),
    makedepends: all("MAKEDEPENDS"),
    conflicts: all("CONFLICTS"),
    provides: all("PROVIDES"),
    files,
    downloadUrl: filename ? `${REPO.archPath}/${filename}` : "",
  };
}

function filterPackages(query) {
  const q = query.trim().toLowerCase();
  if (!q) {
    state.filtered = [...state.packages];
  } else {
    state.filtered = state.packages.filter((pkg) => searchableText(pkg).includes(q));
  }

  if (!state.filtered.some((pkg) => pkg.name === state.selectedName)) {
    state.selectedName = state.filtered[0]?.name || null;
  }
}

function searchableText(pkg) {
  return [
    pkg.name,
    pkg.version,
    pkg.description,
    pkg.url,
    pkg.arch,
    ...pkg.depends,
    ...pkg.optdepends,
    ...pkg.makedepends,
    ...pkg.provides,
  ]
    .join(" ")
    .toLowerCase();
}

function renderStats() {
  const arches = [...new Set(state.packages.map((pkg) => pkg.arch).filter(Boolean))];
  const totalSize = state.packages.reduce((sum, pkg) => sum + (pkg.csize || 0), 0);
  const latestBuild = Math.max(...state.packages.map((pkg) => pkg.buildDate || 0));

  els.statPackages.textContent = String(state.packages.length);
  els.statArches.textContent = arches.join(", ") || "—";
  els.statSize.textContent = formatBytes(totalSize);
  els.statUpdated.textContent = latestBuild ? formatDate(latestBuild) : "—";
}

function renderPackages() {
  if (state.filtered.length === 0) {
    els.list.innerHTML = `<div class="empty-state">No packages match your search.</div>`;
    els.details.innerHTML = `<div class="empty-state">Try another search term.</div>`;
    return;
  }

  els.list.innerHTML = state.filtered
    .map((pkg) => {
      const isActive = pkg.name === state.selectedName;
      return `
        <button class="package-card ${isActive ? "is-active" : ""}" type="button" data-package="${escapeAttr(pkg.name)}">
          <strong>${escapeHtml(pkg.name)}</strong>
          <p>${escapeHtml(pkg.description || "No description provided.")}</p>
          <span class="pill-row">
            <span class="pill">${escapeHtml(pkg.version)}</span>
            <span class="pill green">${escapeHtml(pkg.arch || "unknown")}</span>
            <span class="pill">${formatBytes(pkg.csize)}</span>
          </span>
        </button>
      `;
    })
    .join("");

  els.list.querySelectorAll("[data-package]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedName = button.dataset.package;
      window.history.replaceState(null, "", `#${encodeURIComponent(state.selectedName)}`);
      renderPackages();
    });
  });

  renderDetails(selectedPackage());
}

function selectedPackage() {
  return (
    state.filtered.find((pkg) => pkg.name === state.selectedName) ||
    state.filtered[0] ||
    state.packages[0]
  );
}

function renderDetails(pkg) {
  if (!pkg) return;

  const installCommand = `sudo pacman -S ${pkg.name}`;
  const upstream = pkg.url
    ? `<a href="${escapeAttr(pkg.url)}" rel="noreferrer">${escapeHtml(cleanUrl(pkg.url))}</a>`
    : "—";

  els.details.innerHTML = `
    <div class="detail-heading">
      <div class="detail-title">
        <h3>${escapeHtml(pkg.name)}</h3>
        <p>${escapeHtml(pkg.description || "No description provided.")}</p>
      </div>
      ${pkg.downloadUrl ? `<a class="button secondary" href="${escapeAttr(pkg.downloadUrl)}">Download</a>` : ""}
    </div>

    <div class="command-box">
      <code>${escapeHtml(installCommand)}</code>
      <button class="inline-copy" type="button" data-copy-install>Copy</button>
    </div>

    <div class="meta-grid">
      ${metaItem("Version", pkg.version)}
      ${metaItem("Architecture", pkg.arch)}
      ${metaItem("Compressed", formatBytes(pkg.csize))}
      ${metaItem("Installed", formatBytes(pkg.isize))}
      ${metaItem("Build date", pkg.buildDate ? formatFullDate(pkg.buildDate) : "—")}
      ${metaItem("License", pkg.licenses.join(", ") || "—")}
      ${metaItem("Package base", pkg.base || "—")}
      ${metaItem("Upstream", upstream, true)}
    </div>

    ${tokenSection("Runtime dependencies", pkg.depends)}
    ${tokenSection("Optional dependencies", pkg.optdepends)}
    ${tokenSection("Make dependencies", pkg.makedepends)}
    ${tokenSection("Provides", pkg.provides)}
    ${tokenSection("Conflicts", pkg.conflicts)}

    <div class="section-block">
      <div class="meta-row">
        <h4>SHA-256</h4>
        ${pkg.sha256sum ? `<button class="inline-copy" type="button" data-copy-sha>Copy</button>` : ""}
      </div>
      <code>${escapeHtml(pkg.sha256sum || "—")}</code>
    </div>

    <div class="section-block">
      <h4>Files (${pkg.files.length})</h4>
      <pre class="file-list"><code>${escapeHtml(pkg.files.join("\n") || "No file list available.")}</code></pre>
    </div>
  `;

  els.details.querySelector("[data-copy-install]")?.addEventListener("click", () => {
    copyText(installCommand, "Copied install command");
  });

  els.details.querySelector("[data-copy-sha]")?.addEventListener("click", () => {
    copyText(pkg.sha256sum, "Copied checksum");
  });
}

function metaItem(label, value, html = false) {
  return `
    <div class="meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${html ? value : escapeHtml(value || "—")}</strong>
    </div>
  `;
}

function tokenSection(title, values) {
  if (!values || values.length === 0) return "";
  return `
    <div class="section-block">
      <h4>${escapeHtml(title)}</h4>
      <ul class="token-list">
        ${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function packageNameFromHash() {
  const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  return hash || null;
}

function cleanUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname + url.pathname.replace(/\/$/, "");
  } catch {
    return value;
  }
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(epochSeconds) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(epochSeconds * 1000),
  );
}

function formatFullDate(epochSeconds) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(epochSeconds * 1000));
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    showToast("Copy failed");
  }
}

let toastTimeout;
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => els.toast.classList.remove("is-visible"), 1800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
