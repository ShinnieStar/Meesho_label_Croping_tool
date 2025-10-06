/* Shinnie Star — Meesho Crop (Lite)
   A) Crop & Download (no rotate)
   B) Rotate PDF (upload any, rotate 90 CW & download)
*/

const btnCropDownload = document.getElementById("btnCropDownload");
const filesInput = document.getElementById("pdfs");
const resultDiv = document.getElementById("result");
const progressDiv = document.getElementById("progress");

const btnRotateDownload = document.getElementById("btnRotateDownload");
const rotateFile = document.getElementById("rotateFile");
const rotateStatus = document.getElementById("rotateStatus");

const refreshBtn = document.getElementById("refreshBtn");
const backBtn = document.getElementById("backBtn");
const themeToggle = document.getElementById("themeToggle");

/* Guard: stop if critical elements missing */
if (!btnCropDownload || !filesInput) {
  console.error("Elements not found: check index.html IDs");
}

/* Theme */
(function initTheme() {
  const saved = localStorage.getItem("theme") || "dark";
  if (saved === "light") document.documentElement.classList.add("light");
  if (themeToggle)
    themeToggle.textContent = document.documentElement.classList.contains("light")
      ? "Dark"
      : "Light";
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
    const id = "pdf-lib-script";
    if (document.getElementById(id)) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
    s.id = id;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
  pdfLibReady = true;
}

/* Utils */
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
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* Fixed crop box (Python parity) */
const CROP_LEFT = 10;
const CROP_BOTTOM = 480;
const CROP_RIGHT = 585;
const CROP_TOP = 825;

/* =======================
   A) Crop & Download
======================= */
async function cropAndDownload(files) {
  await ensurePDFLib();
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

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

      const finalPage = outDoc.addPage([cropW, cropH]);
      const emb = await outDoc.embedPage(ref);
      finalPage.drawPage(emb, {
        x: -CROP_LEFT,
        y: -CROP_BOTTOM,
        width: pageW,
        height: pageH,
      });

      done++;
      if (done === 1 || done % 3 === 0 || done === total) {
        tick();
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  const bytes = await outDoc.save();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  downloadPdf(bytes, `Shinnie-star_meesho_cropped_${ts}.pdf`);
  progressDiv.textContent = "Done (100%).";
  resultDiv.textContent = "Cropped PDF downloaded.";
}

/* =======================
   B) Rotate & Download (Fixed)
======================= */
async function rotateAndDownload(file) {
  if (!file) {
    rotateStatus.textContent = "Select a PDF first.";
    return;
  }

  await ensurePDFLib();
  const { PDFDocument, degrees } = window.PDFLib;

  const buf = await readFileAsArrayBuffer(file);
  const src = await PDFDocument.load(buf, { ignoreEncryption: true });
  const outDoc = await PDFDocument.create();

  const total = src.getPageCount();
  let done = 0;
  const tick = () => {
    const pct = Math.floor((done / total) * 100);
    rotateStatus.textContent = `Rotating ${done}/${total} (${pct}%)`;
  };

  for (let i = 0; i < total; i++) {
    const [page] = await outDoc.copyPages(src, [i]);
    const { width, height } = page.getSize();

    // Create a new page with swapped dimensions
    const rotatedPage = outDoc.addPage([height, width]);

    // Embed and draw the original page rotated 90 degrees CW
    const embedded = await outDoc.embedPage(page);

    rotatedPage.drawPage(embedded, {
      x: 0,
      y: width, // move content up
      width,
      height,
      rotate: degrees(90),
    });

    done++;
    if (done === 1 || done % 3 === 0 || done === total) {
      tick();
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const bytes = await outDoc.save();
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  downloadPdf(bytes, `Shinnie-star_rotated_${ts}.pdf`);
  rotateStatus.textContent = "Done (100%).";
}

/* =======================
   Event bindings
======================= */
btnCropDownload?.addEventListener("click", async () => {
  resultDiv.textContent = "";
  progressDiv.textContent = "";
  const files = Array.from(filesInput.files || []);
  if (!files.length) {
    resultDiv.textContent = "Please select at least one PDF.";
    return;
  }
  btnCropDownload.disabled = true;
  btnCropDownload.textContent = "Cropping…";
  try {
    await cropAndDownload(files);
  } catch (e) {
    console.error(e);
    resultDiv.textContent = "Failed: " + (e?.message || e);
  } finally {
    btnCropDownload.disabled = false;
    btnCropDownload.textContent = "Crop & Download";
  }
});

btnRotateDownload?.addEventListener("click", async () => {
  rotateStatus.textContent = "";
  const f = rotateFile.files?.[0];
  if (!f) {
    rotateStatus.textContent = "Select a PDF first.";
    return;
  }
  btnRotateDownload.disabled = true;
  btnRotateDownload.textContent = "Rotating…";
  try {
    await rotateAndDownload(f);
  } catch (e) {
    console.error(e);
    rotateStatus.textContent = "Failed: " + (e?.message || e);
  } finally {
    btnRotateDownload.disabled = false;
    btnRotateDownload.textContent = "Rotate & Download";
  }
});
