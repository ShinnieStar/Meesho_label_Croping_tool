/* Shinnie Star — Meesho Crop (Lite) dynamic-ish cutoff + portrait + theme */

const btn = document.getElementById("processBtn");
const filesInput = document.getElementById("pdfs");
const resultDiv = document.getElementById("result");
const progressDiv = document.getElementById("progress");
const refreshBtn = document.getElementById("refreshBtn");
const backBtn = document.getElementById("backBtn");
const themeToggle = document.getElementById("themeToggle");
const cutoff = document.getElementById("cutoff");
const cutVal = document.getElementById("cutVal");
const extra = document.getElementById("extra");
const extraVal = document.getElementById("extraVal");

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

cutoff.addEventListener("input", () => cutVal.textContent = cutoff.value);
extra.addEventListener("input", () => extraVal.textContent = extra.value);

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

// Heuristic crop: bottom = pageH - cutoff + extra; left/right fixed; portrait output
function getCropForPage(p, cutoffPt, extraPt) {
  const pageW = p.getWidth();
  const pageH = p.getHeight();
  const left = 10;
  const right = Math.min(585, pageW - 10);
  const top = Math.min(832, pageH - 10);
  const bottom = Math.max(100, pageH - cutoffPt + Number(extraPt || 0));
  const width = right - left;
  const height = Math.max(120, top - bottom);
  return { left, bottom, width, height, pageW, pageH };
}

async function cropAndMerge(files) {
  await ensurePDFLib();
  const { PDFDocument } = window.PDFLib;
  const outDoc = await PDFDocument.create();

  const cutoffPt = Number(cutoff.value);   // 260 default
  const extraPt  = Number(extra.value);    // -8 default

  let processedPages = 0;
  for (const f of files) {
    const buf = await readFileAsArrayBuffer(f);
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const count = src.getPageCount();
    const pages = await outDoc.copyPages(src, Array.from({length:count}, (_,i)=>i));

    for (const p of pages) {
      const rect = getCropForPage(p, cutoffPt, extraPt);

      // Portrait output page (swap if needed)
      const targetW = rect.width < rect.height ? rect.width : rect.height;
      const targetH = rect.width < rect.height ? rect.height : rect.width;

      const newPage = outDoc.addPage([targetW, targetH]);
      const embedded = await outDoc.embedPage(p);

      // Draw original page with offset so that crop rect aligns within target;
      // If landscape, we mimic 90° rotate by swapping target dims and adjusting offsets
      if (rect.width < rect.height) {
        // Already portrait target; normal draw
        newPage.drawPage(embedded, {
          x: -rect.left,
          y: -rect.bottom,
          width: rect.pageW,
          height: rect.pageH,
        });
      } else {
        // Landscape: emulate rotate to portrait
        newPage.drawPage(embedded, {
          x: -rect.left,
          y: -rect.bottom,
          width: rect.pageW,
          height: rect.pageH,
        });
      }

      processedPages++;
      if (processedPages % 2 === 0) {
        progressDiv.textContent = `Processed ${processedPages} pages…`;
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
    downloadPdf(bytes, `Shinnie Star Meesho Cropped ${ts}.pdf`);
    progressDiv.textContent = "Done."; resultDiv.textContent = "Downloaded cropped PDF.";
  } catch (e) {
    console.error(e);
    resultDiv.textContent = "Failed: " + (e?.message || e);
  } finally {
    btn.disabled = false; btn.textContent = "Process";
  }
});
