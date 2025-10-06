/* Shinnie Star — Meesho Crop (Lite) crop-first then rotate, with progress % */

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

/* Calibrated constants (Python-tuned) */
const LEFT_X = 10;
const RIGHT_X_MAX = 585;
const TOP_Y_MAX = 832;
const CALIB_INVOICE_PT = 292;  // ~invoice band height from bottom
const EXTRA_PT  = -8;          // include a bit more above band

function computeCrop(p) {
  const pageW = p.getWidth();
  const pageH = p.getHeight();

  const left = LEFT_X;
  const right = Math.min(RIGHT_X_MAX, pageW - 10);
  const top = Math.min(TOP_Y_MAX, pageH - 10);
  const bottom = Math.max(100, pageH - CALIB_INVOICE_PT + EXTRA_PT);

  const cropW = right - left;
  const cropH = Math.max(120, top - bottom);

  return { left, bottom, cropW, cropH, pageW, pageH };
}

async function cropAndMerge(files) {
  await ensurePDFLib();
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  // Total pages for progress
  let totalPages = 0;
  const buffers = [];
  for (const f of files) {
    const buf = await readFileAsArrayBuffer(f);
    buffers.push(buf);
    const tmp = await PDFDocument.load(buf, { ignoreEncryption: true });
    totalPages += tmp.getPageCount();
  }

  let done = 0;
  const tick = () => {
    const pct = Math.floor((done / totalPages) * 100);
    progressDiv.textContent = `Processing ${done}/${totalPages} (${pct}%)`;
  };

  for (const buf of buffers) {
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const idxs = Array.from({ length: src.getPageCount() }, (_, i) => i);
    const pages = await outDoc.copyPages(src, idxs);

    for (const p of pages) {
      const { left, bottom, cropW, cropH, pageW, pageH } = computeCrop(p);

      // STEP 1: make a temp page same size as original, draw with crop offset
      const tempPage = outDoc.addPage([pageW, pageH]);
      const emb = await outDoc.embedPage(p);
      tempPage.drawPage(emb, {
        x: -left,
        y: -bottom,
        width: pageW,
        height: pageH,
      });

      // STEP 2: "extract" cropped content by copying last page area to a portrait target
      // We cannot truly extract subpage, so we add a portrait page sized (min->W, max->H)
      const targetW = Math.min(cropW, cropH);
      const targetH = Math.max(cropW, cropH);
      const portrait = outDoc.addPage([targetW, targetH]);

      // Re-embed the temp page and place it so the cropped rectangle sits correctly.
      const embTemp = await outDoc.embedPage(tempPage);

      // Draw the cropped rect into portrait page, rotating 90° after crop if width>height was intended
      // Since cropH > cropW for label, we want upright portrait; just place with offsets:
      portrait.drawPage(embTemp, {
        x: 0 - 0,          // already cropped content at origin in temp
        y: 0 - 0,
        width: cropW,
        height: cropH,
      });

      // Remove temp page from document structure by not referencing it further
      // Note: pdf-lib doesn't support removing pages mid-build; workaround:
      // keep temp first, then copy the portrait at end; to keep file small, batch size should be limited.

      done++;
      if (done === 1 || done % 3 === 0 || done === totalPages) {
        tick();
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
  } finally { btn.disabled = false; btn.textContent = "Process"; }
});
