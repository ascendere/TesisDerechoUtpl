import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LoginService } from '../../services/login.service';
import { ConsultasService } from '../../services/consultas.service';
import { catchError, forkJoin, Observable, of, take, throwError } from 'rxjs';
import { switchMap, map, first } from 'rxjs/operators';
import Class from '../../interfaces/classes.interface';
import autoTable from 'jspdf-autotable';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx'; // Importar la librería xlsx
import { AlertaService } from '../../services/alert.service';
import { from } from 'rxjs';
import { ImportService } from 'src/app/services/import.service';
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
  classMap: Map<string, any> = new Map(); // Mapa para asignaturas y paralelos
  activeCycleId: string = 'VigK04NJGN5Z60HIgK62'; // Ejemplo de ciclo activo
  // Nueva propiedad para el rol seleccionado en el <select>
  selectedRoleForUpload:
    | 'director'
    | 'evaluador'
    | 'estudiante'
    | 'docente'
    | null = null;

  cycles: any[] = [];
  selectedCycleId: string = '';
  filteredClasses: (Class & { professorName: string })[] = [];

  archivoSeleccionado: File | null = null;
  rolACargar: string = 'estudiante'; // Por defecto
  mensaje: string = '';

  isModalVisible: boolean = false;
  selectedThesis: any = null;
  availableStaff: any[] = [];
  modalAction: 'approve' | 'reject' | null = null;

  // Form data for the modal
  assignmentForm = {
    directorId: '',
    evaluatorId: '',
    rejectionReason: '',
  };
  // Variables para el control del Modal y formulario manual
  showModal: boolean = false;
  showTesisModal = false;
  selectedRejectionReason: string = '';
  isRejectionModalVisible: boolean = false;

  newUser: any = {
    nombre: '',
    apellido: '',
    email: '',
    cedula: '',
    asignatura: '',
    paralelo: '',
    titulo: '',
    modalidad: '',
  };

  tipoTesis: 'pregrado' | 'posgrado' | null = null;
  datosTesis = {
    numeroSentencia: '',
    asunto: '',
    tituloPosgrado: '',
  };

  // Abrir modal
  openCreateModal() {
    this.showModal = true;
    this.feedbackMessage = '';
  }

  constructor(
    private loginService: LoginService,
    private consultasService: ConsultasService,
    private router: Router,
    private alertaService: AlertaService,
    private importService: ImportService,
  ) {}

  ngOnInit(): void {
    this.loginService.getCurrentUser().subscribe((user) => {
      if (user) {
        this.userRole = user.role;
        this.loadStudentTesis(user.id);
      } else {
        this.router.navigate(['/login']);
        console.error('No se encontró el usuario autenticado.');
      }
    });
    this.consultasService.getCycles().subscribe((cycles) => {
      this.cycles = cycles;
    });
  }

  loadStudentTesis(userId: string): void {
    this.consultasService.getTesisByUser(userId, this.userRole).subscribe({
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
          'No se pudieron cargar tus registros de tesis.',
        );
      },
    });
  }

  onModalityChange(modality: string): void {
    this.selectedModality = modality;
    this.selectedClass = null; // reset explícito y controlado

    this.consultasService
      .getClassesByModality(modality)
      .pipe(take(1))
      .subscribe((classes) => {
        this.filteredClasses = classes;
      });
  }

  isButtonEnabled(): boolean {
    return (
      this.selectedCycleId !== null &&
      this.selectedClass !== null &&
      !this.isCreatingTesis
    );
  }

  goToProfile(): void {
    if (!this.isButtonEnabled() || !this.tipoTesis) {
      this.alertaService.mostrarAlerta(
        'error',
        'Incompleto',
        'Selecciona el tipo de tesis y completa los campos.',
      );
      return;
    }

    this.isCreatingTesis = true;
    console.log('selectedClass:', this.selectedClass);
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
          console.log('classData:', classData);

          return from(this.consultasService.isFirstThesis(user.id)).pipe(
            map((isFirst) => ({ user, classData, isFirst })),
          );
        }),
        switchMap(({ user, classData, isFirst }) => {
          const cicloSeleccionado = this.cycles.find(
            (c) => c.id === this.selectedCycleId,
          );

          // OBJETO BASE
          let tesisData: any = {
            studentName: `${user.firstName} ${user.lastName}`,
            userId: user.id,
            className: classData.subjectName,
            classParallel: classData.parallel,
            classId: classData.id,
            professorId: classData.professorId,
            professorName: classData.professorName,
            professorEmail: classData.professorEmail,
            status: isFirst ? 'Faltante' : 'Pendiente de Aprobar',
            progress: 0,
            ciclo: cicloSeleccionado ? cicloSeleccionado.name : '',
            tipo: this.tipoTesis, // 'pregrado' o 'posgrado'
            createdAt: new Date(),
          };

          // CAMPOS ESPECÍFICOS DEL DIAGRAMA
          if (this.tipoTesis === 'pregrado') {
            tesisData.numeroSentencia = this.datosTesis.numeroSentencia;
            tesisData.asunto = this.datosTesis.asunto;
          } else {
            tesisData.tituloTesis = this.datosTesis.tituloPosgrado;
          }

          if (isFirst) {
            return from(
              this.consultasService.saveTesisWithRandomAssignment(tesisData),
            );
          } else {
            tesisData.assignmentMode = 'Manual';
            tesisData.isApproved = false;
            return from(this.consultasService.saveTesis(tesisData));
          }
        }),
        catchError((error) => {
          this.alertaService.mostrarAlerta('error', 'Error', error.message);
          this.isCreatingTesis = false;
          return of(null);
        }),
      )
      .subscribe((tesisId) => {
        if (tesisId) {
          this.alertaService.mostrarAlerta(
            'exito',
            'Registrada',
            'Tesis creada correctamente.',
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
        tesis.userId.toLowerCase().includes(searchTermLower),
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
        this.archivoSeleccionado = event.target.files[0];
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
  get tesisActivas() {
    return this.filteredTesis.filter(
      (t) => t.status !== 'Pendiente de Aprobar' && t.status !== 'Rechazado',
    );
  }
  get tesisPendientes() {
    return this.filteredTesis.filter(
      (t) => t.status === 'Pendiente de Aprobar',
    );
  }

  // 2. Función para Aprobar
  aprobarTesis(tesisId: string): void {
    const updateData = {
      status: 'Faltante', // Cambia al estado inicial normal
      isApproved: true,
      approvedAt: new Date(),
    };

    this.consultasService
      .updateTesisStatus(tesisId, updateData)
      .then(() => {
        this.alertaService.mostrarAlerta(
          'exito',
          'Aprobado',
          'La tesis ha sido habilitada correctamente.',
        );
      })
      .catch((error) => {
        this.alertaService.mostrarAlerta(
          'error',
          'Error',
          'No se pudo aprobar la tesis.',
        );
      });
  }

  // 3. Función para Rechazar
  rechazarTesis(tesisId: string): void {
    if (confirm('¿Está seguro de rechazar esta solicitud?')) {
      this.consultasService.deleteTesis(tesisId).then(() => {
        this.alertaService.mostrarAlerta(
          'exito',
          'Eliminado',
          'La solicitud ha sido rechazada.',
        );
      });
    }
  }
  async processFile() {
    if (!this.selectedFile || !this.selectedRoleForUpload) {
      this.feedbackMessage = 'Selecciona un archivo y un rol.';
      return;
    }

    // Los docentes SIEMPRE necesitan un ciclo activo para sus materias
    if (this.selectedRoleForUpload === 'docente' && !this.activeCycleId) {
      this.feedbackMessage =
        'No existe un ciclo académico activo para importar docentes.';
      return;
    }

    this.isLoading = true;
    const reader = new FileReader();

    reader.onload = async (e: any) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const rows: any[] = XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]],
        );

        if (rows.length === 0) throw new Error('El archivo está vacío.');

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const seenEmails = new Set<string>();
        const payload: any[] = [];

        for (const [index, row] of rows.entries()) {
          const fila = index + 2;

          // Validaciones comunes (Nombre, Apellido, Email)
          if (!row.email || !row.nombre || !row.apellido) {
            throw new Error(
              `Fila ${fila}: email, nombre y apellido son obligatorios`,
            );
          }

          const email = String(row.email).trim().toLowerCase();
          if (!emailRegex.test(email))
            throw new Error(`Fila ${fila}: email inválido`);

          // OBJETO BASE (Común para todos)
          let userEntry: any = {
            email,
            firstName: String(row.nombre).trim(),
            lastName: String(row.apellido).trim(),
            cedula: row.cedula ? String(row.cedula).trim() : null,
            role: this.selectedRoleForUpload,
          };

          // LÓGICA ESPECÍFICA POR ROL
          if (this.selectedRoleForUpload === 'docente') {
            if (!row.asignatura || !row.paralelo) {
              throw new Error(
                `Fila ${fila}: Los docentes requieren Asignatura y Paralelo.`,
              );
            }

            if (seenEmails.has(email)) continue;
            seenEmails.add(email);

            // Campos exclusivos de docente
            userEntry.degree = row.titulo ? String(row.titulo).trim() : 'Abg.';
            userEntry.tempData = {
              subjectName: String(row.asignatura).trim(),
              parallel: String(row.paralelo).trim().toUpperCase(),
              modality: row.modalidad
                ? String(row.modalidad).trim().toLowerCase()
                : 'presencial',
              cycleId: this.activeCycleId,
            };
          } else if (this.selectedRoleForUpload === 'estudiante') {
            // Si es necesario proximamente
          }

          payload.push(userEntry);
        }

        // ENVÍO AL SERVICIO CORRESPONDIENTE
        if (this.selectedRoleForUpload === 'docente') {
          await this.importService.saveUsersToAuthorized(payload);
        } else {
          await this.importService.saveUsersToAuthorized(payload);
        }

        this.isError = false;
        this.feedbackMessage = `Éxito: ${payload.length} registros de ${this.selectedRoleForUpload} procesados.`;
      } catch (error: any) {
        this.isError = true;
        this.feedbackMessage = error.message || 'Error al importar.';
      } finally {
        this.isLoading = false;
      }
    };

    reader.readAsBinaryString(this.selectedFile);
  }

  // Guardar un solo usuario manualmente
  async saveManualUser() {
    this.isLoading = true;
    try {
      // 1. Definimos la estructura base común para todos (Estudiantes, Secretarios, etc.)
      let cleanUser: any = {
        firstName: this.newUser.nombre.trim(),
        lastName: this.newUser.apellido.trim(),
        email: this.newUser.email.trim().toLowerCase(),
        cedula: String(this.newUser.cedula).trim(),
        role: this.selectedRoleForUpload,
      };

      // 2. Solo si es docente, agregamos los campos académicos específicos
      if (this.selectedRoleForUpload === 'docente') {
        cleanUser.degree = this.newUser.titulo
          ? this.newUser.titulo.trim()
          : null;
        cleanUser.tempData = {
          subjectName: this.newUser.asignatura
            ? this.newUser.asignatura.trim()
            : null,
          parallel: this.newUser.paralelo
            ? this.newUser.paralelo.trim().toUpperCase()
            : null,
          modality: this.newUser.modalidad
            ? this.newUser.modalidad.trim().toLowerCase()
            : 'presencial',
          cycleId: this.activeCycleId,
        };
      }
      // 3. Lógica para roles de gestión (Director/Evaluador)
      if (
        this.selectedRoleForUpload === 'director' ||
        this.selectedRoleForUpload === 'evaluador'
      ) {
        cleanUser.currentLoad = 0;
      }

      // Validar datos mínimos
      if (!cleanUser.firstName || !cleanUser.email || !cleanUser.cedula) {
        throw new Error('Por favor completa los campos obligatorios.');
      }

      await this.importService.saveUsersToAuthorized([cleanUser]);

      // ... resto de tu lógica de feedback ...
    } catch (error: any) {
      this.isError = true;
      this.feedbackMessage = error.message;
    } finally {
      this.isLoading = false;
    }
  }

  resetManualForm() {
    this.newUser = {
      nombre: '',
      apellido: '',
      email: '',
      cedula: '',
      asignatura: '',
      paralelo: '',
      titulo: '',
    };
  }

  openModal(thesis: any, action: 'approve' | 'reject'): void {
    this.selectedThesis = thesis;
    this.modalAction = action;
    this.isModalVisible = true;
    if (thesis.userId) {
      this.consultasService
        .getUserById(thesis.userId)
        .pipe(take(1))
        .subscribe((userData) => {
          if (userData) {
            this.selectedThesis = {
              ...thesis,
              studentEmail: userData.email,
              studentId: userData.cedula || 'N/A',
            };
          }
        });
    }

    if (action === 'approve') {
      this.consultasService.getStaffWithWorkload().subscribe((data) => {
        this.availableStaff = data;
      });
    }
  }

  get directorsList() {
    return this.availableStaff.filter((member) => member.role === 'director');
  }

  get evaluatorsList() {
    return this.availableStaff.filter((member) => member.role === 'evaluador');
  }

  confirmProcess(): void {
    if (this.modalAction === 'approve') {
      const director = this.availableStaff.find(
        (d) => d.id === this.assignmentForm.directorId,
      );
      const evaluator = this.availableStaff.find(
        (e) => e.id === this.assignmentForm.evaluatorId,
      );

      const updateData = {
        status: 'Faltante',
        isApproved: true,
        directorId: director.id,
        directorName: `${director.firstName} ${director.lastName}`,
        directorEmail: director.email,
        evaluatorId: evaluator.id,
        evaluatorName: `${evaluator.firstName} ${evaluator.lastName}`,
        evaluatorEmail: evaluator.email,
        approvalDate: new Date(),
      };

      this.consultasService
        .updateTesis(this.selectedThesis.id, updateData)
        .subscribe(() => {
          this.alertaService.mostrarAlerta(
            'exito',
            'Success',
            'Thesis approved and staff assigned.',
          );
          this.closeModal();
        });
    } else if (this.modalAction === 'reject') {
      const updateData = {
        status: 'Rechazado',
        isApproved: false,
        rejectionReason: this.assignmentForm.rejectionReason,
        rejectionDate: new Date(),
      };

      this.consultasService
        .updateTesis(this.selectedThesis.id, updateData)
        .subscribe(() => {
          this.alertaService.mostrarAlerta(
            'info',
            'Rejected',
            'Feedback sent to the student.',
          );
          this.closeModal();
        });
    }
  }

  closeModal(): void {
    this.isModalVisible = false;
    this.selectedThesis = null;
    this.assignmentForm = {
      directorId: '',
      evaluatorId: '',
      rejectionReason: '',
    };
  }

  // Función para abrir el rechazo
  verMotivoRechazo(tesis: any) {
    if (tesis && tesis.rejectionReason) {
      this.selectedRejectionReason = tesis.rejectionReason;
      this.selectedThesis = tesis; // Para mostrar también info de la materia
      this.isRejectionModalVisible = true;
    } else {
      // Caso de seguridad si no hay descripción
      this.selectedRejectionReason =
        'No se ha proporcionado un motivo específico. Por favor, contacte con secretaría.';
      this.isRejectionModalVisible = true;
    }
  }

  closeRejectionModal() {
    this.isRejectionModalVisible = false;
  }
}
