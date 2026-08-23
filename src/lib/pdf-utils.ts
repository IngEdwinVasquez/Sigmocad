import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface PDFColumn {
  header: string;
  dataKey: string;
}

export interface PDFData {
  [key: string]: string | number | boolean | null;
}

export function generatePDFReport(
  title: string,
  columns: PDFColumn[],
  data: PDFData[],
  filename: string
) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(title, 14, 20);

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

  autoTable(doc, {
    startY: 35,
    head: [columns.map(col => col.header)],
    body: data.map(row => columns.map(col => String(row[col.dataKey] ?? ''))),
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 8 },
  });

  doc.save(`${filename}.pdf`);
}

export function generateMultiTablePDFReport(
  title: string,
  tables: Array<{
    subtitle: string;
    columns: PDFColumn[];
    data: PDFData[];
  }>,
  filename: string
) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(title, 14, 20);

  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

  let currentY = 40;

  tables.forEach((table, index) => {
    if (index > 0 && currentY > 250) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFontSize(14);
    doc.text(table.subtitle, 14, currentY);
    currentY += 5;

    autoTable(doc, {
      startY: currentY,
      head: [table.columns.map(col => col.header)],
      body: table.data.map(row => table.columns.map(col => String(row[col.dataKey] ?? ''))),
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246] },
      styles: { fontSize: 8 },
    });

    currentY = (doc as any).lastAutoTable.finalY + 15;
  });

  doc.save(`${filename}.pdf`);
}

export function exportToPDF(headers: string[], data: string[][], title: string) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(title, 14, 20);

  doc.setFontSize(10);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 28);

  autoTable(doc, {
    startY: 35,
    head: [headers],
    body: data,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246] },
    styles: { fontSize: 8 },
  });

  doc.save(`${title.toLowerCase().replace(/\s+/g, '-')}.pdf`);
}
