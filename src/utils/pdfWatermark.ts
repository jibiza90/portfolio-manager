import type { jsPDF } from 'jspdf';

// jsPDF se carga solo al descargar; GState se toma del propio documento para no cargarlo antes.
type GStateConstructor = new (options: { opacity: number }) => unknown;

// Marca de agua para los PDF. Solo la activa la demostracion /invitado; en la web normal no hace nada.
let watermarkText: string | null = null;

export const setPdfWatermark = (text: string | null) => {
  watermarkText = text;
};

export const applyPdfWatermark = (doc: jsPDF) => {
  if (!watermarkText) return;
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const size = Math.min(width, height) * 0.2;
    doc.saveGraphicsState();
    const GState = (doc as unknown as { GState: GStateConstructor }).GState;
    doc.setGState(new GState({ opacity: 0.13 }) as Parameters<jsPDF['setGState']>[0]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(200, 30, 30);
    const angle = height > width ? 55 : 22;
    doc.text(watermarkText, width / 2, height / 2, { align: 'center', baseline: 'middle', angle });
    doc.restoreGraphicsState();
  }
};
