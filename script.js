/* Shinnie Star — Meesho Crop (Lite) ONLY CROP, no blanks:
   - add only final cropped page
   - skip tiny/empty pages
   - progress %  */

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

/* Fixed crop-box (from your Python) */
const CROP_LEFT = 10;
const CROP_BOTTOM = 480;
const CROP_RIGHT = 585;
const CROP_TOP = 825;
const MIN_HEIGHT_PT = 120; // drop pages smaller than this after crop

function cropBox() {
  const cropW = Math.max(10, CROP_RIGHT - CROP_LEFT);
  const cropH = Math.max(10, CROP_TOP - CROP_BOTTOM);
  return { cropW, cropH };
}

async function cropAndMerge(files) {
  await ensurePDFLib();
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  // Preload buffers and count pages
  let total = 0;
  const buffers = [];
  for (const f of files) {
    const b = await readFileAsArrayBuffer(f);
    buffers.push(b);
    const t = await PDFDocument.load(b, { ignoreEncryption: true });
    total += t.getPageCount();
  }

  let done = 0, kept = 0;
  const tick = () => {
    const pct = Math.floor((done / total) * 100);
    progressDiv.textContent = `Processing ${done}/${total} (${pct}%)`;
  };

  const { cropW, cropH } = cropBox();

  for (const b of buffers) {
    const src = await PDFDocument.load(b, { ignoreEncryption: true });
    const count = src.getPageCount();
    const refs = await outDoc.copyPages(src, Array.from({ length: count }, (_, i) => i));

    for (const ref of refs) {
      const pageW = ref.getWidth();
      const pageH = ref.getHeight();

      // Skip if crop area is effectively empty height
      if (cropH < MIN_HEIGHT_PT) { done++; tick(); continue; }

      // Create final page exactly crop size
      const finalPage = outDoc.addPage([cropW, cropH]);

      // Draw original with negative offsets to reveal only crop box
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

  // Safety: if nothing kept, add a message page (unlikely)
  if (kept === 0) {
    const p = outDoc.addPage([400, 200]);
    p.drawText("No pages after crop (check crop box).", { x: 20, y: 100, size: 12 });
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
