import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { lastValueFrom } from 'rxjs';
import JSZip from 'jszip';

@Injectable({
  providedIn: 'root',
})
export class RubricaPdfService {
  constructor(
    private storage: AngularFireStorage,
    private firestore: AngularFirestore,
  ) {}

  /**
   * Genera de forma nativa por código un PDF limpio y estilizado con jsPDF y jspdf-autotable
   * @param rubrica Datos actuales de las notas locales (this.rubricaLocal)
   * @param total Nota final acumulada calculada
   */
  generarPdfNativo(rubrica: any, total: number): jsPDF {
    const doc = new jsPDF('p', 'mm', 'a4');

    // 1. CONFIGURACIÓN DE MÁRGENES Y CABECERA INSTITUTIONAL
    const marginX = 15;
    doc.setFont('Arial', 'normal');

    // Membrete superior
    doc.setFontSize(10);
    doc.setTextColor(85, 85, 85); // Gris corporativo
    doc.text('UNIVERSIDAD TÉCNICA PARTICULAR DE LOJA', marginX, 15);
    doc.text('REPORTE OFICIAL DE EVALUACIÓN DE TITULACIÓN', 210 - marginX, 15, {
      align: 'right',
    });

    // Línea divisoria institucional (Tu azul #003366)
    doc.setDrawColor(0, 51, 102);
    doc.setLineWidth(0.5);
    doc.line(marginX, 17, 210 - marginX, 17);

    // Título Principal
    doc.setFontSize(18);
    doc.setFont('Arial', 'bold');
    doc.setTextColor(0, 51, 102); // Azul #003366
    doc.text('Rúbrica de Calificación', 105, 28, { align: 'center' });

    // Fecha de emisión
    doc.setFontSize(10);
    doc.setFont('Arial', 'normal');
    doc.setTextColor(102, 102, 102);
    const fechaStr = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.text(`Fecha de Emisión: ${fechaStr}`, 105, 34, { align: 'center' });

    // 2. ESTRUCTURACIÓN DE LOS DATOS NATIVOS DE TU RÚBRICA
    // Formato: [Aspecto, Criterio, Ponderación, Nota]
    const tableRows = [
      // Preliminares
      [
        { content: 'Preliminares', rowSpan: 3 },
        'El informe contiene: portada, aprobación del Director de TT/ TIC; autoría y cesión de derechos, dedicatoria, agradecimiento, índice de contenidos de acuerdo a los criterios de la UTPL.',
        '0.6',
        rubrica.prelim_portada ?? '-',
      ],
      [
        'Presenta el resumen en 180 palabras y hace constar: tema de la investigación, objetivo general, el lugar donde se realizó la investigación, la muestra, los métodos, técnicas e instrumentos utilizados, la conclusión general de los resultados obtenidos en el proceso investigativo y las palabras claves.',
        '0.6',
        rubrica.prelim_resumen ?? '-',
      ],
      [
        'Existe congruencia entre el resumen en español y la traducción al idioma inglés.',
        '0.3',
        rubrica.prelim_congruencia ?? '-',
      ],

      // Introducción
      [
        { content: 'Introducción', rowSpan: 4 },
        'Caracteriza de forma general el problema y presenta el tema investigado de forma clara y concreta.',
        '0.2',
        rubrica.intro_caracterizacion ?? '-',
      ],
      [
        'Hace referencia a investigaciones que se han realizado sobre la problemática presentada.',
        '0.2',
        rubrica.intro_referencia ?? '-',
      ],
      [
        'Describe claramente los contenidos de cada capítulo. Destaca la importancia que tiene el estudio para la universidad y para la sociedad.',
        '0.2',
        rubrica.intro_contenidos ?? '-',
      ],
      [
        'Explica cómo dio respuesta al problema planteado y el cumplimiento de los objetivos. Detalla los recursos, medios y motivaciones que hicieron posible el desarrollo del trabajo; además de las limitaciones que se presentaron en el desarrollo del mismo.',
        '0.4',
        rubrica.intro_respuesta ?? '-',
      ],

      // Marco Teórico
      [
        { content: 'Marco Teórico', rowSpan: 3 },
        'Establece las relaciones de semejanza y diferencia entre los conceptos y aportes de los autores.',
        '0.25',
        rubrica.marco_teorico_relacion ?? '-',
      ],
      [
        'Presenta por lo menos 3 fuentes bibliográficas citadas de acuerdo a las normas APA.',
        '0.25',
        rubrica.prelim_fuentes ?? '-',
      ],
      [
        'Realiza un análisis crítico y emite sus propias conclusiones en cada uno de los temas abordados.',
        '0.5',
        rubrica.marco_teorico_analisis ?? '-',
      ],

      // Metodología
      [
        { content: 'Metodología', rowSpan: 3 },
        'Incluye y desarrolla con claridad los objetivos generales y específicos.',
        '0.25',
        rubrica.metodologia_desarrollo ?? '-',
      ],
      [
        'Plantea y desarrolla una metodología de investigación pertinente al problema.',
        '0.25',
        rubrica.metodologia_planteamiento ?? '-',
      ],
      [
        'Describe las preguntas de investigación, el diseño, el contexto, la población, los métodos, las técnicas e instrumentos, procedimiento y recursos que fueron utilizados en la investigación.',
        '0.5',
        rubrica.metodologia_descripcion ?? '-',
      ],

      // Resultados
      [
        { content: 'Resultados', rowSpan: 6 },
        'Incluye tablas y figuras con sus respectivos títulos, fuentes y autores.',
        '0.2',
        rubrica.resultados_tablas ?? '-',
      ],
      [
        'Presenta un análisis e interpretación de los resultados obtenidos.',
        '0.3',
        rubrica.resultados_analisis ?? '-',
      ],
      [
        '¿Responden los resultados obtenidos a los objetivos planteados?',
        '0.5',
        rubrica.resultados_objetivos ?? '-',
      ],
      [
        'Confronta los resultados obtenidos con los fundamentos teóricos y los hechos de la realidad.',
        '0.5',
        rubrica.resultados_confronta ?? '-',
      ],
      [
        'Contrasta los resultados obtenidos con información del marco teórico y de otras investigaciones.',
        '0.5',
        rubrica.resultados_contraste ?? '-',
      ],
      [
        'Existe aporte personal. Plantea una propuesta pertinente en razón de la problemática identificada (en el caso de solicitar).',
        '0.5',
        rubrica.resultados_aporte ?? '-',
      ],

      // Conclusiones
      [
        { content: 'Conclusiones', rowSpan: 2 },
        'Responden las conclusiones a los objetivos del estudio.',
        '0.5',
        rubrica.conclusiones_responden ?? '-',
      ],
      [
        'Son precisas, coherentes, pertinentes a los resultados obtenidos en la aplicación de los instrumentos.',
        '0.5',
        rubrica.conclusiones_precisas ?? '-',
      ],

      // Recomendaciones
      [
        'Recomendaciones',
        'Plantea las recomendaciones en función de las conclusiones.',
        '1.0',
        rubrica.recomendaciones_funcion ?? '-',
      ],

      // Referencias
      [
        { content: 'Referencias\nBibliográficas', rowSpan: 2 },
        'Utiliza bibliografía actualizada.',
        '0.25',
        rubrica.referencias_actualizada ?? '-',
      ],
      [
        'Presenta en orden alfabético utilizando las normas APA.',
        '0.25',
        rubrica.referencias_orden ?? '-',
      ],

      // FILA FINAL DE TOTALES
      [
        {
          content: 'CALIFICACIÓN TOTAL GENERAL ACUMULADA',
          colSpan: 2,
          styles: {
            fillColor: [240, 244, 248],
            textColor: [0, 51, 102],
            fontStyle: 'bold',
            fontSize: 11,
          },
        },
        {
          content: '7.00',
          styles: {
            fillColor: [240, 244, 248],
            textColor: [0, 51, 102],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 11,
          },
        },
        {
          content: `${total.toFixed(2)} / 7.00`,
          styles: {
            fillColor: [240, 244, 248],
            textColor: [0, 51, 102],
            fontStyle: 'bold',
            halign: 'center',
            fontSize: 11,
          },
        },
      ],
    ];

    // 3. GENERACIÓN INTEGRAL DE LA AUTOTABLE CON DISEÑO PREMIUM
    autoTable(doc, {
      startY: 40,
      margin: { left: marginX, right: marginX, top: 25, bottom: 20 },
      head: [
        [
          'Aspectos a Evaluar',
          'Criterios de Evaluación',
          'Ponderación',
          'Total',
        ],
      ],
      body: tableRows,
      theme: 'grid',
      styles: {
        font: 'Arial',
        fontSize: 9.5,
        cellPadding: 4,
        lineColor: [204, 204, 204], // Borde #ccc exacto
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [0, 51, 102], // Tu azul original #003366
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
      columnStyles: {
        0: {
          halign: 'center',
          fontStyle: 'bold',
          valign: 'middle',
          fillColor: [250, 250, 250],
        },
        1: { halign: 'left' },
        2: { halign: 'center', fontStyle: 'bold', textColor: [102, 102, 102] }, //  'textColor' es el término correcto
        3: { halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (data) => {
        // Corrección de herencia estética de bordes en celdas unificadas (rowSpan)
        if (data.cell.raw && (data.cell.raw as any).rowSpan) {
          data.cell.styles.valign = 'middle';
        }
      },
    });

    return doc;
  }

  /**
   * Ejecuta la subida binaria directa a Storage y guarda la URL en Firestore
   */
  async guardarPdfEnFirebase(tesisId: string, doc: jsPDF): Promise<string> {
    // ===== PDF =====
    const pdfBlob = doc.output('blob');

    const pdfPath = `rubricas/rubrica_${tesisId}_final.pdf`;
    const pdfRef = this.storage.ref(pdfPath);

    await this.storage.upload(pdfPath, pdfBlob, {
      customMetadata: {
        contentType: 'application/pdf',
      },
    });

    const downloadUrlPdf = await lastValueFrom(pdfRef.getDownloadURL());

    // ===== ZIP =====
    const zip = new JSZip();

    zip.file(`rubrica_${tesisId}_final.pdf`, pdfBlob);

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9,
      },
    });

    const zipPath = `rubricas/rubrica_${tesisId}_final.zip`;
    const zipRef = this.storage.ref(zipPath);

    await this.storage.upload(zipPath, zipBlob, {
      customMetadata: {
        contentType: 'application/zip',
      },
    });

    const downloadUrlZip = await lastValueFrom(zipRef.getDownloadURL());

    // ===== Firestore =====
    await this.firestore.collection('tesis').doc(tesisId).update({
      urlPdfRubrica: downloadUrlPdf,
      urlZipRubrica: downloadUrlZip,
      fechaPdfActualizacion: new Date(),
    });

    return downloadUrlPdf;
  }
}
