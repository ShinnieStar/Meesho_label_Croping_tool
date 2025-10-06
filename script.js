/* Shinnie Star — Meesho Crop (Lite) FINAL
   - Exactly 1 output page per source page
   - Crop first
   - Rotate 90 CW (optional toggle) with correct offsets
   - Skip tiny/empty after crop
   - Progress %  */

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

/* pdf-lib */
let pdfLibReady = false;
async function ensurePDFLib() {
  if (pdfLibReady && window.PDFLib) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";
    s.onload = resolve; s.onerror = reject;
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

/* Fixed crop box (Python parity) */
const CROP_LEFT = 10;
const CROP_BOTTOM = 480;
const CROP_RIGHT = 585;
const CROP_TOP = 825;
const MIN_H = 120;
const MIN_W = 200;
const DO_ROTATE = true; // rotation ON

function cropDims() {
  const w = Math.max(10, CROP_RIGHT - CROP_LEFT);
  const h = Math.max(10, CROP_TOP - CROP_BOTTOM);
  return { w, h };
}

async function cropAndMerge(files) {
  await ensurePDFLib();
  const { PDFDocument, degrees } = window.PDFLib;
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

  let done = 0, kept = 0, skipped = 0;
  const tick = () => {
    const pct = Math.floor((done / total) * 100);
    progressDiv.textContent = `Processed ${done}/${total} (${pct}%) • kept ${kept}, skipped ${skipped}`;
  };

  const { w: cropW, h: cropH } = cropDims();

  for (const b of buffers) {
    const src = await PDFDocument.load(b, { ignoreEncryption: true });
    const idxs = Array.from({ length: src.getPageCount() }, (_, i) => i);
    const refs = await outDoc.copyPages(src, idxs);

    for (const ref of refs) {
      const pageW = ref.getWidth();
      const pageH = ref.getHeight();

      // Skip obviously invalid crop
      if (cropW < MIN_W || cropH < MIN_H) { skipped++; done++; tick(); continue; }

      // Create final page size:
      // if rotate on, portrait target (min->W, max->H), else exact crop
      let finalW = cropW, finalH = cropH;
      if (DO_ROTATE) {
        finalW = Math.min(cropW, cropH);
        finalH = Math.max(cropW, cropH);
      }

      const finalPage = outDoc.addPage([finalW, finalH]);
      const emb = await outDoc.embedPage(ref);

      if (!DO_ROTATE) {
        // Only crop (no rotate)
        finalPage.drawPage(emb, {
          x: -CROP_LEFT,
          y: -CROP_BOTTOM,
          width: pageW,
          height: pageH,
        });
      } else {
        // Crop first, then rotate 90 CW in one transform:
        // Place original so that crop region aligns with origin, then rotate about origin.
        // For rotate about origin with pdf-lib, we supply rotate and pre-translation in x/y.
        // Offsets derived to keep visible area in target bounds.
        // After 90 CW, (x,y) -> (y, -x). Choose x,y so mapped rect fills [0..finalW/H].
        const xOffset = -CROP_LEFT;
        const yOffset = -CROP_BOTTOM;

        // Empirically correct placement for 90 CW into portrait:
        // Draw with rotate(90) and swap offsets:
        finalPage.drawPage(emb, {
          x: yOffset,               // becomes X after rotation
          y: -(xOffset + pageW),   // becomes Y after rotation
          width: pageW,
          height: pageH,
          rotate: degrees(90),
        });
      }

      kept++;
      done++;
      if (done === 1 || done % 3 === 0 || done === total) { tick(); await new Promise(r=>setTimeout(r,0)); }
    }
  }

  // Safety message if everything skipped
  if (kept === 0) {
    const p = outDoc.addPage([420, 180]);
    p.drawText("No pages produced. Check crop coordinates.", { x: 20, y: 90, size: 12 });
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
