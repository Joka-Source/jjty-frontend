import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";
import mupdf from "mupdf";
const require = createRequire(import.meta.url);
const {
  PDFDocument,
  degrees,
} = require("../../runtime/bento-jett/node_modules/pdf-lib");
const directory =
  process.env.BENTO_EVIDENCE_DIR ||
  new URL("../../runtime/bento-ocr-corpus/", import.meta.url).pathname;
await mkdir(directory, { recursive: true });
const injectedFailure = process.env.BENTO_OCR_INJECT_SECOND_PAGE === "1";
const cases = [
  {
    rotation: 0,
    phrases: [
      "JETT OCR TEST",
      "Invoice number 2026",
      "Searchable documents stay useful",
      "यह एक परीक्षण दस्तावेज है",
    ],
  },
  {
    rotation: 90,
    phrases: ["Ninety degree page", "Rotated documents remain searchable"],
  },
  {
    rotation: 270,
    phrases: ["Two seventy degree page", "Preserve the original page geometry"],
  },
  {
    rotation: 0,
    crop: true,
    phrases: ["Cropped page text", "Keep every visible word aligned"],
  },
];
const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const pdf = await PDFDocument.create();
const manifest = {
  synthetic: true,
  coordinates:
    "Displayed top-left PDF points; raster ink bounds measured with Canvas TextMetrics",
  pages: [],
};
try {
  const tab = await browser.newPage();
  for (const [index, entry] of cases.entries()) {
    const raster = await tab.evaluate(async ({ phrases }) => {
      const font = new FontFace(
        "JETT Corpus Devanagari",
        'local("KohinoorDevanagari-Regular"), local("Kohinoor Devanagari Regular")',
      );
      await font.load();
      document.fonts.add(font);
      const canvas = document.createElement("canvas");
      canvas.width = 1600;
      canvas.height = 1000;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 1600, 1000);
      ctx.fillStyle = "#111";
      ctx.font = '64px "JETT Corpus Devanagari", Arial';
      const words = [];
      phrases.forEach((phrase, line) => {
        const x = 100,
          y = 200 + 160 * line;
        ctx.fillText(phrase, x, y);
        let prefix = "";
        for (const word of phrase.split(" ")) {
          const left = x + ctx.measureText(prefix).width,
            m = ctx.measureText(word);
          words.push({
            text: word,
            rect: [
              (left - m.actualBoundingBoxLeft) / 2,
              (y - m.actualBoundingBoxAscent) / 2,
              (left + m.actualBoundingBoxRight) / 2,
              (y + m.actualBoundingBoxDescent) / 2,
            ],
          });
          prefix += word + " ";
        }
      });
      return { base64: canvas.toDataURL("image/png").split(",")[1], words };
    }, entry);
    const image = await pdf.embedPng(Buffer.from(raster.base64, "base64"));
    const width = entry.crop ? 900 : entry.rotation ? 500 : 800,
      height = entry.crop ? 600 : entry.rotation ? 800 : 500;
    const page = pdf.addPage([width, height]);
    if (entry.rotation === 90)
      page.drawImage(image, {
        x: 500,
        y: 0,
        width: 800,
        height: 500,
        rotate: degrees(90),
      });
    else if (entry.rotation === 270)
      page.drawImage(image, {
        x: 0,
        y: 800,
        width: 800,
        height: 500,
        rotate: degrees(270),
      });
    else
      page.drawImage(image, {
        x: entry.crop ? 50 : 0,
        y: entry.crop ? 60 : 0,
        width: 800,
        height: 500,
      });
    page.setRotation(degrees(entry.rotation));
    if (entry.crop) page.setCropBox(50, 60, 800, 500);
    manifest.pages.push({
      page: index + 1,
      rotation: entry.rotation,
      mediaBox: page.getMediaBox(),
      cropBox: page.getCropBox(),
      displaySize: { width: 800, height: 500 },
      expectedPhrases: entry.phrases,
      words: raster.words,
    });
  }
} finally {
  await browser.close();
}
const fixture = `${directory}/corpus-source.pdf`;
await writeFile(fixture, await pdf.save());
await writeFile(
  `${directory}/fixture-manifest.json`,
  JSON.stringify(manifest, null, 2),
);
const code = await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [new URL("./bento-journey-ocr.mjs", import.meta.url).pathname],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        BENTO_EVIDENCE_DIR: directory,
        BENTO_OCR_FIXTURE: fixture,
        BENTO_OCR_LANGUAGE: "mixed",
        BENTO_OCR_EXTRA_SEARCHES: JSON.stringify(
          injectedFailure
            ? [{ query: "Cropped", page: 4 }]
            : [
                { query: "Ninety", page: 2 },
                { query: "Cropped", page: 4 },
              ],
        ),
      },
    },
  );
  child.on("error", reject);
  child.on("exit", resolve);
});
assert.equal(code, 0, "Real OCR corpus journey failed");
const output = await readFile(`${directory}/ocr-returned.pdf`);
const parsed = await PDFDocument.load(output);
assert.equal(parsed.getPageCount(), manifest.pages.length);
const document = mupdf.Document.openDocument(output, "application/pdf");
const observations = [];
const failures = [];
for (const expected of manifest.pages) {
  const page = parsed.getPage(expected.page - 1);
  assert.deepEqual(page.getMediaBox(), expected.mediaBox);
  assert.deepEqual(page.getCropBox(), expected.cropBox);
  assert.equal(page.getRotation().angle, expected.rotation);
  const rendered = document.loadPage(expected.page - 1),
    text = rendered.toStructuredText("");
  const extracted = text.asText();
  const wordGeometry = expected.words.map((word) => {
    const candidates = text
      .search(word.text)
      .map((quads) => {
        const points = quads.flat(),
          xs = points.filter((_, i) => i % 2 === 0),
          ys = points.filter((_, i) => i % 2 === 1);
        const rect = [
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
        ];
        const dx = (rect[0] + rect[2] - word.rect[0] - word.rect[2]) / 2,
          dy = (rect[1] + rect[3] - word.rect[1] - word.rect[3]) / 2;
        const quad = quads[0];
        const angleDegrees =
          (Math.atan2(quad[3] - quad[1], quad[2] - quad[0]) * 180) / Math.PI;
        return { rect, dx, dy, angleDegrees, distance: Math.hypot(dx, dy) };
      })
      .sort((a, b) => a.distance - b.distance);
    const actual = candidates[0],
      tolerance = Math.max(12, (word.rect[3] - word.rect[1]) * 0.7);
    return {
      text: word.text,
      expectedRect: word.rect,
      actual,
      tolerance,
      aligned:
        !!actual &&
        Math.abs(actual.dx) <= tolerance &&
        Math.abs(actual.dy) <= tolerance &&
        Math.abs(actual.angleDegrees) <= 5,
    };
  });
  observations.push({
    page: expected.page,
    recognitionIntentionallyFailed: injectedFailure && expected.page === 2,
    extracted,
    wordGeometry,
    structured: JSON.parse(text.asJSON()),
  });
  if (injectedFailure && expected.page === 2) {
    assert.equal(
      extracted.trim(),
      "",
      "Injected failed page should remain image-only",
    );
    text.destroy();
    rendered.destroy();
    continue;
  }
  for (const phrase of expected.expectedPhrases)
    if (!extracted.includes(phrase))
      failures.push(`Page${expected.page} missing ${phrase}`);
  for (const word of wordGeometry)
    if (!word.aligned)
      failures.push(`Page${expected.page} misplaced ${word.text}`);
  text.destroy();
  rendered.destroy();
}
document.destroy();
await writeFile(
  `${directory}/corpus-readback.json`,
  JSON.stringify(observations, null, 2),
);
assert.deepEqual(failures, [], "Corpus text/geometry mismatch");
console.log(
  (injectedFailure
    ? "SYNTHETIC FAILURE INJECTION: page2 preserved image-only; "
    : "") +
    "PASS corpus page counts, rotation/crop preservation, expected phrases and word-center/orientation checks",
);
