import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import * as XLSX from 'xlsx';
import { AlertaService } from '../../services/alert.service';
import { DirectorioService } from '../../services/directorio.service';
import { ImportService } from '../../services/import.service';
import { LoginService } from '../../services/login.service';

@Component({
  selector: 'app-directorio-autorizados',
  templateUrl: './directorio-autorizados.component.html',
  styleUrls: ['./directorio-autorizados.component.css'],
})
export class DirectorioAutorizadosComponent implements OnInit, OnDestroy {
  mainView: 'personas' | 'materias' | 'cursos' = 'personas';

  authorizedUsers: any[] = [];
  filteredUsers: any[] = [];
  groupedUsers: Record<string, any[]> = {};
  visibleRoles: string[] = [];

  showModal = false;
  selectedRole: string = 'todos';
  searchTerm: string = '';
  isLoadingAuthorized = true;
  isProcessingUser = false;
  selectedFile: File | null = null;
  feedbackMessage = '';
  isError = false;

  activeCycleId: string = '';
  activeCycleName: string = '';
  selectedRoleForUpload:
    | 'director'
    | 'evaluador'
    | 'estudiante'
    | 'docente'
    | null = null;

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

  directorySearchTerm: string = '';
  directoryData$: Observable<any[]> | null = null;

  courseSearchTerm: string = '';
  coursesData$: Observable<any[]> | null = null;
  courseTeachers: any[] = [];

  showCourseEditModal = false;
  selectedCourseItem: any = null;
  isSavingCourse = false;
  private courseTeachersSub: Subscription | null = null;

  showDirectoryEditModal = false;
  directoryEditMode: 'subject' | null = null;
  selectedDirectoryItem: any = null;

  showTeacherEditModal = false;
  selectedTeacherItem: any = null;
  teacherPhotoFile: File | null = null;
  teacherPhotoPreview: string | null = null;
  isSavingTeacher = false;

  readonly roleTypes: string[] = [
    'estudiante',
    'docente',
    'director',
    'evaluador',
    'secretario',
  ];

  readonly roleOrder: string[] = [
    'estudiante',
    'docente',
    'director',
    'evaluador',
    'secretario',
    'sin_rol',
  ];

  readonly teacherTemplateUrl: string =
    'https://firebasestorage.googleapis.com/v0/b/tesisderechoutpl.appspot.com/o/PlantillaUpload%2FPlantilla.xlsx?alt=media&token=34aafdb8-86f4-478d-800f-2c21cef1651c';
  readonly usersTemplateUrl: string =
    'https://firebasestorage.googleapis.com/v0/b/tesisderechoutpl.appspot.com/o/PlantillaUpload%2FPlantillaUsuarios.xlsx?alt=media&token=00461904-4fdd-4ab0-99ee-95fa5d518ff3';

  constructor(
    private directorioService: DirectorioService,
    private importService: ImportService,
    private loginService: LoginService,
    private router: Router,
    private alertaService: AlertaService,
  ) {}

  ngOnInit(): void {
    this.loginService
      .getCurrentUser()
      .pipe(take(1))
      .subscribe((user) => {
        if (!user) {
          this.router.navigate(['/login']);
          return;
        }

        if (user.role !== 'secretario') {
          this.alertaService.mostrarAlerta(
            'info',
            'Acceso restringido',
            'Esta sección es exclusiva para secretaría.',
          );
          this.router.navigate(['/home']);
          return;
        }

        this.loadActiveCycle();
        this.loadAuthorizedUsers();
        this.searchDirectory();
        this.searchCourses();
        this.loadCourseTeachers();
      });
  }

  ngOnDestroy(): void {
    this.courseTeachersSub?.unsubscribe();
    this.courseTeachersSub = null;
  }

  loadAuthorizedUsers(): void {
    this.isLoadingAuthorized = true;

    this.directorioService.getAuthorizedUsers().subscribe({
      next: (data: any[]) => {
        this.authorizedUsers = (data || []).map((user) => ({
          ...user,
          role: this.normalizeRole(user.role),
        }));
        this.applyFilters();
        this.isLoadingAuthorized = false;
      },
      error: (error) => {
        this.isLoadingAuthorized = false;
        this.alertaService.mostrarAlerta(
          'error',
          'Error',
          'No se pudieron cargar los usuarios autorizados.',
        );
        console.error('Error al cargar authorized:', error);
      },
    });
  }

  loadActiveCycle(): void {
    this.directorioService
      .getActiveCycle()
      .pipe(take(1))
      .subscribe({
        next: (cycle) => {
          this.activeCycleId = cycle?.id || '';
          this.activeCycleName = cycle?.name || '';

          if (!this.activeCycleId) {
            this.alertaService.mostrarAlerta(
              'info',
              'Ciclo no definido',
              'No existe un ciclo académico activo (estatus=true).',
            );
          }
        },
        error: () => {
          this.activeCycleId = '';
          this.activeCycleName = '';
          this.alertaService.mostrarAlerta(
            'error',
            'Error',
            'No se pudo obtener el ciclo académico activo.',
          );
        },
      });
  }

  applyFilters(): void {
    const term = this.searchTerm.trim().toLowerCase();
    let users = [...this.authorizedUsers];

    if (this.selectedRole !== 'todos') {
      users = users.filter(
        (user) => this.normalizeRole(user.role) === this.selectedRole,
      );
    }

    if (term) {
      users = users.filter((user) => this.matchesSearch(user, term));
    }

    this.filteredUsers = users;

    const grouped: Record<string, any[]> = {
      estudiante: [],
      docente: [],
      director: [],
      evaluador: [],
      secretario: [],
      sin_rol: [],
    };

    users.forEach((user) => {
      const role = this.normalizeRole(user.role);
      grouped[role].push(user);
    });

    this.groupedUsers = grouped;
    this.visibleRoles =
      this.selectedRole === 'todos'
        ? this.roleOrder.filter((role) => grouped[role]?.length > 0)
        : this.roleOrder.filter(
            (role) => role === this.selectedRole && grouped[role]?.length > 0,
          );
  }

  setRoleFilter(role: string): void {
    this.selectedRole = this.selectedRole === role ? 'todos' : role;
    this.applyFilters();
  }

  setMainView(view: 'personas' | 'materias' | 'cursos'): void {
    this.mainView = view;

    if (view === 'materias') {
      this.searchDirectory();
    }

    if (view === 'cursos') {
      this.searchCourses();
      this.loadCourseTeachers();
    }
  }

  getRoleCount(role: string): number {
    return this.authorizedUsers.filter(
      (user) => this.normalizeRole(user.role) === role,
    ).length;
  }

  getUsersByRole(role: string): any[] {
    return this.groupedUsers[role] || [];
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      estudiante: 'Estudiantes',
      docente: 'Docentes',
      director: 'Directores',
      evaluador: 'Evaluadores',
      secretario: 'Secretaría',
      sin_rol: 'Sin rol',
    };

    return labels[role] || 'Sin rol';
  }

  getFullName(user: any): string {
    const firstName = user.firstName || user.nombre || '';
    const lastName = user.lastName || user.apellido || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || 'Sin nombre';
  }

  getDisplayEmail(user: any): string {
    return user.email || user.id || 'Sin correo';
  }

  getInitials(user: any): string {
    const fullName = this.getFullName(user);

    if (fullName === 'Sin nombre') {
      return '?';
    }

    const parts = fullName.split(' ').filter((p) => p.length > 0);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }

    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }

  getStatusLabel(user: any): string {
    const status = this.normalizeStatus(user?.status);

    if (status === 'registered') return 'Registrado';
    if (status === 'no registered' || status === 'pending')
      return 'No registrado';

    return 'Autorizado';
  }

  getModalityLabel(modality: string): string {
    const normalized = `${modality || ''}`.toLowerCase().trim();

    if (normalized === 'presencial') {
      return 'Presencial';
    }

    if (normalized === 'distancia') {
      return 'Distancia';
    }

    if (!normalized) {
      return 'Sin modalidad';
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  getTeacherDisplayLabel(teacher: any): string {
    const fullName =
      `${teacher?.firstName || teacher?.nombre || ''} ${teacher?.lastName || teacher?.apellido || ''}`.trim();

    if (fullName && teacher?.email) {
      return `${fullName} - ${teacher.email}`;
    }

    return fullName || teacher?.email || 'Docente';
  }

  isRegistered(user: any): boolean {
    return this.normalizeStatus(user?.status) === 'registered';
  }

  isNotRegistered(user: any): boolean {
    const status = this.normalizeStatus(user?.status);
    return status === 'no registered' || status === 'pending';
  }

  trackByEmail(index: number, user: any): string {
    return user.email || user.id || `${index}`;
  }

  openCreateModal(): void {
    this.showModal = true;
    this.feedbackMessage = '';
    this.isError = false;
  }

  closeCreateModal(): void {
    this.showModal = false;
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      this.selectedFile = file;
      this.feedbackMessage = '';
      this.isError = false;
      return;
    }

    this.selectedFile = null;
    this.feedbackMessage =
      'Error: Por favor, selecciona un archivo Excel (.xlsx o .xls).';
    this.isError = true;
  }

  async processFile(): Promise<void> {
    if (!this.selectedFile || !this.selectedRoleForUpload) {
      this.feedbackMessage = 'Selecciona un archivo y un rol.';
      this.isError = true;
      return;
    }

    if (this.selectedRoleForUpload === 'docente' && !this.activeCycleId) {
      this.feedbackMessage =
        'No existe un ciclo académico activo para importar docentes.';
      this.isError = true;
      return;
    }

    this.isProcessingUser = true;
    const reader = new FileReader();

    reader.onload = async (e: any) => {
      try {
        const workbook = XLSX.read(e.target.result, { type: 'binary' });
        const rows: any[] = XLSX.utils.sheet_to_json(
          workbook.Sheets[workbook.SheetNames[0]],
        );

        if (rows.length === 0) {
          throw new Error('El archivo está vacío.');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const seenEmails = new Set<string>();
        const payload: any[] = [];

        for (const [index, row] of rows.entries()) {
          const fila = index + 2;

          if (!row.email || !row.nombre || !row.apellido) {
            throw new Error(
              `Fila ${fila}: email, nombre y apellido son obligatorios`,
            );
          }

          const email = String(row.email).trim().toLowerCase();
          if (!emailRegex.test(email)) {
            throw new Error(`Fila ${fila}: email inválido`);
          }

          const userEntry: any = {
            email,
            firstName: String(row.nombre).trim(),
            lastName: String(row.apellido).trim(),
            cedula: row.cedula ? String(row.cedula).trim() : null,
            role: this.selectedRoleForUpload,
          };

          if (this.selectedRoleForUpload === 'docente') {
            if (!row.asignatura || !row.paralelo) {
              throw new Error(
                `Fila ${fila}: Los docentes requieren Asignatura y Paralelo.`,
              );
            }

            if (seenEmails.has(email)) {
              continue;
            }
            seenEmails.add(email);

            userEntry.degree = row.titulo ? String(row.titulo).trim() : 'Abg.';
            userEntry.tempData = {
              subjectName: String(row.asignatura).trim(),
              parallel: String(row.paralelo).trim().toUpperCase(),
              modality: row.modalidad
                ? String(row.modalidad).trim().toLowerCase()
                : 'presencial',
              cycleId: this.activeCycleId,
            };
          }

          payload.push(userEntry);
        }

        await this.importService.saveUsersToAuthorized(payload);

        this.isError = false;
        this.feedbackMessage = `Éxito: ${payload.length} registros de ${this.selectedRoleForUpload} procesados.`;
        this.loadAuthorizedUsers();
      } catch (error: any) {
        this.isError = true;
        this.feedbackMessage = error.message || 'Error al importar.';
      } finally {
        this.isProcessingUser = false;
      }
    };

    reader.readAsBinaryString(this.selectedFile);
  }

  async saveManualUser(): Promise<void> {
    if (!this.selectedRoleForUpload) {
      this.feedbackMessage = 'Debes seleccionar un rol.';
      this.isError = true;
      return;
    }

    if (this.selectedRoleForUpload === 'docente' && !this.activeCycleId) {
      this.feedbackMessage =
        'No existe un ciclo académico activo para registrar docentes.';
      this.isError = true;
      return;
    }

    this.isProcessingUser = true;

    try {
      const cleanUser: any = {
        firstName: this.newUser.nombre.trim(),
        lastName: this.newUser.apellido.trim(),
        email: this.newUser.email.trim().toLowerCase(),
        cedula: String(this.newUser.cedula).trim(),
        role: this.selectedRoleForUpload,
      };

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

      if (
        this.selectedRoleForUpload === 'director' ||
        this.selectedRoleForUpload === 'evaluador'
      ) {
        cleanUser.currentLoad = 0;
      }

      if (!cleanUser.firstName || !cleanUser.email || !cleanUser.cedula) {
        throw new Error('Por favor completa los campos obligatorios.');
      }

      await this.importService.saveUsersToAuthorized([cleanUser]);

      this.isError = false;
      this.feedbackMessage = 'Usuario guardado correctamente.';
      this.resetManualForm();
      this.loadAuthorizedUsers();
    } catch (error: any) {
      this.isError = true;
      this.feedbackMessage = error.message || 'No se pudo guardar el usuario.';
    } finally {
      this.isProcessingUser = false;
    }
  }

  resetManualForm(): void {
    this.newUser = {
      nombre: '',
      apellido: '',
      email: '',
      cedula: '',
      asignatura: '',
      paralelo: '',
      titulo: '',
      modalidad: '',
    };
  }

  openTeacherEditModal(user: any): void {
    if (!this.isRegistered(user)) {
      this.alertaService.mostrarAlerta(
        'info',
        'Acción no disponible',
        'Solo se puede editar el perfil de docentes registrados.',
      );
      return;
    }

    const email = `${user?.email || ''}`.trim().toLowerCase();

    if (!email) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        'El docente no tiene correo registrado para editar su perfil.',
      );
      return;
    }

    this.selectedTeacherItem = {
      ...user,
      email,
      degree: user?.degree || '',
      description: user?.description || '',
      photoURL: user?.photoURL || '',
    };

    this.teacherPhotoFile = null;
    this.teacherPhotoPreview = this.selectedTeacherItem.photoURL || null;
    this.showTeacherEditModal = true;
  }

  closeTeacherEditModal(): void {
    this.showTeacherEditModal = false;
    this.selectedTeacherItem = null;
    this.teacherPhotoFile = null;
    this.teacherPhotoPreview = null;
    this.isSavingTeacher = false;
  }

  onTeacherPhotoSelected(event: any): void {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type?.startsWith('image/')) {
      this.alertaService.mostrarAlerta(
        'error',
        'Formato no válido',
        'Selecciona una imagen para la foto del docente.',
      );
      return;
    }

    this.teacherPhotoFile = file;

    const reader = new FileReader();
    reader.onload = () => {
      this.teacherPhotoPreview = `${reader.result || ''}`;
    };
    reader.readAsDataURL(file);
  }

  async saveTeacherProfile(): Promise<void> {
    if (!this.selectedTeacherItem?.email) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        'No se encontró el correo del docente a actualizar.',
      );
      return;
    }

    this.isSavingTeacher = true;

    try {
      const degree = `${this.selectedTeacherItem.degree || ''}`.trim();
      const description =
        `${this.selectedTeacherItem.description || ''}`.trim();

      await this.directorioService.updateTeacherProfileByEmail(
        this.selectedTeacherItem.email,
        {
          degree: degree || null,
          description,
        },
      );

      if (this.teacherPhotoFile) {
        const uploadedPhoto =
          await this.directorioService.uploadTeacherPhotoByEmail(
            this.selectedTeacherItem.email,
            this.teacherPhotoFile,
          );
        this.selectedTeacherItem.photoURL = uploadedPhoto;
      }

      this.alertaService.mostrarAlerta(
        'exito',
        'Actualizado',
        'Datos del docente actualizados correctamente.',
      );

      this.closeTeacherEditModal();
      this.loadAuthorizedUsers();
    } catch (error) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        'No se pudo actualizar el perfil del docente.',
      );
      console.error('Error al guardar docente:', error);
    } finally {
      this.isSavingTeacher = false;
    }
  }

  searchDirectory(): void {
    this.directoryData$ = this.directorioService.getSubjects(
      this.directorySearchTerm,
    );
  }

  searchCourses(): void {
    this.coursesData$ = this.directorioService.getCourses(
      this.courseSearchTerm,
    );
  }

  loadCourseTeachers(): void {
    this.courseTeachersSub?.unsubscribe();
    this.courseTeachersSub = this.directorioService
      .getTeachersForCourseSelection()
      .subscribe({
        next: (teachers) => {
          this.courseTeachers = [...(teachers || [])].sort((a: any, b: any) => {
            const nameA =
              `${a?.firstName || a?.nombre || ''} ${a?.lastName || a?.apellido || ''}`
                .trim()
                .toLowerCase();
            const nameB =
              `${b?.firstName || b?.nombre || ''} ${b?.lastName || b?.apellido || ''}`
                .trim()
                .toLowerCase();
            return nameA.localeCompare(nameB);
          });
        },
        error: () => {
          this.courseTeachers = [];
        },
      });
  }

  openCourseEditModal(course: any): void {
    this.selectedCourseItem = {
      ...course,
      parallel: course?.parallel || '',
      type: `${course?.type || course?.modality || 'presencial'}`.toLowerCase(),
      professorId: course?.professorId || '',
    };

    this.isSavingCourse = false;
    this.showCourseEditModal = true;

    if (!this.courseTeachers.length) {
      this.loadCourseTeachers();
    }
  }

  closeCourseEditModal(): void {
    this.showCourseEditModal = false;
    this.selectedCourseItem = null;
    this.isSavingCourse = false;
  }

  async saveCourseChanges(): Promise<void> {
    if (!this.selectedCourseItem?.id) {
      return;
    }

    const parallel = `${this.selectedCourseItem.parallel || ''}`
      .trim()
      .toUpperCase();
    const type = `${this.selectedCourseItem.type || ''}`.trim().toLowerCase();

    if (!parallel) {
      this.alertaService.mostrarAlerta(
        'error',
        'Campo requerido',
        'Debes ingresar el paralelo del curso.',
      );
      return;
    }

    if (!type) {
      this.alertaService.mostrarAlerta(
        'error',
        'Campo requerido',
        'Debes seleccionar la modalidad del curso.',
      );
      return;
    }

    this.isSavingCourse = true;

    try {
      await this.directorioService.updateCourseAndSyncTheses(
        this.selectedCourseItem.id,
        {
          parallel,
          type,
          professorId: `${this.selectedCourseItem.professorId || ''}`.trim(),
        },
      );

      this.alertaService.mostrarAlerta(
        'exito',
        'Curso actualizado',
        'Se actualizó el curso y se sincronizaron las tesis vinculadas.',
      );

      this.closeCourseEditModal();
      this.searchCourses();
    } catch (error) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        'No se pudo actualizar el curso o sincronizar tesis.',
      );
      console.error('Error al actualizar curso:', error);
    } finally {
      this.isSavingCourse = false;
    }
  }

  openDirectoryEditModal(item: any): void {
    this.selectedDirectoryItem = JSON.parse(JSON.stringify(item));
    this.directoryEditMode = 'subject';

    if (
      this.directoryEditMode === 'subject' &&
      !Array.isArray(this.selectedDirectoryItem.questions)
    ) {
      this.selectedDirectoryItem.questions = [];
    }

    this.showDirectoryEditModal = true;
  }

  closeDirectoryEditModal(): void {
    this.showDirectoryEditModal = false;
    this.directoryEditMode = null;
    this.selectedDirectoryItem = null;
  }

  saveDirectoryModalChanges(): void {
    if (!this.selectedDirectoryItem || !this.directoryEditMode) {
      return;
    }

    this.directorioService
      .updateRecord('subjects', this.selectedDirectoryItem.id, {
        description: this.selectedDirectoryItem.description || '',
        questions: this.selectedDirectoryItem.questions || [],
      })
      .then(() => {
        this.alertaService.mostrarAlerta(
          'exito',
          'Actualizado',
          'La materia fue actualizada correctamente.',
        );
        this.closeDirectoryEditModal();
        this.searchDirectory();
      })
      .catch(() => {
        this.alertaService.mostrarAlerta(
          'error',
          'Error',
          'No se pudo actualizar la materia.',
        );
      });
  }

  addDirectoryQuestion(): void {
    if (!this.selectedDirectoryItem) {
      return;
    }

    if (!this.selectedDirectoryItem.questions) {
      this.selectedDirectoryItem.questions = [];
    }

    this.selectedDirectoryItem.questions.push('');
  }

  removeDirectoryQuestion(index: number): void {
    if (!this.selectedDirectoryItem?.questions) {
      return;
    }

    this.selectedDirectoryItem.questions.splice(index, 1);
  }

  private matchesSearch(user: any, term: string): boolean {
    const fullName = this.getFullName(user).toLowerCase();
    const email = `${user.email || user.id || ''}`.toLowerCase();
    const cedula = `${user.cedula || ''}`.toLowerCase();
    const role = this.getRoleLabel(this.normalizeRole(user.role)).toLowerCase();

    return (
      fullName.includes(term) ||
      email.includes(term) ||
      cedula.includes(term) ||
      role.includes(term)
    );
  }

  private normalizeRole(role: any): string {
    const value = `${role || ''}`.toLowerCase().trim();
    return this.roleTypes.includes(value) ? value : 'sin_rol';
  }

  private normalizeStatus(status: any): string {
    const value = `${status || ''}`.toLowerCase().trim();

    if (value === 'not registered' || value === 'not_registered') {
      return 'no registered';
    }

    return value;
  }

  get currentTemplateUrl(): string {
    return this.selectedRoleForUpload === 'docente'
      ? this.teacherTemplateUrl
      : this.usersTemplateUrl;
  }

  get currentTemplateLabel(): string {
    return this.selectedRoleForUpload === 'docente'
      ? 'de docentes'
      : 'general de usuarios';
  }

  downloadCurrentTemplate(): void {
    if (!this.selectedRoleForUpload) {
      this.alertaService.mostrarAlerta(
        'info',
        'Selecciona un rol',
        'Debes seleccionar un rol para descargar la plantilla.',
      );
      return;
    }

    window.open(this.currentTemplateUrl, '_blank', 'noopener,noreferrer');
  }
}
