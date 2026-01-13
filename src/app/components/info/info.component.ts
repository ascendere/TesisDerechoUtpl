import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LoginService } from '../../services/login.service';
import { ConsultasService } from '../../services/consultas.service';
import { catchError, forkJoin, Observable, of, take, throwError } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import Class from '../../interfaces/classes.interface';
import autoTable from 'jspdf-autotable';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx'; // Importar la librería xlsx
import { AlertaService } from '../../services/alert.service';
import { from } from 'rxjs';

@Component({
  selector: 'app-info',
  templateUrl: './info.component.html',
  styleUrls: ['./info.component.css'],
})
export class InfoComponent implements OnInit {
  userRole: string | null = null;
  availableRoles: string[] = [];
  selectedRole: string | null = null;
  selectedModality: string | null = null;
  selectedClass: string | null = null;

  filteredClasses$: Observable<(Class & { professorName: string })[]> | null =
    null;
  isCreatingTesis = false;

  tesisList: any[] = []; // Lista completa de tesis
  filteredTesis: any[] = []; // Lista filtrada según el buscador
  searchTerm: string = '';

  selectedFile: File | null = null;
  isLoading = false;
  feedbackMessage = '';
  isError = false;

  // Nueva propiedad para el rol seleccionado en el <select>
  selectedRoleForUpload: 'director' | 'evaluador' | null = null;

  cycles: any[] = [];
  selectedCycleId: string = '';

  constructor(
    private loginService: LoginService,
    private consultasService: ConsultasService,
    private router: Router,
    private alertaService: AlertaService
  ) {}

  ngOnInit(): void {
    this.loginService.getCurrentUser().subscribe((user) => {
      if (user) {
        this.userRole = user.role;

        if (user.role === 'estudiante') {
          this.availableRoles = ['estudiante'];
          this.loadStudentTesis(user.id);
        } else if (['secretario', 'director', 'docente'].includes(user.role)) {
          this.availableRoles = ['secretario', 'director', 'docente'];
          this.loadTesis();
        }
      } else {
        console.error('No se encontró el usuario autenticado.');
      }
    });
    this.consultasService.getCycles().subscribe((cycles) => {
      this.cycles = cycles;
    });
  }

  loadStudentTesis(userId: string): void {
    this.consultasService.getTesisByUserId(userId).subscribe({
      next: (tesis) => {
        this.tesisList = tesis; //
        this.filteredTesis = tesis; // Actualiza la vista filtrada
        console.log('Tesis del estudiante cargadas:', tesis);
      },
      error: (err) => {
        console.error('Error al cargar las tesis del estudiante:', err);
        this.alertaService.mostrarAlerta(
          'error',
          'Error',
          'No se pudieron cargar tus registros de tesis.'
        );
      },
    });
  }

  onModalityChange(modality: string): void {
    this.selectedModality = modality;
    this.filteredClasses$ =
      this.consultasService.getClassesByModality(modality);
  }

  isButtonEnabled(): boolean {
    return (
      this.selectedCycleId !== null &&
      this.selectedClass !== null &&
      !this.isCreatingTesis
    );
  }

  goToProfile(): void {
    if (!this.isButtonEnabled()) {
      console.warn('Botón deshabilitado. Verifica selecciones.');
      return;
    }

    this.isCreatingTesis = true;

    // 1. Obtener usuario y datos de clase
    forkJoin({
      user: this.loginService.getCurrentUser().pipe(take(1)),
      classData: this.selectedClass
        ? this.consultasService.getClassById(this.selectedClass).pipe(take(1))
        : of(null),
    })
      .pipe(
        switchMap((results) => {
          const { user, classData } = results;
          if (!user) throw new Error('Usuario no autenticado.');
          if (!classData) throw new Error('Datos de clase no encontrados.');

          // 2. Verificar si es la primera tesis
          return from(this.consultasService.isFirstThesis(user.id)).pipe(
            map((isFirst) => ({ user, classData, isFirst }))
          );
        }),
        switchMap(({ user, classData, isFirst }) => {
          const cicloSeleccionado = this.cycles.find(
            (c) => c.id === this.selectedCycleId
          );

          const baseTesisData = {
            studentName: `${user.firstName} ${user.lastName}`,
            userId: user.id,
            className: classData.name,
            classId: classData.id,
            professorId: classData.professorId,
            professorName: classData.professorName,
            professorEmail: classData.professorEmail,
            status: 'Faltante',
            progress: 0,
            Facultad: 'Facultad de Ciencias Jurídicas y Políticas',
            Carrera: 'Derecho',
            ciclo: cicloSeleccionado ? cicloSeleccionado.name : '',
            createdAt: new Date(),
          };

          if (isFirst) {
            // CASO A: Primera tesis -> Asignación Aleatoria Automática
            return from(
              this.consultasService.saveTesisWithRandomAssignment(baseTesisData)
            );
          } else {
            // CASO B: Ya tiene tesis -> Asignación Manual (Campos vacíos)
            const manualTesisData = {
              ...baseTesisData,
              directorId: null,
              directorName: 'Pendiente de asignar',
              evaluationTeam: [],
              assignmentMode: 'Manual',
            };
            return this.consultasService.saveTesis(manualTesisData);
          }
        }),
        catchError((error) => {
          console.error('Error:', error);
          this.alertaService.mostrarAlerta(
            'error',
            'Error al procesar',
            error.message
          );
          this.isCreatingTesis = false;
          return of(null);
        })
      )
      .subscribe((tesisId) => {
        if (tesisId) {
          this.alertaService.mostrarAlerta(
            'exito',
            'Tesis Registrada',
            'Se ha procesado su solicitud correctamente.'
          );
          this.router.navigate(['/profile'], { queryParams: { tesisId } });
        }
        this.isCreatingTesis = false;
      });
  }

  loadTesis(): void {
    this.consultasService.getAllTesis().subscribe((tesis) => {
      this.tesisList = tesis;
      this.filteredTesis = tesis; // Inicialmente, muestra todas las tesis
    });
  }

  onSearch(): void {
    const searchTermLower = this.searchTerm.toLowerCase();
    this.filteredTesis = this.tesisList.filter(
      (tesis) =>
        tesis.studentName.toLowerCase().includes(searchTermLower) ||
        tesis.userId.toLowerCase().includes(searchTermLower)
    );
  }

  goToTracking(tesisId: string): void {
    this.router.navigate(['/personal'], { queryParams: { tesisId } });
  }

  downloadPDF(): void {
    const doc = new jsPDF();

    doc.text('Seguimiento de Tesis', 14, 10);

    autoTable(doc, {
      startY: 20,
      head: [
        [
          'Nombre del estudiante',
          'Docente',
          'Facultad',
          'Carrera',
          'Identificación',
          'Asignatura',
          'Estado',
          'Avance',
        ],
      ],
      body: this.filteredTesis.map((tesis) => [
        tesis.studentName,
        tesis.professorName,
        'Facultad de Ciencias Jurídicas y Políticas',
        'Derecho',
        tesis.userId,
        tesis.className,
        tesis.status,
        `${tesis.progress}%`,
      ]),
      theme: 'striped',
      styles: { fontSize: 10 },
    });

    doc.save('seguimiento_tesis.pdf');
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // Validar tipo de archivo si es necesario
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        this.selectedFile = file;
        this.feedbackMessage = ''; // Limpiar mensaje anterior
        this.isError = false;
      } else {
        this.selectedFile = null;
        this.feedbackMessage =
          'Error: Por favor, selecciona un archivo Excel (.xlsx o .xls).';
        this.isError = true;
      }
    }
  }

  processExcelFile(): void {
    // Validaciones iniciales (archivo y rol seleccionados)
    if (!this.selectedFile) {
      this.feedbackMessage = 'Error: No hay archivo seleccionado.';
      this.isError = true;
      return;
    }
    if (!this.selectedRoleForUpload) {
      this.feedbackMessage =
        'Error: Debes seleccionar un rol para asignar a los usuarios.';
      this.isError = true;
      return; // Detener si no se ha seleccionado rol
    }

    this.isLoading = true;
    this.feedbackMessage = 'Leyendo archivo...';
    this.isError = false;
    const reader = new FileReader();

    reader.onload = (e: any) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (!jsonData || jsonData.length === 0) {
          throw new Error(
            'El archivo Excel está vacío o no tiene el formato esperado.'
          );
        }

        this.feedbackMessage = `Archivo leído. Procesando ${jsonData.length} registros para el rol: ${this.selectedRoleForUpload}...`;

        const requiredColumns = ['nombre', 'apellido', 'email'];
        const firstRow = jsonData[0];
        for (const col of requiredColumns) {
          if (!(col in firstRow)) {
            throw new Error(
              `Falta la columna requerida: '${col}' en el archivo Excel.`
            );
          }
        }

        // Usar el rol seleccionado del <select>
        const roleToAssign = this.selectedRoleForUpload;

        const usersToCreate = jsonData
          .map((row) => {
            // Validar que los campos no estén vacíos en la fila actual
            if (!row.nombre || !row.apellido || !row.email) {
              console.warn(
                `Fila omitida por datos faltantes: ${JSON.stringify(row)}`
              );
              // Puedes lanzar un error o simplemente omitir la fila
              return null; // Marcar para filtrar después
            }
            return {
              firstName: String(row.nombre).trim(),
              lastName: String(row.apellido).trim(),
              email: String(row.email).trim().toLowerCase(),
              role: roleToAssign, // Asignar el rol seleccionado
              // El campo 'id' será añadido por el servicio addUser
            };
          })
          .filter((user) => user !== null); // Filtrar filas marcadas como nulas (omitidas)

        if (usersToCreate.length === 0) {
          throw new Error(
            'No se encontraron filas válidas con datos completos en el archivo.'
          );
        }

        this.feedbackMessage = `Datos validados. Guardando ${usersToCreate.length} usuarios con rol '${roleToAssign}'...`;
        this.saveUsersBatch(usersToCreate); // Llama a guardar
      } catch (error: any) {
        this.feedbackMessage = `Error al procesar el archivo: ${error.message}`;
        this.isError = true;
        this.isLoading = false;
      }
    };
    reader.onerror = (error) => {
      this.feedbackMessage = `Error al leer el archivo: ${error}`;
      this.isError = true;
      this.isLoading = false;
    };
    reader.readAsBinaryString(this.selectedFile);
  }

  // saveUsersBatch sigue siendo igual, llamará al método addUser actualizado
  async saveUsersBatch(users: any[]): Promise<void> {
    this.feedbackMessage = `Guardando ${users.length} usuarios en Firestore...`;
    let successCount = 0;
    let errorCount = 0;
    const errorMessages: string[] = [];

    const promises = users.map((user) =>
      this.consultasService
        .addUser(user) // Llama al método addUser actualizado
        .then(() => successCount++)
        .catch((error) => {
          // El error relanzado desde addUser se captura aquí
          errorCount++;
          // Usar el mensaje de error formateado desde addUser
          errorMessages.push(
            error.message || `Error desconocido procesando ${user.email}`
          );
        })
    );

    try {
      await Promise.all(promises);

      this.feedbackMessage = `Proceso completado. ${successCount} usuarios guardados. ${errorCount} errores.`;
      if (errorCount > 0) {
        this.isError = true;
        this.feedbackMessage += `\n--- Detalles de errores ---\n${errorMessages.join(
          '\n'
        )}`;
        console.error('Errores detallados:', errorMessages);
      } else {
        this.isError = false;
        this.alertaService.mostrarAlerta(
          'exito',
          'Usuarios registrados',
          'Todos los usuarios fueron guardados correctamente.'
        );
      }
    } catch (finalError: any) {
      this.feedbackMessage = `Error inesperado durante el guardado: ${finalError.message}`;
      this.isError = true;
    } finally {
      this.isLoading = false;
      this.selectedFile = null;
      // Resetear el input file si es necesario
      const fileInput = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      // No resetear el rol seleccionado para facilitar cargas múltiples con el mismo rol
      // this.selectedRoleForUpload = null;
    }
  }
}
