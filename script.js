/* Shinnie Star — Meesho Crop (Lite) Python-parity: crop first, then rotate cropped block */

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

/* Python-tuned constants (from your desktop runs) */
const LEFT_X = 10;
const RIGHT_X_MAX = 585;
const TOP_Y_MAX = 832;
const CALIB_INVOICE_PT = 292;   // where invoice band starts from bottom
const EXTRA_PT  = -8;           // include a bit more label

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
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  // total pages
  let total = 0;
  const bufs = [];
  for (const f of files) {
    const b = await readFileAsArrayBuffer(f);
    bufs.push(b);
    const tmp = await PDFDocument.load(b, { ignoreEncryption: true });
    total += tmp.getPageCount();
  }
  let done = 0;
  const tick = () => {
    const pct = Math.floor((done / total) * 100);
    progressDiv.textContent = `Processing ${done}/${total} (${pct}%)`;
  };

  for (const b of bufs) {
    const src = await PDFDocument.load(b, { ignoreEncryption: true });
    const idxs = Array.from({ length: src.getPageCount() }, (_, i) => i);
    const pages = await outDoc.copyPages(src, idxs);

    for (const p of pages) {
      const { pageW, pageH, left, bottom, cropW, cropH } = computeCrop(p);

      // A) Draw original into a temp page same size, offset to reveal only crop area
      const temp = outDoc.addPage([pageW, pageH]);
      const emb = await outDoc.embedPage(p);
      temp.drawPage(emb, {
        x: -left,
        y: -bottom,
        width: pageW,
        height: pageH,
      });

      // B) Now place cropped block onto final portrait page
      const portraitW = Math.min(cropW, cropH);
      const portraitH = Math.max(cropW, cropH);
      const finalPage = outDoc.addPage([portraitW, portraitH]);

      const embTemp = await outDoc.embedPage(temp);

      // If cropped block is wider than tall, rotate 270 so portrait ban jaye
      const needRotate = cropW > cropH;

      if (!needRotate) {
        // portrait content already: draw at origin
        finalPage.drawPage(embTemp, {
          x: 0, y: 0, width: cropW, height: cropH,
        });
      } else {
        // rotate 270: use drawPage with rotation matrix via rotateRadians helper
        // pdf-lib v1.17: use degrees via rotate: { angle: degrees }
        finalPage.drawPage(embTemp, {
          x: 0, y: 0, width: cropW, height: cropH, rotate: PDFLib.degrees(-90),
        });
      }

      done++;
      if (done === 1 || done % 3 === 0 || done === total) {
        tick();
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
  } finally { btn.disabled = false; btn.textContent = "Process"; }
});
