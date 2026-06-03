import { Component, ViewChild, ElementRef } from '@angular/core';
import { OnInit } from '@angular/core';
import { Location } from '@angular/common';
import { RubricaService } from '../../services/rubrica.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ConsultasService } from '../../services/consultas.service';
import { LoginService } from '../../services/login.service';
import { RubricaPdfService } from '../../services/rubrica-pdf.service';
@Component({
  selector: 'app-rubrica',
  templateUrl: './rubrica.component.html',
  styleUrls: ['./rubrica.component.css'],
})
export class RubricaComponent implements OnInit {
  @ViewChild('rubricaContainer', { static: false })
  rubricaContainer!: ElementRef;
  tesisId: string = '';
  // Objeto local para no disparar escrituras constantes
  rubricaLocal: any = {};
  tesisData: any;
  userRole: string = '';
  esDirector: boolean = false;
  cargandoPdf: boolean = false;
  constructor(
    private route: ActivatedRoute,
    private rubricaService: RubricaService,
    private consultaService: ConsultasService,
    private router: Router,
    private loginService: LoginService,
    private location: Location,
    private pdfService: RubricaPdfService,
  ) {}

  ngOnInit() {
    this.loginService.getCurrentUser().subscribe((user) => {
      if (user) {
        this.userRole = user.role;
      }
      this.esDirector = this.userRole === 'director';
    });
    this.route.queryParams.subscribe((params) => {
      this.tesisId = params['tesisId'] || '';
      if (!this.tesisId) {
        console.error('No se recibió tesisId en la ruta de rúbrica.');
        return;
      }
      this.cargarDatos();
    });
  }

  cargarDatos() {
    if (!this.tesisId) {
      return;
    }

    this.rubricaService.obtenerDatosTesis(this.tesisId).subscribe((data) => {
      this.tesisData = data;
      console.log('Datos de tesis obtenidos:', this.tesisData);
      if (data && data.rubrica) {
        this.rubricaLocal = { ...data.rubrica };
      }
    });
  }

  // Solo valida localmente, NO guarda en Firebase todavía
  validarLocal(event: any, max: number, campo: string) {
    let valor = parseFloat(event.target.value) || 0;

    if (valor > max) {
      valor = max;
      event.target.value = max;
      alert(`El máximo es ${max}`);
    }

    this.rubricaLocal[campo] = valor;
  }

  // UNA SOLA ESCRITURA PARA TODO EL OBJETO
  guardarTodo() {
    if (!this.tesisId) {
      alert('Error: Identificador de tesis no válido.');
      return;
    }

    this.cargandoPdf = true;

    // 1. Persistencia de las notas en la base de datos
    this.rubricaService
      .guardarRubricaCompleta(this.tesisId, this.rubricaLocal)
      .then(async () => {
        if (this.esDirector) {
          try {
            // 💡 SOLUCIÓN A LA DISTORSIÓN: Ya no tocamos "nativeElement.classList"
            // El documento se procesa en segundo plano directo desde los datos en memoria
            const docPdf = this.pdfService.generarPdfNativo(
              this.rubricaLocal,
              this.total,
            );

            // Subida inmediata del binario generado a Firebase
            const urlFinal = await this.pdfService.guardarPdfEnFirebase(
              this.tesisId,
              docPdf,
            );
            console.log(
              'PDF oficial archivado correctamente en Storage:',
              urlFinal,
            );

            alert(
              'Calificaciones almacenadas y reporte de rúbrica guardado correctamente.',
            );
          } catch (error) {
            console.error('Error durante la generación del PDF nativo:', error);
            alert(
              'Las notas se actualizaron, pero ocurrió un problema al compilar el PDF oficial.',
            );
          }
        } else {
          alert('Rúbrica actualizada correctamente.');
        }
      })
      .catch((err) => {
        console.error('Error al persistir cambios en la rúbrica:', err);
      })
      .finally(() => {
        this.cargandoPdf = false;
        this.router.navigate(['/flujo'], {
          queryParams: { tesisId: this.tesisId },
        });
      });
  }

  // Función auxiliar para centralizar la redirección limpia
  private finalizarFlujo() {
    this.cargandoPdf = false;
    this.router.navigate(['/flujo'], {
      queryParams: { tesisId: this.tesisId },
    });
  }

  descargarPdfDesdeUrl() {
    // Si los datos de la tesis ya fueron leídos en cargarDatos() y contienen la url:
    const urlPdf = this.tesisData?.urlPdfRubrica;

    if (urlPdf) {
      // Abre el PDF guardado en una pestaña nueva o fuerza la descarga nativa del navegador
      window.open(urlPdf, '_blank');
    } else {
      alert(
        'Aún no se ha generado una versión final en PDF para esta rúbrica.',
      );
    }
  }

  goBack() {
    this.location.back();
  }

  get fechaActualizacion(): Date | null {
    const rawFecha = this.rubricaLocal?.fechaActualizacion;

    if (!rawFecha) {
      return null;
    }

    if (typeof rawFecha.toDate === 'function') {
      return rawFecha.toDate();
    }

    if (rawFecha instanceof Date) {
      return rawFecha;
    }

    const parsedDate = new Date(rawFecha);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  get total(): number {
    return Object.keys(this.rubricaLocal)
      .filter((k) => typeof this.rubricaLocal[k] === 'number')
      .reduce((s, k) => s + this.rubricaLocal[k], 0);
  }
}
