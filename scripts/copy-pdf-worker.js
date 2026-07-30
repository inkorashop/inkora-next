// El visor de PDF (components/PdfFloatingViewer.js) necesita el worker de
// pdfjs-dist como un archivo estatico servible por URL (Next/webpack no
// puede resolverlo bien desde node_modules porque pdfjs-dist es ESM puro y
// esta marcado como paquete externo del server). Se copia a public/ en cada
// instalacion en vez de commitearlo, para que quede sincronizado con la
// version instalada de pdfjs-dist.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const destDir = path.join(__dirname, '..', 'public', 'pdfjs');
const dest = path.join(destDir, 'pdf.worker.min.mjs');

if (!fs.existsSync(src)) {
  console.warn('[copy-pdf-worker] pdfjs-dist no esta instalado, se omite.');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`[copy-pdf-worker] copiado a ${path.relative(path.join(__dirname, '..'), dest)}`);
