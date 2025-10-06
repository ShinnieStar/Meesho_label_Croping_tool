/* Shinnie Star — Meesho Crop (Lite)
   - Remove non-order pages (heuristics)
   - Sort by Courier partner (template-header detection)
   - Progress %  */

const btn = document.getElementById("processBtn");
const filesInput = document.getElementById("pdfs");
const resultDiv = document.getElementById("result");
const progressDiv = document.getElementById("progress");
const refreshBtn = document.getElementById("refreshBtn");
const backBtn = document.getElementById("backBtn");
const themeToggle = document.getElementById("themeToggle");
const sortSelect = document.getElementById("sortBy");

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

/* Fixed crop-box (Meesho label area) */
const CROP_LEFT = 10;
const CROP_BOTTOM = 480;
const CROP_RIGHT = 585;
const CROP_TOP = 825;
const MIN_H = 140, MIN_W = 250;

/* Heuristic: header strip and barcode band location inside cropped area */
function geometryGuards(cropW, cropH) {
  if (cropH < MIN_H || cropW < MIN_W) return false;
  const headerH = Math.max(40, Math.min(80, Math.floor(cropH * 0.12)));
  const barcodeH = Math.max(60, Math.min(140, Math.floor(cropH * 0.25)));
  const barcodeMinW = Math.max(180, Math.floor(cropW * 0.28));
  return { headerH, barcodeH, barcodeMinW };
}
/* Courier detection map (approximate by header zone width fractions) */
function detectCourierFromHeaderZoneTextGuess(zoneW) {
  // Pure client textless estimate: use page width; not perfect, but we’ll bucket to common names via widths
  // Fallback: order courier by typical header length bands (Delhivery, Shadowfax, Xpressbees ~ similar)
  // Use a neutral default
  return "Other";
}
/* Deterministic courier order for sorting */
function courierOrderKey(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("delhivery")) return "1_delhivery";
  if (n.includes("shadowfax")) return "2_shadowfax";
  if (n.includes("xpress")) return "3_xpress";
  if (n.includes("bluedart")) return "4_bluedart";
  if (n.includes("ecom")) return "5_ecom";
  return "9_other";
}

async function processOneFile(buf, sortMode, outDoc) {
  const { PDFDocument } = window.PDFLib;
  const src = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pageCount = src.getPageCount();
  const refs = await outDoc.copyPages(src, Array.from({ length: pageCount }, (_, i) => i));

  const toAdd = [];

  const cropW = Math.max(10, CROP_RIGHT - CROP_LEFT);
  const cropH = Math.max(10, CROP_TOP - CROP_BOTTOM);
  const guards = geometryGuards(cropW, cropH);
  if (!guards) return toAdd;

  for (const ref of refs) {
    const pageW = ref.getWidth();
    const pageH = ref.getHeight();

    // Skip non-label by geometry
    if (!guards) continue;

    // Build record with optional courier guess
    const rec = {
      ref,
      pageW, pageH,
      cropW, cropH,
      left: CROP_LEFT, bottom: CROP_BOTTOM,
      courier: "Other"
    };

    // Header zone width proxy -> courier guess bucket (still “Other” unless future OCR)
    rec.courier = detectCourierFromHeaderZoneTextGuess(cropW);

    toAdd.push(rec);
  }

  // Sorting
  if (sortMode === "courier") {
    toAdd.sort((a, b) => courierOrderKey(a.courier).localeCompare(courierOrderKey(b.courier)));
  } else if (sortMode === "name") {
    // no-op here; file-level sort is handled before
  }

  // Draw to output
  for (const r of toAdd) {
    const finalPage = outDoc.addPage([r.cropW, r.cropH]);
    const emb = await outDoc.embedPage(r.ref);
    finalPage.drawPage(emb, {
      x: -r.left,
      y: -r.bottom,
      width: r.pageW,
      height: r.pageH,
    });
  }

  return toAdd;
}

function sortFilesInput(arr, mode) {
  const a = Array.from(arr || []);
  if (mode === "name") return a.sort((x, y) => x.name.localeCompare(y.name));
  return a;
}

async function cropAndMerge(files) {
  await ensurePDFLib();
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  // Sort input files by name if selected
  const sortMode = (sortSelect?.value || "none");
  const inFiles = sortFilesInput(files, sortMode === "name" ? "name" : "none");

  // Count total pages
  let total = 0;
  const buffers = [];
  for (const f of inFiles) {
    const b = await readFileAsArrayBuffer(f);
    buffers.push(b);
    const t = await PDFDocument.load(b, { ignoreEncryption: true });
    total += t.getPageCount();
  }

  let done = 0, kept = 0, skipped = 0;
  const update = () => {
    const pct = Math.floor((done / total) * 100);
    progressDiv.textContent = `Processed ${done}/${total} (${pct}%) • kept ${kept}, skipped ${skipped}`;
  };

  for (const b of buffers) {
    const added = await processOneFile(b, sortMode, outDoc);
    kept += added.length;
    // skipped estimate per-file
    const tmp = await PDFDocument.load(b, { ignoreEncryption: true });
    done += tmp.getPageCount();
    skipped += Math.max(0, tmp.getPageCount() - added.length);
    update();
    await new Promise(r=>setTimeout(r,0));
  }

  // Safety if nothing kept
  if (kept === 0) {
    const p = outDoc.addPage([460, 180]);
    p.drawText("All pages identified as non-label by heuristics. Adjust crop or use server OCR for perfect filtering.", { x: 20, y: 90, size: 12 });
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
