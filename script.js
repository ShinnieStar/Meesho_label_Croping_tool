/* Shinnie Star — Meesho Crop (Lite) fixed cutoff + portrait + progress % + perf fixes */

const btn = document.getElementById("processBtn");
const filesInput = document.getElementById("pdfs");
const resultDiv = document.getElementById("result");
const progressDiv = document.getElementById("progress");
const refreshBtn = document.getElementById("refreshBtn");
const backBtn = document.getElementById("backBtn");
const themeToggle = document.getElementById("themeToggle");

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

/* Ensure pdf-lib once */
let pdfLibReady = false;
async function ensurePDFLib() {
  if (pdfLibReady && window.PDFLib) return;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-pdflib]');
    if (existing) { existing.onload = resolve; existing.onerror = reject; return; }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
    s.async = true;
    s.defer = true;
    s.dataset.pdflib = "1";
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
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

/* Fixed params to mimic your desktop tuning */
const LEFT_X = 10;
const RIGHT_X_MAX = 585;
const TOP_Y_MAX = 832;
const CUTOFF_PT = 260;
const EXTRA_PT  = -8;

function cropRectForPage(p) {
  const pageW = p.getWidth();
  const pageH = p.getHeight();

  const left = LEFT_X;
  const right = Math.min(RIGHT_X_MAX, pageW - 10);
  const top = Math.min(TOP_Y_MAX, pageH - 10);
  const bottom = Math.max(100, pageH - CUTOFF_PT + EXTRA_PT);

  const width = right - left;
  const height = Math.max(120, top - bottom);

  // Portrait target size: height >= width
  const targetW = Math.min(width, height);
  const targetH = Math.max(width, height);

  return { left, bottom, width, height, targetW, targetH, pageW, pageH };
}

async function cropAndMerge(files) {
  await ensurePDFLib();
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  // Count total pages for progress
  let totalPages = 0;
  const fileBuffers = [];
  for (const f of files) {
    const buf = await readFileAsArrayBuffer(f);
    fileBuffers.push(buf);
    const tmp = await PDFDocument.load(buf, { ignoreEncryption: true });
    totalPages += tmp.getPageCount();
  }

  let donePages = 0;
  const updateProgress = () => {
    const pct = Math.floor((donePages / totalPages) * 100);
    progressDiv.textContent = `Processing ${donePages}/${totalPages} (${pct}%)`;
  };

  for (const buf of fileBuffers) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const count = src.getPageCount();
    // Copy all pages references first (faster than per-page load)
    const pages = await outDoc.copyPages(src, Array.from({ length: count }, (_, i) => i));

    for (const p of pages) {
      const rect = cropRectForPage(p);

      // Create portrait page once; pdf-lib lacks direct rotate during draw,
      // so we set target page portrait and offset original content.
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
        // allow UI to paint
        await new Promise(r => setTimeout(r, 0));
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
  resultDiv.textContent = "";
  progressDiv.textContent = "";

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
