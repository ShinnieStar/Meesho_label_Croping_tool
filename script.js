/* Shinnie Star — Meesho Crop (Lite) 2-step:
   Step 1: Crop only (no rotate), enable 'Download Rotated'
   Step 2: Rotate 90° CW and download  */

const btnCrop = document.getElementById("processBtn");
const btnRotate = document.getElementById("rotateBtn");
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
function downloadPdf(bytes, name) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* Fixed crop box (Python parity) */
const CROP_LEFT = 10;
const CROP_BOTTOM = 480;
const CROP_RIGHT = 585;
const CROP_TOP = 825;

let lastCroppedBytes = null;

async function cropOnly(files) {
  await ensurePDFLib();
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  // Count pages
  let total = 0;
  const buffers = [];
  for (const f of files) {
    const b = await readFileAsArrayBuffer(f);
    buffers.push(b);
    const t = await PDFDocument.load(b, { ignoreEncryption: true });
    total += t.getPageCount();
  }

  let done = 0;
  const tick = () => {
    const pct = Math.floor((done / total) * 100);
    progressDiv.textContent = `Cropping ${done}/${total} (${pct}%)`;
  };

  const cropW = Math.max(10, CROP_RIGHT - CROP_LEFT);
  const cropH = Math.max(10, CROP_TOP - CROP_BOTTOM);

  for (const b of buffers) {
    const src = await PDFDocument.load(b, { ignoreEncryption: true });
    const idxs = Array.from({ length: src.getPageCount() }, (_, i) => i);
    const refs = await outDoc.copyPages(src, idxs);

    for (const ref of refs) {
      const pageW = ref.getWidth();
      const pageH = ref.getHeight();

      // Final cropped page exactly crop size (no rotation)
      const finalPage = outDoc.addPage([cropW, cropH]);
      const emb = await outDoc.embedPage(ref);
      finalPage.drawPage(emb, {
        x: -CROP_LEFT,
        y: -CROP_BOTTOM,
        width: pageW,
        height: pageH,
      });

      done++;
      if (done === 1 || done % 3 === 0 || done === total) { tick(); await new Promise(r=>setTimeout(r,0)); }
    }
  }

  lastCroppedBytes = await outDoc.save();
  return lastCroppedBytes;
}

async function downloadRotated() {
  if (!lastCroppedBytes) {
    resultDiv.textContent = "No cropped PDF in memory. Crop first.";
    return;
  }
  await ensurePDFLib();
  const { PDFDocument, degrees } = window.PDFLib;

  const src = await PDFDocument.load(lastCroppedBytes, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();

  const total = src.getPageCount();
  let done = 0;
  const tick = () => {
    const pct = Math.floor((done / total) * 100);
    progressDiv.textContent = `Rotating ${done}/${total} (${pct}%)`;
  };

  for (let i = 0; i < total; i++) {
    const p = (await outDoc.copyPages(src, [i]))[0];
    const w = p.getWidth();
    const h = p.getHeight();
    // Final portrait page
    const finalW = Math.min(w, h);
    const finalH = Math.max(w, h);
    const finalPage = outDoc.addPage([finalW, finalH]);

    const emb = await outDoc.embedPage(p);
    // Rotate 90 CW; content will appear turned; since page size is portrait, it will fit
    finalPage.drawPage(emb, { x: 0, y: 0, width: w, height: h, rotate: degrees(90) });

    done++;
    if (done === 1 || done % 3 === 0 || done === total) { tick(); await new Promise(r=>setTimeout(r,0)); }
  }

  const bytes = await outDoc.save();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  downloadPdf(bytes, `Shinnie-star_meesho_cropped_rotated_${ts}.pdf`);
  progressDiv.textContent = "Done (100%).";
  resultDiv.textContent = "Downloaded rotated PDF.";
}

/* UI events */
btnCrop.addEventListener("click", async () => {
  resultDiv.textContent = ""; progressDiv.textContent = "";
  const files = Array.from(filesInput.files || []);
  if (!files.length) { resultDiv.textContent = "Please select at least one PDF."; return; }
  btnCrop.disabled = true; btnCrop.textContent = "Cropping…";
  btnRotate.style.display = "none";
  try {
    await cropOnly(files);
    resultDiv.textContent = "Cropped PDF ready in memory.";
    btnRotate.style.display = "inline-block";
  } catch (e) {
    console.error(e);
    resultDiv.textContent = "Failed: " + (e?.message || e);
  } finally {
    btnCrop.disabled = false; btnCrop.textContent = "Crop";
  }
});

btnRotate.addEventListener("click", async () => {
  btnRotate.disabled = true; btnRotate.textContent = "Rotating…";
  try {
    await downloadRotated();
  } catch (e) {
    console.error(e);
    resultDiv.textContent = "Rotate failed: " + (e?.message || e);
  } finally {
    btnRotate.disabled = false; btnRotate.textContent = "Download Rotated";
  }
});
