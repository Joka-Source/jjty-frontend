// Flatten the exact page composition, retaining editable notebook data separately.
export async function exportPagePdf(svgs) {
  const mupdf = await import("mupdf"),
    doc = new mupdf.PDFDocument();
  try {
    for (const svg of svgs) {
      const url = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml" }),
      );
      const image = new Image();
      try {
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = () => reject(Error("Page rendering failed"));
          image.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = 1440;
        canvas.height = 1920;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fffdf3";
        ctx.fillRect(0, 0, 1440, 1920);
        ctx.drawImage(image, 0, 0, 1440, 1920);
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (!blob) throw Error("Page rendering failed");
        const raster = new mupdf.Image(
          new Uint8Array(await blob.arrayBuffer()),
        );
        try {
          const resource = doc.addImage(raster);
          const page = doc.addPage(
            [0, 0, 720, 960],
            0,
            { XObject: { PageImage: resource } },
            "q 720 0 0 960 0 0 cm /PageImage Do Q",
          );
          doc.insertPage(-1, page);
        } finally {
          raster.destroy();
        }
        canvas.width = 0;
        canvas.height = 0;
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    const buffer = doc.saveToBuffer("compress");
    try {
      return buffer.asUint8Array().slice();
    } finally {
      buffer.destroy();
    }
  } finally {
    doc.destroy();
  }
}
