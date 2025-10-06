/* Shinnie Star — Meesho Crop (Lite) fixed cutoff + portrait; no sliders */

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

async function ensurePDFLib() {
  if (!window.PDFLib) {
    await new Promise((r) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
      s.onload = r; document.body.appendChild(s);
    });
  }
}

function readFileAsArrayBuffer(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(file);
  });
}

/* Fixed params to mimic Python v3 defaults */
const LEFT_X = 10;
const RIGHT_X_MAX = 585;
const TOP_Y_MAX = 832;
const CUTOFF_PT = 260;   // invoice band thickness heuristic
const EXTRA_PT  = -8;    // include a bit more top like desktop

function cropRectForPage(p) {
  const pageW = p.getWidth();
  const pageH = p.getHeight();
  const left = LEFT_X;
  const right = Math.min(RIGHT_X_MAX, pageW - 10);
  const top = Math.min(TOP_Y_MAX, pageH - 10);
  const bottom = Math.max(100, pageH - CUTOFF_PT + EXTRA_PT);
  const width = right - left;
  const height = Math.max(120, top - bottom);
  // Portrait target size
  const targetW = Math.min(width, height);
  const targetH = Math.max(width, height);
  return { left, bottom, width, height, targetW, targetH, pageW, pageH };
}

async function cropAndMerge(files) {
  await ensurePDFLib();
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  let processed = 0;
  for (const f of files) {
    const buf = await readFileAsArrayBuffer(f);
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const count = src.getPageCount();
    const pages = await outDoc.copyPages(src, Array.from({length:count}, (_,i)=>i));

    for (const p of pages) {
      const rect = cropRectForPage(p);
      const newPage = outDoc.addPage([rect.targetW, rect.targetH]);
      const embedded = await outDoc.embedPage(p);

      // Draw with offset so that crop area appears; emulate portrait by using taller target page
      newPage.drawPage(embedded, {
        x: -rect.left,
        y: -rect.bottom,
        width: rect.pageW,
        height: rect.pageH,
      });

      processed++;
      if (processed % 2 === 0) progressDiv.textContent = `Processed ${processed} pages…`;
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
    progressDiv.textContent = "Done."; resultDiv.textContent = "Downloaded cropped PDF.";
  } catch (e) {
    console.error(e);
    resultDiv.textContent = "Failed: " + (e?.message || e);
  } finally {
    btn.disabled = false; btn.textContent = "Process";
  }
});
