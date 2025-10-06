/* Shinnie Star — Meesho Crop (Lite) remove extras: only keep pages that look like labels */

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
  if (themeToggle) themeToggle.textContent = document.documentElement.classList.contains("light") ? "Dark" : "Light";
})();
themeToggle?.addEventListener("click", () => {
  const isLight = document.documentElement.classList.toggle("light");
  localStorage.setItem("theme", isLight ? "light" : "dark");
  if (themeToggle) themeToggle.textContent = isLight ? "Dark" : "Light";
});
refreshBtn?.addEventListener("click", () => window.location.reload());
backBtn?.addEventListener("click", () => (window.location.href = "https://www.shinniestar.com"));

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

/* Fixed crop-box (Python parity) */
const CROP_LEFT = 10;
const CROP_BOTTOM = 480;
const CROP_RIGHT = 585;
const CROP_TOP = 825;

/* Heuristics to accept a page as a real label */
const MIN_H = 140;        // min cropped height
const MIN_W = 250;        // min cropped width
const BARCODE_MIN_WFR = 0.25; // barcode band should span at least 25% width

function getCropDims() {
  return {
    cropW: Math.max(10, CROP_RIGHT - CROP_LEFT),
    cropH: Math.max(10, CROP_TOP - CROP_BOTTOM),
  };
}

function looksLikeLabel(cropW, cropH) {
  if (cropH < MIN_H || cropW < MIN_W) return false;
  // Barcode band rough presence by geometry window (lower third height window)
  const bandH = Math.min(120, Math.max(60, Math.floor(cropH * 0.22)));
  const bandW = cropW * BARCODE_MIN_WFR;
  if (bandW < 120) return false; // too small to host bars
  return true;
}

async function cropAndMerge(files) {
  await ensurePDFLib();
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  // Count total pages for progress
  let total = 0;
  const buffers = [];
  for (const f of files) {
    const b = await readFileAsArrayBuffer(f);
    buffers.push(b);
    const t = await PDFDocument.load(b, { ignoreEncryption: true });
    total += t.getPageCount();
  }

  const { cropW, cropH } = getCropDims();
  let done = 0, kept = 0, skipped = 0;

  const tick = () => {
    const pct = Math.floor((done / total) * 100);
    progressDiv.textContent = `Processed ${done}/${total} (${pct}%) • kept ${kept}, skipped ${skipped}`;
  };

  for (const b of buffers) {
    const src = await PDFDocument.load(b, { ignoreEncryption: true });
    const n = src.getPageCount();
    const refs = await outDoc.copyPages(src, Array.from({ length: n }, (_, i) => i));

    for (const ref of refs) {
      const pageW = ref.getWidth();
      const pageH = ref.getHeight();

      // Heuristic filter before drawing
      if (!looksLikeLabel(cropW, cropH)) { skipped++; done++; tick(); continue; }

      // Final cropped page
      const finalPage = outDoc.addPage([cropW, cropH]);
      const emb = await outDoc.embedPage(ref);
      finalPage.drawPage(emb, {
        x: -CROP_LEFT,
        y: -CROP_BOTTOM,
        width: pageW,
        height: pageH,
      });

      kept++;
      done++;
      if (done === 1 || done % 3 === 0 || done === total) { tick(); await new Promise(r=>setTimeout(r,0)); }
    }
  }

  // Safety: if all skipped by heuristic (rare), write first as fallback
  if (kept === 0) {
    const p = outDoc.addPage([400, 200]);
    p.drawText("All pages skipped as non-label by heuristic. Adjust thresholds.", { x: 20, y: 100, size: 12 });
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
    downloadPdf(bytes, `Shinnie-star_meesho_cropped_${ts}.pdf`);
    progressDiv.textContent = "Done (100%).";
    resultDiv.textContent = "Downloaded cropped PDF.";
  } catch (e) {
    console.error(e);
    resultDiv.textContent = "Failed: " + (e?.message || e);
  } finally { btn.disabled = false; btn.textContent = "Process"; }
});
