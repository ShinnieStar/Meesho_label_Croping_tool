/* Shinnie Star — Meesho Crop (Lite) exact Python order: crop first, then rotate into portrait */

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

/* pdf-lib */
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

/* Python-calibrated constants */
const LEFT_X = 10;
const RIGHT_X_MAX = 585;
const TOP_Y_MAX = 832;
const CALIB_INVOICE_PT = 292;
const EXTRA_PT  = -8;

function computeCrop(p) {
  const pageW = p.getWidth();
  const pageH = p.getHeight();
  const left = LEFT_X;
  const right = Math.min(RIGHT_X_MAX, pageW - 10);
  const top = Math.min(TOP_Y_MAX, pageH - 10);
  const bottom = Math.max(100, pageH - CALIB_INVOICE_PT + EXTRA_PT);
  const cropW = right - left;
  const cropH = Math.max(120, top - bottom);
  return { pageW, pageH, left, bottom, cropW, cropH };
}

async function cropAndMerge(files) {
  await ensurePDFLib();
  const { PDFDocument, degrees } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  // Preload and count pages
  let total = 0;
  const buffers = [];
  for (const f of files) {
    const b = await readFileAsArrayBuffer(f);
    buffers.push(b);
    const tmp = await PDFDocument.load(b, { ignoreEncryption: true });
    total += tmp.getPageCount();
  }

  let done = 0;
  const tick = () => {
    const pct = Math.floor((done / total) * 100);
    progressDiv.textContent = `Processing ${done}/${total} (${pct}%)`;
  };

  for (const b of buffers) {
    const src = await PDFDocument.load(b, { ignoreEncryption: true });
    const idxs = Array.from({ length: src.getPageCount() }, (_, i) => i);
    const srcPages = await outDoc.copyPages(src, idxs); // copy refs once

    for (const srcPage of srcPages) {
      const { pageW, pageH, left, bottom, cropW, cropH } = computeCrop(srcPage);

      // Final portrait page size
      const portraitW = Math.min(cropW, cropH);
      const portraitH = Math.max(cropW, cropH);
      const finalPage = outDoc.addPage([portraitW, portraitH]);

      // Embed original source page (not temp), then apply translation + optional rotation
      const emb = await outDoc.embedPage(srcPage);

      const needRotate = cropW > cropH;

      if (!needRotate) {
        // No rotation: just translate so (left,bottom) moves to (0,0), then scale full page
        finalPage.drawPage(emb, {
          x: -left,
          y: -bottom,
          width: pageW,
          height: pageH,
        });
      } else {
        // Rotate cropped block by -90 degrees around origin after translation.
        // To emulate: first translate so crop origin aligns, then rotate canvas.
        // drawPage rotation rotates around lower-left of target; adjust translate accordingly.
        // After rotation, width/height map swapped into portrait page.
        finalPage.drawPage(emb, {
          x: -left,
          y: -bottom,
          width: pageW,
          height: pageH,
          rotate: degrees(-90),
        });
      }

      done++;
      if (done === 1 || done % 3 === 0 || done === total) { tick(); await new Promise(r=>setTimeout(r,0)); }
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
