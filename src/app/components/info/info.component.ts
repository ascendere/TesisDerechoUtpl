import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { LoginService } from '../../services/login.service';
import { ConsultasService } from '../../services/consultas.service';
import { catchError, forkJoin, Observable, of, take, throwError } from 'rxjs';
import { switchMap, map, first } from 'rxjs/operators';
import Class from '../../interfaces/classes.interface';
import autoTable from 'jspdf-autotable';
import { jsPDF } from 'jspdf';
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
  approvalClasses: (Class & {
    professorName: string;
    professorEmail: string;
    professorId: string;
  })[] = [];

  tesisList: any[] = []; // Lista completa de tesis
  filteredTesis: any[] = []; // Lista filtrada según el buscador
  searchTerm: string = '';
  classMap: Map<string, any> = new Map(); // Mapa para asignaturas y paralelos

  cycles: any[] = [];
  selectedCycleId: string = '';
  activeCycleName: string = '';
  filteredClasses: (Class & { professorName: string })[] = [];

  isModalVisible: boolean = false;
  selectedThesis: any = null;
  availableStaff: any[] = [];
  modalAction: 'approve' | 'reject' | null = null;

  // Form data for the modal
  assignmentForm = {
    classId: '',
    directorId: '',
    evaluatorId: '',
    rejectionReason: '',
  };
  showTesisModal = false;
  selectedRejectionReason: string = '';
  isRejectionModalVisible: boolean = false;

  tipoTesis: 'pregrado' | 'posgrado' | null = null;
  datosTesis = {
    numeroSentencia: '',
    asunto: '',
    tituloPosgrado: '',
  };

  constructor(
    private loginService: LoginService,
    private consultasService: ConsultasService,
    private router: Router,
    private alertaService: AlertaService,
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
    this.consultasService
      .getActiveCycle()
      .pipe(take(1))
      .subscribe({
        next: (cycle) => {
          if (!cycle) {
            this.cycles = [];
            this.selectedCycleId = '';
            this.activeCycleName = '';
            this.alertaService.mostrarAlerta(
              'info',
              'Ciclo no definido',
              'No existe un ciclo académico activo (estatus=true).',
            );
            return;
          }

          this.cycles = [cycle];
          this.selectedCycleId = cycle.id;
          this.activeCycleName = cycle.name || '';
        },
        error: () => {
          this.cycles = [];
          this.selectedCycleId = '';
          this.activeCycleName = '';
          this.alertaService.mostrarAlerta(
            'error',
            'Error',
            'No se pudo obtener el ciclo académico activo.',
          );
        },
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
        const activeCycleId = `${this.selectedCycleId || ''}`.trim();

        this.filteredClasses = (classes || []).filter((item: any) => {
          if (!activeCycleId) {
            return false;
          }

          const classCycleId = `${item?.cycleId || item?.cicleId || ''}`.trim();
          return classCycleId === activeCycleId;
        });
      });
  }

  isButtonEnabled(): boolean {
    return this.isTesisFormComplete() && !this.isCreatingTesis;
  }

  private isTesisFormComplete(): boolean {
    if (!this.selectedCycleId || !this.selectedModality || !this.selectedClass) {
      return false;
    }

    if (this.tipoTesis === 'pregrado') {
      const numeroSentencia = this.sanitizeNumeroSentencia(
        this.datosTesis.numeroSentencia,
      ).trim();
      const asunto = `${this.datosTesis.asunto || ''}`.trim();
      return !!numeroSentencia && !!asunto;
    }

    if (this.tipoTesis === 'posgrado') {
      const titulo = `${this.datosTesis.tituloPosgrado || ''}`.trim();
      return !!titulo;
    }

    return false;
  }

  private getMissingFieldsMessage(): string {
    const missingFields: string[] = [];

    if (!this.tipoTesis) {
      missingFields.push('tipo de tesis');
    }

    if (!this.selectedCycleId) {
      missingFields.push('ciclo académico activo');
    }

    if (!this.selectedModality) {
      missingFields.push('modalidad');
    }

    if (!this.selectedClass) {
      missingFields.push('clase');
    }

    if (this.tipoTesis === 'pregrado') {
      const numeroSentencia = this.sanitizeNumeroSentencia(
        this.datosTesis.numeroSentencia,
      ).trim();
      const asunto = `${this.datosTesis.asunto || ''}`.trim();

      if (!numeroSentencia) {
        missingFields.push('número de sentencia');
      }

      if (!asunto) {
        missingFields.push('asunto');
      }
    }

    if (this.tipoTesis === 'posgrado') {
      const titulo = `${this.datosTesis.tituloPosgrado || ''}`.trim();
      if (!titulo) {
        missingFields.push('título de tesis');
      }
    }

    if (missingFields.length === 0) {
      return 'Completa todos los campos obligatorios.';
    }

    return `Completa los siguientes campos: ${missingFields.join(', ')}.`;
  }

  onNumeroSentenciaInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const sanitizedValue = this.sanitizeNumeroSentencia(input?.value || '');

    this.datosTesis.numeroSentencia = sanitizedValue;

    if (input) {
      input.value = sanitizedValue;
    }
  }

  onNumeroSentenciaKeydown(event: KeyboardEvent): void {
    const allowedKeys = [
      'Backspace',
      'Delete',
      'ArrowLeft',
      'ArrowRight',
      'Tab',
      'Home',
      'End',
    ];

    if (allowedKeys.includes(event.key)) {
      return;
    }

    if (/^[0-9-]$/.test(event.key)) {
      return;
    }

    event.preventDefault();
  }

  goToProfile(): void {
    if (!this.selectedCycleId) {
      this.alertaService.mostrarAlerta(
        'error',
        'Sin ciclo activo',
        'No existe un ciclo académico activo para registrar la tesis.',
      );
      return;
    }

    if (!this.isTesisFormComplete()) {
      this.alertaService.mostrarAlerta(
        'error',
        'Incompleto',
        this.getMissingFieldsMessage(),
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
          const numeroSentencia = this.sanitizeNumeroSentencia(
            this.datosTesis.numeroSentencia,
          ).trim();
          const asunto = `${this.datosTesis.asunto || ''}`.trim();
          const tituloPosgrado = `${this.datosTesis.tituloPosgrado || ''}`.trim();

          // OBJETO BASE
          let tesisData: any = {
            studentName: `${user.firstName} ${user.lastName}`,
            userId: user.id,
            className: classData.subjectName,
            classParallel: classData.parallel,
            classId: classData.id,
            directorName: classData.directorName || 'Sin Director Asignado',
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
            tesisData.numeroSentencia = numeroSentencia;
            tesisData.asunto = asunto;
          } else {
            tesisData.tituloTesis = tituloPosgrado;
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
  openModal(thesis: any, action: 'approve' | 'reject'): void {
    this.selectedThesis = thesis;
    this.modalAction = action;
    this.isModalVisible = true;
    this.assignmentForm = {
      classId: thesis?.classId || '',
      directorId: thesis?.directorId || '',
      evaluatorId: thesis?.evaluatorId || '',
      rejectionReason: '',
    };
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
      forkJoin({
        staff: this.consultasService
          .getStaffWithWorkload(this.activeCycleName, this.selectedCycleId)
          .pipe(take(1)),
        classes: this.consultasService
          .getClassesForSecretaryAssignment(this.selectedCycleId)
          .pipe(take(1)),
      }).subscribe({
        next: ({ staff, classes }) => {
          this.availableStaff = staff || [];
          this.approvalClasses = classes || [];

          const classExists = this.approvalClasses.some(
            (classItem) => classItem.id === this.assignmentForm.classId,
          );

          if (!classExists && this.approvalClasses.length > 0) {
            this.assignmentForm.classId = this.approvalClasses[0].id;
          }
        },
        error: () => {
          this.availableStaff = [];
          this.approvalClasses = [];
          this.alertaService.mostrarAlerta(
            'error',
            'Error',
            'No se pudieron cargar clases o personal para la aprobación.',
          );
        },
      });
    }
  }

  get directorsList() {
    return this.availableStaff.filter((member) => member.role === 'director');
  }

  get evaluatorsList() {
    return this.availableStaff.filter((member) => member.role === 'evaluador');
  }

  get selectedApprovalClass() {
    return (
      this.approvalClasses.find(
        (classItem) => classItem.id === this.assignmentForm.classId,
      ) || null
    );
  }

  confirmProcess(): void {
    if (this.modalAction === 'approve') {
      const director = this.availableStaff.find(
        (d) => d.id === this.assignmentForm.directorId,
      );
      const evaluator = this.availableStaff.find(
        (e) => e.id === this.assignmentForm.evaluatorId,
      );
      const selectedClass = this.approvalClasses.find(
        (classItem) => classItem.id === this.assignmentForm.classId,
      );

      if (!director || !evaluator || !selectedClass) {
        this.alertaService.mostrarAlerta(
          'error',
          'Datos incompletos',
          'Seleccione clase, director y evaluador para aprobar.',
        );
        return;
      }

      const updateData = {
        status: 'Faltante',
        isApproved: true,
        classId: selectedClass.id,
        className: selectedClass.subjectName || 'Sin asignatura',
        classParallel: selectedClass.parallel || '',
        professorId: selectedClass.professorId || '',
        professorName: selectedClass.professorName || 'Sin docente',
        professorEmail: selectedClass.professorEmail || '',
        ciclo: this.activeCycleName || this.selectedThesis?.ciclo || '',
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
    this.approvalClasses = [];
    this.assignmentForm = {
      classId: '',
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

  private sanitizeNumeroSentencia(value: string): string {
    return `${value || ''}`.replace(/[^0-9-]/g, '');
  }
}
