/* Shinnie Star — Meesho Crop (Lite) fixed calibrated cutoff + portrait + progress % + basic sort */

const btn = document.getElementById("processBtn");
const filesInput = document.getElementById("pdfs");
const resultDiv = document.getElementById("result");
const progressDiv = document.getElementById("progress");
const refreshBtn = document.getElementById("refreshBtn");
const backBtn = document.getElementById("backBtn");
const themeToggle = document.getElementById("themeToggle");
const sortBy = document.getElementById("sortBy");

/* Theme */
(function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  if (saved === "light") document.documentElement.classList.add("light");
  themeToggle.textContent = document.documentElement.classList.contains("light") ? "Dark" : "Light";
})();
themeToggle.addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  themeToggle.textContent = isLight ? "Dark" : "Light";
});
refreshBtn?.addEventListener("click", () => window.location.reload());
backBtn?.addEventListener("click", () => window.location.href = "https://www.shinniestar.com");

/* pdf-lib loader */
let pdfLibReady = false;
async function ensurePDFLib() {
  if (pdfLibReady && window.PDFLib) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
    s.onload = resolve; s.onerror = reject; document.body.appendChild(s);
  });
  pdfLibReady = true;
}

function readFileAsArrayBuffer(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}

/* Calibrated params from original PDF */
const LEFT_X = 10;
const RIGHT_X_MAX = 585;
const TOP_Y_MAX = 832;
// Using ~292pt calibrated invoice band height; add small extra -8 like desktop
const CALIB_INVOICE_PT = 292;
const EXTRA_PT  = -8;

function cropRectForPage(p) {
  const pageW = p.getWidth();
  const pageH = p.getHeight();

  const left = LEFT_X;
  const right = Math.min(RIGHT_X_MAX, pageW - 10);
  const top = Math.min(TOP_Y_MAX, pageH - 10);
  const bottom = Math.max(100, pageH - CALIB_INVOICE_PT + EXTRA_PT);

  const width = right - left;
  const height = Math.max(120, top - bottom);

  // force portrait target size
  const targetW = Math.min(width, height);
  const targetH = Math.max(width, height);

  return { left, bottom, width, height, targetW, targetH, pageW, pageH };
}

/* Basic client-side sort (best-effort using filename tokens) */
function sortFiles(files, mode) {
  const arr = Array.from(files || []);
  if (mode === "name") return arr.sort((a,b)=> a.name.localeCompare(b.name));
  if (mode === "sku") {
    // heuristic: find token with letters-digits-dashes near 'SKU' in filename
    const skukey = f => {
      const name = f.name.toLowerCase();
      const m = name.match(/[a-z0-9]{3,}[-_a-z0-9]*\d{2,}/);
      return m ? m[0] : name;
    };
    return arr.sort((a,b)=> skukey(a).localeCompare(skukey(b)));
  }
  if (mode === "size") {
    const sizekey = f => {
      const m = f.name.match(/(?:size|sz|s)(?:-|_|\s*)?(\d{2})/i) || f.name.match(/(\d{2})(?:-|_)?/);
      return m ? parseInt(m[1],10) : 0;
    };
    return arr.sort((a,b)=> sizekey(a)-sizekey(b));
  }
  if (mode === "courier") {
    const ck = f => {
      const n = f.name.toLowerCase();
      if (n.includes("shadowfax")) return "1_shadowfax";
      if (n.includes("delhivery")) return "2_delhivery";
      if (n.includes("xpressbees") || n.includes("xpress")) return "3_xpress";
      return "9_other_"+n;
    };
    return arr.sort((a,b)=> ck(a).localeCompare(ck(b)));
  }
  return arr; // none
}

async function cropAndMerge(files) {
  await ensurePDFLib();
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  // Sort selection
  const sortedFiles = sortFiles(files, sortBy.value);

  // Count pages
  let totalPages = 0;
  const buffers = [];
  for (const f of sortedFiles) {
    const buf = await readFileAsArrayBuffer(f);
    buffers.push(buf);
    const tmp = await PDFDocument.load(buf, { ignoreEncryption: true });
    totalPages += tmp.getPageCount();
  }

  let donePages = 0;
  const updateProgress = () => {
    const pct = Math.floor((donePages / totalPages) * 100);
    progressDiv.textContent = `Processing ${donePages}/${totalPages} (${pct}%)`;
  };

  for (const buf of buffers) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const count = src.getPageCount();
    const pages = await outDoc.copyPages(src, Array.from({length:count}, (_,i)=>i));

    for (const p of pages) {
      const rect = cropRectForPage(p);

      const newPage = outDoc.addPage([rect.targetW, rect.targetH]);
      const embedded = await outDoc.embedPage(p);
      newPage.drawPage(embedded, {
        x: -rect.left,
        y: -rect.bottom,
        width: rect.pageW,
        height: rect.pageH,
      });

      donePages++;
      if (donePages === 1 || donePages % 3 === 0 || donePages === totalPages) {
        updateProgress();
        await new Promise(r=>setTimeout(r,0));
      }
    }
  }
  return await outDoc.save();
}

function downloadPdf(bytes, name) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

btn.addEventListener("click", async () => {
  resultDiv.textContent = ""; progressDiv.textContent = "";
  const files = Array.from(filesInput.files || []);
  if (!files.length) { resultDiv.textContent = "Please select at least one PDF."; return; }

  btn.disabled = true; btn.textContent = "Processing…";
  try {
    const bytes = await cropAndMerge(files);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    downloadPdf(bytes, `Shinnie-Star-Meesho-Cropped-${ts}.pdf`);
    progressDiv.textContent = "Done (100%).";
    resultDiv.textContent = "Downloaded cropped PDF.";
  } catch (e) {
    console.error(e);
    resultDiv.textContent = "Failed: " + (e?.message || e);
  } finally {
    btn.disabled = false; btn.textContent = "Process";
  }
});
