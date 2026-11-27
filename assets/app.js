const SITE = "https://repo.matthewyjiang.com";
const SIGNING_KEY = "8269F3B4ED361F6BE6C0233DD113C94146264D14";

const REPO = {
  name: "mjiang-extras",
  archPath: "x86_64",
  server: "https://repo.matthewyjiang.com/$arch",
};

// One createrepo_c tree serves every supported Fedora release (x86_64 + noarch RPMs).
const FEDORA_PATH = "fedora/x86_64";

const PACMAN_CONFIG = `curl -fsSL https://repo.matthewyjiang.com/mjiang-extras.gpg | sudo pacman-key --add - && sudo pacman-key --lsign-key 8269F3B4ED361F6BE6C0233DD113C94146264D14\n\nprintf '\\n[mjiang-extras]\\nSigLevel = Required\\nServer = https://repo.matthewyjiang.com/$arch\\n' | sudo tee -a /etc/pacman.conf && sudo pacman -Syy`;

const DNF_SETUP = `sudo dnf config-manager addrepo --from-repofile=${SITE}/mjiang-extras.repo`;

// Everything that differs per distro. `load` resolves to normalized packages;
// an empty array means the repo has nothing published yet.
const DISTROS = {
  arch: {
    label: "Arch",
    setup: PACMAN_CONFIG,
    setupNote: "This imports Matt&rsquo;s package signing key, locally trusts it, enables the repo, then refreshes pacman.",
    copyMessage: "Copied pacman config",
    installCommand: (name) => `sudo pacman -S ${name}`,
    baseLabel: "Package base",
    load: loadArchPackages,
  },
  fedora: {
    label: "Fedora",
    setup: DNF_SETUP,
    setupNote: `Adds the repo to dnf on Fedora 41+. Your first install asks you to import Matt&rsquo;s signing key; its fingerprint should read <code>${SIGNING_KEY}</code>.`,
    copyMessage: "Copied dnf setup",
    installCommand: (name) => `sudo dnf install ${name}`,
    baseLabel: "Source RPM",
    load: loadFedoraPackages,
  },
};

const DEFAULT_DISTRO = "arch";

const ICONS = {
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="M7 10l5 5 5-5"></path><path d="M12 15V3"></path></svg>`,
};

const REFRESH_SUCCESS_MESSAGE = "Package registry refreshed";

const state = {
  distro: DEFAULT_DISTRO,
  // Distro whose packages are currently rendered; differs from `distro` mid-switch.
  shownDistro: null,
  // Bumped per load so a slow response can't overwrite a newer distro switch.
  loadId: 0,
  packages: [],
  filtered: [],
  selectedName: null,
};

const els = {
  distroInputs: document.querySelectorAll('input[name="distro"]'),
  setupCode: document.querySelector("#setup-code"),
  setupNote: document.querySelector("#setup-note"),
  status: document.querySelector("#load-status"),
  layout: document.querySelector(".package-layout"),
  list: document.querySelector("#package-list"),
  details: document.querySelector("#package-details"),
  search: document.querySelector("#package-search"),
  toast: document.querySelector("#toast"),
  refresh: document.querySelector("[data-refresh-packages]"),
  statPackages: document.querySelector("#stat-packages"),
  statArches: document.querySelector("#stat-arches"),
  statSize: document.querySelector("#stat-size"),
  statUpdated: document.querySelector("#stat-updated"),
};

init();

async function init() {
  state.distro = distroFromUrl();
  renderSetup();

  els.distroInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      state.distro = input.value;
      updateUrl();
      renderSetup();
      refreshPackages();
    });
  });

  document.querySelectorAll("[data-copy-config]").forEach((button) => {
    button.addEventListener("click", () => {
      const distro = DISTROS[state.distro];
      copyText(distro.setup, distro.copyMessage);
    });
  });

  els.search.addEventListener("input", () => {
    filterPackages(els.search.value);
    renderPackages();
  });

  els.refresh.addEventListener("click", () => refreshPackages({ force: true }));

  await refreshPackages();
}

async function refreshPackages({ force = false } = {}) {
  const distro = DISTROS[state.distro];
  const loadId = ++state.loadId;
  const isStale = () => loadId !== state.loadId;

  setRefreshing(true);
  els.status.hidden = false;
  els.status.textContent = force ? "Refreshing repository database…" : "Loading repository database…";
  if (state.shownDistro !== state.distro) {
    // Don't leave the previous distro's packages on screen under the new setup snippet.
    els.layout.hidden = true;
    state.packages = [];
    [els.statPackages, els.statArches, els.statSize, els.statUpdated].forEach((el) => {
      el.textContent = "—";
    });
  }

  try {
    const packages = await distro.load({ force });
    if (isStale()) return;
    state.shownDistro = state.distro;
    state.packages = packages
      .filter((pkg) => !isDebugPackage(pkg))
      .sort((a, b) => a.name.localeCompare(b.name));
    renderStats();

    if (state.packages.length === 0) {
      els.layout.hidden = true;
      els.status.textContent = `No ${distro.label} packages yet. This list fills in once the first build is published.`;
      return;
    }

    state.selectedName = state.packages.some((pkg) => pkg.name === state.selectedName)
      ? state.selectedName
      : packageNameFromHash() || state.packages[0]?.name || null;
    filterPackages(els.search.value);

    renderPackages();
    els.status.hidden = true;
    els.layout.hidden = false;
    if (force) showToast(REFRESH_SUCCESS_MESSAGE);
  } catch (error) {
    if (isStale()) return;
    console.error(error);
    els.status.textContent = `Could not load the package database: ${error.message}`;
  } finally {
    if (!isStale()) setRefreshing(false);
  }
}

// Reflects the chosen distro in the setup card, the radio group, and the list label.
function renderSetup() {
  const distro = DISTROS[state.distro];
  els.distroInputs.forEach((input) => {
    input.checked = input.value === state.distro;
  });
  els.setupCode.textContent = distro.setup;
  els.setupNote.innerHTML = distro.setupNote;
  els.list.setAttribute("aria-label", `${distro.label} packages`);
}

// `?distro=fedora` selects Fedora; anything else (or nothing) is Arch.
function distroFromUrl() {
  const value = new URLSearchParams(window.location.search).get("distro");
  return value && Object.hasOwn(DISTROS, value) ? value : DEFAULT_DISTRO;
}

// Writes the distro (query) and optionally a package (hash) without adding history entries.
function updateUrl({ packageName } = {}) {
  const url = new URL(window.location.href);
  if (state.distro === DEFAULT_DISTRO) url.searchParams.delete("distro");
  else url.searchParams.set("distro", state.distro);
  if (packageName !== undefined) url.hash = encodeURIComponent(packageName);
  window.history.replaceState(null, "", url);
}

function setRefreshing(isRefreshing) {
  els.refresh.disabled = isRefreshing;
  els.refresh.setAttribute("aria-busy", String(isRefreshing));
}

// Reads the pacman `.files` database, falling back to the generated packages.json.
async function loadArchPackages({ force = false } = {}) {
  const cacheBust = force ? `?t=${Date.now()}` : "";

  try {
    if (!("DecompressionStream" in window)) {
      throw new Error("This browser cannot read gzip streams directly.");
    }

    const dbUrl = `${REPO.archPath}/${REPO.name}.files.tar.gz${cacheBust}`;
    const response = await fetch(dbUrl, { cache: force ? "no-store" : "default" });
    if (!response.ok) throw new Error(`Repository database returned ${response.status}`);

    const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
    const buffer = await new Response(stream).arrayBuffer();
    const entries = parseTar(buffer);
    const packages = packagesFromTarEntries(entries);

    if (packages.length === 0) throw new Error("No packages found in repository database.");
    return packages;
  } catch (error) {
    console.warn("Falling back to packages.json", error);
    const response = await fetch(`packages.json${cacheBust}`, { cache: force ? "no-store" : "default" });
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
      return normalizeArchPackage(desc, files);
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

function normalizeArchPackage(desc, files) {
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

const RPM_NS = {
  repo: "http://linux.duke.edu/metadata/repo",
  common: "http://linux.duke.edu/metadata/common",
  rpm: "http://linux.duke.edu/metadata/rpm",
  filelists: "http://linux.duke.edu/metadata/filelists",
};

const RPM_FLAG_OPERATORS = { EQ: "=", LT: "<", LE: "<=", GT: ">", GE: ">=" };

// Reads createrepo_c metadata: repomd.xml -> primary (+ filelists when available).
// Resolves to [] when the repo hasn't been published yet.
async function loadFedoraPackages({ force = false } = {}) {
  const cacheBust = force ? `?t=${Date.now()}` : "";
  const response = await fetch(`${FEDORA_PATH}/repodata/repomd.xml${cacheBust}`, {
    cache: force ? "no-store" : "default",
  });
  // Without a 404.html, Cloudflare Pages answers unknown paths with index.html (200),
  // so an HTML body means "not published yet" just like a real 404.
  const isHtml = (response.headers.get("content-type") || "").includes("text/html");
  if (response.status === 404 || (response.ok && isHtml)) return [];
  if (!response.ok) throw new Error(`Repository metadata returned ${response.status}`);

  const hrefs = repomdDataHrefs(parseXml(await response.text(), "repomd.xml"));
  if (!hrefs.primary) throw new Error("repomd.xml lists no primary metadata.");

  // Data files are content-addressed (hash in the name), so they never need a cache bust.
  const [primaryText, filelistsText] = await Promise.all([
    fetchRpmMetadata(hrefs.primary),
    hrefs.filelists
      ? fetchRpmMetadata(hrefs.filelists).catch((error) => {
          console.warn("Skipping file lists", error);
          return null;
        })
      : null,
  ]);

  const filesByPkgid = filelistsText ? filesFromFilelists(parseXml(filelistsText, "filelists")) : null;
  return packagesFromPrimary(parseXml(primaryText, "primary"), filesByPkgid);
}

// Fetches one repodata file as text, decompressing by its href extension.
async function fetchRpmMetadata(href) {
  const fileName = href.split("/").pop();
  const isGzip = href.endsWith(".gz");
  if (!isGzip && !href.endsWith(".xml")) {
    const extension = fileName.slice(fileName.lastIndexOf("."));
    throw new Error(`Fedora metadata is ${extension}-compressed, which this page can't read (only .gz is supported).`);
  }
  if (isGzip && !("DecompressionStream" in window)) {
    throw new Error("This browser cannot read gzip streams directly.");
  }

  const response = await fetch(`${FEDORA_PATH}/${href}`);
  if (!response.ok) throw new Error(`${fileName} returned ${response.status}`);
  if (!isGzip) return response.text();
  return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text();
}

function parseXml(text, label) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (!doc.documentElement || doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error(`Could not parse ${label} metadata.`);
  }
  return doc;
}

// Maps each repomd <data type="..."> to its location href.
function repomdDataHrefs(doc) {
  const hrefs = {};
  childrenNS(doc.documentElement, RPM_NS.repo, "data").forEach((data) => {
    const href = childNS(data, RPM_NS.repo, "location")?.getAttribute("href");
    if (href) hrefs[data.getAttribute("type")] = href;
  });
  return hrefs;
}

// Maps pkgid (package checksum) -> file paths; directories get a trailing slash like pacman's lists.
function filesFromFilelists(doc) {
  const byPkgid = new Map();
  childrenNS(doc.documentElement, RPM_NS.filelists, "package").forEach((pkg) => {
    const files = childrenNS(pkg, RPM_NS.filelists, "file").map((file) =>
      file.getAttribute("type") === "dir" ? `${textOf(file)}/` : textOf(file),
    );
    byPkgid.set(pkg.getAttribute("pkgid"), files);
  });
  return byPkgid;
}

// Normalizes primary.xml into the same package shape the Arch path renders.
// One tree can hold builds for several Fedora releases, so keep the newest build per name.
function packagesFromPrimary(doc, filesByPkgid) {
  const newest = new Map();
  childrenNS(doc.documentElement, RPM_NS.common, "package")
    .filter((el) => el.getAttribute("type") === "rpm")
    .map((el) => normalizeRpmPackage(el, filesByPkgid))
    .filter((pkg) => pkg.name && pkg.version && pkg.arch !== "src")
    .forEach((pkg) => {
      const seen = newest.get(pkg.name);
      if (!seen || pkg.buildDate > seen.buildDate) newest.set(pkg.name, pkg);
    });
  return [...newest.values()];
}

function normalizeRpmPackage(el, filesByPkgid) {
  const child = (name) => childNS(el, RPM_NS.common, name);
  const text = (name) => textOf(child(name));
  const attr = (name, attribute) => child(name)?.getAttribute(attribute) || "";
  const format = child("format");
  const rpmText = (name) => (format ? textOf(childNS(format, RPM_NS.rpm, name)) : "");
  const deps = (kind) => {
    const list = format && childNS(format, RPM_NS.rpm, kind);
    return list ? childrenNS(list, RPM_NS.rpm, "entry") : [];
  };

  const name = text("name");
  const version = child("version");
  const checksum = child("checksum");
  const pkgid = textOf(checksum);
  const href = attr("location", "href");
  const license = rpmText("license");

  return {
    filename: href.split("/").pop(),
    name,
    base: rpmText("sourcerpm"),
    version: version ? formatEvr(version) : "",
    description: text("summary"),
    csize: Number(attr("size", "package") || 0),
    isize: Number(attr("size", "installed") || 0),
    sha256sum: checksum?.getAttribute("type") === "sha256" ? pkgid : "",
    url: text("url"),
    licenses: license ? [license] : [],
    arch: text("arch"),
    buildDate: Number(attr("time", "build") || 0),
    packager: text("packager"),
    depends: rpmRequires(deps("requires")),
    optdepends: uniqueDeps([...deps("recommends"), ...deps("suggests")].map(formatRpmDep)),
    makedepends: [],
    conflicts: uniqueDeps(deps("conflicts").map(formatRpmDep)),
    provides: uniqueDeps(
      deps("provides")
        .filter((entry) => !isSelfProvide(entry.getAttribute("name"), name))
        .map(formatRpmDep),
    ),
    // primary.xml only carries a subset of paths, so show nothing rather than a partial list.
    files: filesByPkgid?.get(pkgid) || [],
    downloadUrl: href ? `${FEDORA_PATH}/${href}` : "",
  };
}

// Requires minus rpm's machinery: rpmlib()/rtld() features and file-path deps (/bin/sh)
// are dropped, and per-symbol soname variants collapse to the soname
// (libc.so.6(GLIBC_2.34)(64bit) -> libc.so.6).
function rpmRequires(entries) {
  return uniqueDeps(
    entries
      .map((entry) => {
        const name = entry.getAttribute("name");
        if (name.startsWith("/") || /^(rpmlib|rtld)\(/.test(name)) return "";
        const soname = name.match(/^([^()]+\.so[^()]*)\(/);
        return soname ? soname[1] : formatRpmDep(entry);
      })
      .filter(Boolean),
  );
}

// rpm auto-provides the package name, its arch-qualified form, and config(name).
function isSelfProvide(provide, name) {
  return provide === name || provide.startsWith(`${name}(`) || provide === `config(${name})`;
}

function formatRpmDep(entry) {
  const name = entry.getAttribute("name");
  const operator = RPM_FLAG_OPERATORS[entry.getAttribute("flags")];
  return operator ? `${name} ${operator} ${formatEvr(entry)}` : name;
}

// `[epoch:]ver[-rel]`, omitting a zero epoch the way dnf does.
function formatEvr(el) {
  const epoch = el.getAttribute("epoch");
  const ver = el.getAttribute("ver") || "";
  const rel = el.getAttribute("rel");
  return `${epoch && epoch !== "0" ? `${epoch}:` : ""}${ver}${rel ? `-${rel}` : ""}`;
}

function uniqueDeps(values) {
  return [...new Set(values)];
}

// Element children of `node` in namespace `ns` named `localName`.
function childrenNS(node, ns, localName) {
  return Array.from(node.childNodes).filter(
    (child) => child.nodeType === 1 && child.namespaceURI === ns && child.localName === localName,
  );
}

function childNS(node, ns, localName) {
  return childrenNS(node, ns, localName)[0] || null;
}

function textOf(node) {
  return node ? node.textContent.trim() : "";
}

// Arch splits out `-debug`; Fedora splits out `-debuginfo` / `-debugsource`.
function isDebugPackage(pkg) {
  return /-debug(info|source)?$/.test(pkg.name);
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
  const latestBuild = Math.max(0, ...state.packages.map((pkg) => pkg.buildDate || 0));

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
    .map((pkg, i) => {
      const isActive = pkg.name === state.selectedName;
      const index = String(i + 1).padStart(2, "0");
      const meta = [pkg.version, pkg.arch || "unknown", formatBytes(pkg.csize)]
        .filter(Boolean)
        .join("  ·  ");
      return `
        <button class="package-card ${isActive ? "is-active" : ""}" type="button" data-package="${escapeAttr(pkg.name)}">
          <span class="pkg-index">${index}</span>
          <span class="pkg-main">
            <span class="pkg-name">${escapeHtml(pkg.name)}</span>
            <span class="pkg-desc">${escapeHtml(pkg.description || "No description provided.")}</span>
            <span class="pkg-meta">${escapeHtml(meta)}</span>
          </span>
        </button>
      `;
    })
    .join("");

  els.list.querySelectorAll("[data-package]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedName = button.dataset.package;
      updateUrl({ packageName: state.selectedName });
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

  const distro = DISTROS[state.distro];
  const installCommand = distro.installCommand(pkg.name);
  const upstream = pkg.url
    ? `<a href="${escapeAttr(pkg.url)}" rel="noreferrer">${escapeHtml(cleanUrl(pkg.url))}</a>`
    : "—";

  els.details.innerHTML = `
    <div class="detail-heading">
      <div class="detail-title">
        <h3>${escapeHtml(pkg.name)}</h3>
        <p>${escapeHtml(pkg.description || "No description provided.")}</p>
      </div>
      ${pkg.downloadUrl ? `<a class="icon-button" href="${escapeAttr(pkg.downloadUrl)}" download aria-label="Download package">${ICONS.download}</a>` : ""}
    </div>

    <div class="command-box">
      <code>${escapeHtml(installCommand)}</code>
      <button class="icon-button" type="button" data-copy-install aria-label="Copy install command">${ICONS.copy}</button>
    </div>

    <div class="meta-grid">
      ${metaItem("Version", pkg.version)}
      ${metaItem("Architecture", pkg.arch)}
      ${metaItem("Compressed", formatBytes(pkg.csize))}
      ${metaItem("Installed", formatBytes(pkg.isize))}
      ${metaItem("Build date", pkg.buildDate ? formatFullDate(pkg.buildDate) : "—")}
      ${metaItem("License", pkg.licenses.join(", ") || "—")}
      ${metaItem(distro.baseLabel, pkg.base || "—")}
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
        ${pkg.sha256sum ? `<button class="icon-button" type="button" data-copy-sha aria-label="Copy SHA-256 checksum">${ICONS.copy}</button>` : ""}
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
