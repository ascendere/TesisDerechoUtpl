import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { map, take } from 'rxjs/operators';
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
  private static readonly PAGINATION_STORAGE_KEY =
    'directorio-autorizados-pagination-v1';

  mainView: 'personas' | 'materias' | 'cursos' = 'personas';

  authorizedUsers: any[] = [];
  filteredUsers: any[] = [];

  showModal = false;
  selectedRole: string = 'todos';
  selectedStatus: 'todos' | 'registered' | 'pending' = 'todos';
  searchTerm: string = '';
  currentPage = 1;
  pageSize = 10;
  isLoadingAuthorized = true;
  isProcessingUser = false;
  isDeactivatingUsers = false;
  isDeactivatingCourses = false;
  selectedFile: File | null = null;
  feedbackMessage = '';
  isError = false;
  selectedAuthorizedEmails = new Set<string>();
  selectedCourseIds = new Set<string>();

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
    isPPL: false,
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
  showCreateSubjectModal = false;
  isCreatingSubject = false;
  newSubject = {
    name: '',
    description: '',
  };

  showCreateCourseModal = false;
  isCreatingCourse = false;
  subjectOptions: any[] = [];
  newCourse = {
    subjectName: '',
    parallel: '',
    type: 'presencial',
    professorId: '',
  };

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

  readonly statusOptions: Array<{
    value: 'todos' | 'registered' | 'pending';
    label: string;
  }> = [
    { value: 'todos', label: 'Todos' },
    { value: 'registered', label: 'Registrado' },
    { value: 'pending', label: 'No registrado' },
  ];

  readonly pageSizeOptions: number[] = [10, 20, 50];

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
    this.loadPaginationPreferences();

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
        this.authorizedUsers = (data || [])
          .map((user) => ({
            ...user,
            role: this.normalizeRole(user.role),
            isActive: this.isAuthorizedActive(user),
          }))
          .filter((user) => user.isActive !== false);
        this.syncSelectedAuthorizedEmails();
        this.applyFilters(false);
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

  applyFilters(resetPage: boolean = true): void {
    const term = this.searchTerm.trim().toLowerCase();
    let users = [...this.authorizedUsers];

    if (this.selectedRole !== 'todos') {
      users = users.filter(
        (user) => this.normalizeRole(user.role) === this.selectedRole,
      );
    }

    if (this.selectedStatus !== 'todos') {
      users = users.filter((user) => {
        const status = this.normalizeStatus(user?.status);

        if (this.selectedStatus === 'registered') {
          return status === 'registered';
        }

        return status === 'no registered' || status === 'pending';
      });
    }

    if (term) {
      users = users.filter((user) => this.matchesSearch(user, term));
    }

    this.filteredUsers = users;

    if (resetPage) {
      this.currentPage = 1;
    }

    this.ensureCurrentPageInRange();
    this.savePaginationPreferences();
  }

  setRoleFilter(role: string): void {
    this.selectedRole = this.selectedRole === role ? 'todos' : role;
    this.applyFilters();
  }

  onPageSizeChange(): void {
    this.currentPage = 1;
    this.savePaginationPreferences();
  }

  get selectedUsersCount(): number {
    return this.selectedAuthorizedEmails.size;
  }

  get hasSelectedUsers(): boolean {
    return this.selectedUsersCount > 0;
  }

  get allFilteredSelected(): boolean {
    if (!this.filteredUsers.length) {
      return false;
    }

    return this.filteredUsers.every((user) =>
      this.selectedAuthorizedEmails.has(this.getAuthorizedEmail(user)),
    );
  }

  get allCurrentPageSelected(): boolean {
    if (!this.paginatedUsers.length) {
      return false;
    }

    return this.paginatedUsers.every((user) =>
      this.selectedAuthorizedEmails.has(this.getAuthorizedEmail(user)),
    );
  }

  toggleSelectUser(user: any, checked: boolean): void {
    const email = this.getAuthorizedEmail(user);

    if (!email) {
      return;
    }

    if (checked) {
      this.selectedAuthorizedEmails.add(email);
    } else {
      this.selectedAuthorizedEmails.delete(email);
    }
  }

  isUserSelected(user: any): boolean {
    return this.selectedAuthorizedEmails.has(this.getAuthorizedEmail(user));
  }

  toggleSelectAllCurrentPage(checked: boolean): void {
    this.paginatedUsers.forEach((user) => {
      const email = this.getAuthorizedEmail(user);
      if (!email) {
        return;
      }

      if (checked) {
        this.selectedAuthorizedEmails.add(email);
      } else {
        this.selectedAuthorizedEmails.delete(email);
      }
    });
  }

  selectAllFilteredUsers(): void {
    this.filteredUsers.forEach((user) => {
      const email = this.getAuthorizedEmail(user);
      if (email) {
        this.selectedAuthorizedEmails.add(email);
      }
    });
  }

  clearSelectedUsers(): void {
    this.selectedAuthorizedEmails.clear();
  }

  async deactivateUser(user: any): Promise<void> {
    const email = this.getAuthorizedEmail(user);

    if (!email) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        'No se pudo identificar el correo del usuario.',
      );
      return;
    }

    const confirmed = window.confirm(
      `Se desactivará el usuario ${email}. ¿Deseas continuar?`,
    );

    if (!confirmed) {
      return;
    }

    this.isDeactivatingUsers = true;

    try {
      await this.directorioService.deactivateAuthorizedUsers([email]);
      this.selectedAuthorizedEmails.delete(email);
      this.alertaService.mostrarAlerta(
        'exito',
        'Usuario desactivado',
        'El usuario fue desactivado correctamente.',
      );
    } catch (error) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        'No se pudo desactivar el usuario seleccionado.',
      );
      console.error('Error al desactivar usuario:', error);
    } finally {
      this.isDeactivatingUsers = false;
    }
  }

  async deactivateSelectedUsers(): Promise<void> {
    const emails = Array.from(this.selectedAuthorizedEmails);

    if (!emails.length) {
      this.alertaService.mostrarAlerta(
        'info',
        'Sin selección',
        'Selecciona al menos un usuario para desactivar.',
      );
      return;
    }

    const confirmed = window.confirm(
      `Se desactivarán ${emails.length} usuario(s). ¿Deseas continuar?`,
    );

    if (!confirmed) {
      return;
    }

    this.isDeactivatingUsers = true;

    try {
      await this.directorioService.deactivateAuthorizedUsers(emails);
      this.selectedAuthorizedEmails.clear();
      this.alertaService.mostrarAlerta(
        'exito',
        'Usuarios desactivados',
        `${emails.length} usuario(s) fueron desactivados correctamente.`,
      );
    } catch (error) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        'No se pudieron desactivar los usuarios seleccionados.',
      );
      console.error('Error al desactivar usuarios:', error);
    } finally {
      this.isDeactivatingUsers = false;
    }
  }

  goToPrevPage(): void {
    if (this.currentPage > 1) {
      this.currentPage -= 1;
      this.savePaginationPreferences();
    }
  }

  goToNextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage += 1;
      this.savePaginationPreferences();
    }
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.savePaginationPreferences();
    }
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
  }

  get paginatedUsers(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  get startItem(): number {
    if (!this.filteredUsers.length) {
      return 0;
    }

    return (this.currentPage - 1) * this.pageSize + 1;
  }

  get endItem(): number {
    return Math.min(
      this.currentPage * this.pageSize,
      this.filteredUsers.length,
    );
  }

  get visiblePageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - 2);
    let end = Math.min(this.totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    return pages;
  }

  private ensureCurrentPageInRange(): void {
    if (this.currentPage < 1) {
      this.currentPage = 1;
      return;
    }

    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
  }

  private loadPaginationPreferences(): void {
    try {
      const raw = localStorage.getItem(
        DirectorioAutorizadosComponent.PAGINATION_STORAGE_KEY,
      );

      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      const savedPageSize = Number(parsed?.pageSize);
      const savedCurrentPage = Number(parsed?.currentPage);

      if (this.pageSizeOptions.includes(savedPageSize)) {
        this.pageSize = savedPageSize;
      }

      if (Number.isFinite(savedCurrentPage) && savedCurrentPage >= 1) {
        this.currentPage = Math.floor(savedCurrentPage);
      }
    } catch {
      localStorage.removeItem(
        DirectorioAutorizadosComponent.PAGINATION_STORAGE_KEY,
      );
    }
  }

  private savePaginationPreferences(): void {
    try {
      localStorage.setItem(
        DirectorioAutorizadosComponent.PAGINATION_STORAGE_KEY,
        JSON.stringify({
          pageSize: this.pageSize,
          currentPage: this.currentPage,
        }),
      );
    } catch {
      // Ignore storage write errors to avoid affecting the UI.
    }
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

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      estudiante: 'Estudiante',
      docente: 'Docente',
      director: 'Director',
      evaluador: 'Evaluador',
      secretario: 'Secretario',
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
    if (status === 'disabled') return 'Desactivado';

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

  private getAuthorizedEmail(user: any): string {
    return `${user?.email || user?.id || ''}`.toLowerCase().trim();
  }

  private syncSelectedAuthorizedEmails(): void {
    if (!this.selectedAuthorizedEmails.size) {
      return;
    }

    const activeEmails = new Set(
      this.authorizedUsers
        .map((user) => this.getAuthorizedEmail(user))
        .filter((email) => !!email),
    );

    Array.from(this.selectedAuthorizedEmails).forEach((email) => {
      if (!activeEmails.has(email)) {
        this.selectedAuthorizedEmails.delete(email);
      }
    });
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
            isPPL: this.parsePPLValue(row.ppl),
            sourceRow: fila,
          };

          if (this.selectedRoleForUpload === 'docente') {
            if (!row.asignatura || !row.paralelo) {
              throw new Error(
                `Fila ${fila}: Los docentes requieren Asignatura y Paralelo.`,
              );
            }

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

        const report = await this.importService.saveUsersToAuthorized(payload);

        this.isError = report.created === 0 && report.reactivated === 0;
        this.feedbackMessage = this.buildAuthorizedSaveMessage(report, 'bulk');

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
        isPPL:
          this.selectedRoleForUpload === 'estudiante'
            ? this.newUser.isPPL === true
            : false,
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

      const report = await this.importService.saveUsersToAuthorized([
        cleanUser,
      ]);

      this.isError = report.created === 0 && report.reactivated === 0;
      this.feedbackMessage = this.buildAuthorizedSaveMessage(report, 'manual');
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
      isPPL: false,
      asignatura: '',
      paralelo: '',
      titulo: '',
      modalidad: '',
    };
  }

  private parsePPLValue(value: any): boolean {
    return `${value || ''}`.trim().toLowerCase() === 's';
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

  openCreateSubjectModal(): void {
    this.newSubject = {
      name: '',
      description: '',
    };
    this.showCreateSubjectModal = true;
    this.isCreatingSubject = false;
  }

  closeCreateSubjectModal(): void {
    this.showCreateSubjectModal = false;
    this.isCreatingSubject = false;
  }

  async saveNewSubject(): Promise<void> {
    const name = `${this.newSubject.name || ''}`.trim();
    const description = `${this.newSubject.description || ''}`.trim();

    if (!name) {
      this.alertaService.mostrarAlerta(
        'error',
        'Campo requerido',
        'Debes ingresar el nombre de la materia.',
      );
      return;
    }

    this.isCreatingSubject = true;

    try {
      await this.directorioService.createSubject({
        name,
        description,
      });

      this.alertaService.mostrarAlerta(
        'exito',
        'Materia creada',
        'La materia fue creada correctamente.',
      );

      this.closeCreateSubjectModal();
      this.searchDirectory();
    } catch (error: any) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        error?.message || 'No se pudo crear la materia.',
      );
    } finally {
      this.isCreatingSubject = false;
    }
  }

  searchCourses(): void {
    this.coursesData$ = this.directorioService
      .getCourses(this.courseSearchTerm)
      .pipe(
        map((courses) => {
          this.syncSelectedCourseIds(courses || []);
          return courses || [];
        }),
      );
  }

  openCreateCourseModal(): void {
    if (!this.activeCycleId) {
      this.alertaService.mostrarAlerta(
        'info',
        'Ciclo no definido',
        'No existe un ciclo académico activo para crear cursos.',
      );
      return;
    }

    this.newCourse = {
      subjectName: '',
      parallel: '',
      type: 'presencial',
      professorId: '',
    };

    this.subjectOptions = [];
    this.directorioService
      .getSubjects('')
      .pipe(take(1))
      .subscribe((items) => {
        this.subjectOptions = [...(items || [])].sort((a: any, b: any) =>
          `${a?.name || ''}`.localeCompare(`${b?.name || ''}`),
        );
      });

    if (!this.courseTeachers.length) {
      this.loadCourseTeachers();
    }

    this.showCreateCourseModal = true;
    this.isCreatingCourse = false;
  }

  closeCreateCourseModal(): void {
    this.showCreateCourseModal = false;
    this.isCreatingCourse = false;
  }

  async saveNewCourse(): Promise<void> {
    const subjectName = `${this.newCourse.subjectName || ''}`.trim();
    const parallel = `${this.newCourse.parallel || ''}`.trim().toUpperCase();
    const type = `${this.newCourse.type || ''}`.trim().toLowerCase();
    const professorId = `${this.newCourse.professorId || ''}`.trim();

    if (!this.activeCycleId) {
      this.alertaService.mostrarAlerta(
        'error',
        'Ciclo no definido',
        'No existe un ciclo académico activo para crear cursos.',
      );
      return;
    }

    if (!subjectName || !parallel || !type) {
      this.alertaService.mostrarAlerta(
        'error',
        'Campos requeridos',
        'Debes completar asignatura, paralelo y modalidad.',
      );
      return;
    }

    this.isCreatingCourse = true;

    try {
      await this.directorioService.createCourse({
        subjectName,
        parallel,
        type,
        modality: type,
        professorId,
        cycleId: this.activeCycleId,
        cicleId: this.activeCycleId,
      });

      this.alertaService.mostrarAlerta(
        'exito',
        'Curso creado',
        'El curso fue creado correctamente.',
      );

      this.closeCreateCourseModal();
      this.searchCourses();
    } catch (error: any) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        error?.message || 'No se pudo crear el curso.',
      );
    } finally {
      this.isCreatingCourse = false;
    }
  }

  get selectedCoursesCount(): number {
    return this.selectedCourseIds.size;
  }

  get hasSelectedCourses(): boolean {
    return this.selectedCoursesCount > 0;
  }

  private getCourseId(course: any): string {
    return `${course?.id || ''}`.trim();
  }

  private syncSelectedCourseIds(courses: any[]): void {
    if (!this.selectedCourseIds.size) {
      return;
    }

    const visibleIds = new Set(
      (courses || []).map((course) => this.getCourseId(course)).filter(Boolean),
    );

    Array.from(this.selectedCourseIds).forEach((courseId) => {
      if (!visibleIds.has(courseId)) {
        this.selectedCourseIds.delete(courseId);
      }
    });
  }

  allVisibleCoursesSelected(courses: any[]): boolean {
    if (!courses?.length) {
      return false;
    }

    return courses.every((course) =>
      this.selectedCourseIds.has(this.getCourseId(course)),
    );
  }

  toggleSelectCourse(course: any, checked: boolean): void {
    const courseId = this.getCourseId(course);

    if (!courseId) {
      return;
    }

    if (checked) {
      this.selectedCourseIds.add(courseId);
      return;
    }

    this.selectedCourseIds.delete(courseId);
  }

  isCourseSelected(course: any): boolean {
    return this.selectedCourseIds.has(this.getCourseId(course));
  }

  toggleSelectAllVisibleCourses(courses: any[], checked: boolean): void {
    (courses || []).forEach((course) => {
      const courseId = this.getCourseId(course);
      if (!courseId) {
        return;
      }

      if (checked) {
        this.selectedCourseIds.add(courseId);
      } else {
        this.selectedCourseIds.delete(courseId);
      }
    });
  }

  async deactivateSelectedCourses(): Promise<void> {
    const courseIds = Array.from(this.selectedCourseIds);

    if (!courseIds.length) {
      this.alertaService.mostrarAlerta(
        'info',
        'Sin selección',
        'Selecciona al menos un curso para desactivar.',
      );
      return;
    }

    const confirmed = window.confirm(
      `Se desactivarán ${courseIds.length} curso(s). ¿Deseas continuar?`,
    );

    if (!confirmed) {
      return;
    }

    this.isDeactivatingCourses = true;

    try {
      await this.directorioService.deactivateCourses(courseIds);
      this.selectedCourseIds.clear();
      this.alertaService.mostrarAlerta(
        'exito',
        'Cursos desactivados',
        `${courseIds.length} curso(s) fueron desactivados correctamente.`,
      );
      this.searchCourses();
    } catch (error) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        'No se pudieron desactivar los cursos seleccionados.',
      );
      console.error('Error al desactivar cursos:', error);
    } finally {
      this.isDeactivatingCourses = false;
    }
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

  async deactivateCourse(course: any): Promise<void> {
    const courseId = `${course?.id || ''}`.trim();

    if (!courseId) {
      return;
    }

    const confirmed = window.confirm(
      `¿Deseas desactivar el curso ${course?.subjectName || 'seleccionado'}?`,
    );

    if (!confirmed) {
      return;
    }

    this.isDeactivatingCourses = true;

    try {
      await this.directorioService.deactivateCourses([courseId]);
      this.selectedCourseIds.delete(courseId);
      this.alertaService.mostrarAlerta(
        'exito',
        'Curso desactivado',
        'El curso ya no aparecerá en los listados activos.',
      );
      this.searchCourses();
    } catch (error) {
      this.alertaService.mostrarAlerta(
        'error',
        'Error',
        'No se pudo desactivar el curso.',
      );
      console.error('Error al desactivar curso:', error);
    } finally {
      this.isDeactivatingCourses = false;
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

  normalizeRole(role: any): string {
    const value = `${role || ''}`.toLowerCase().trim();
    return this.roleTypes.includes(value) ? value : 'sin_rol';
  }

  private normalizeStatus(status: any): string {
    const value = `${status || ''}`.toLowerCase().trim();

    if (value === 'not registered' || value === 'not_registered') {
      return 'no registered';
    }

    if (
      value === 'inactive' ||
      value === 'disabled' ||
      value === 'deactivated'
    ) {
      return 'disabled';
    }

    return value;
  }

  private isAuthorizedActive(user: any): boolean {
    return (
      user?.isActive === true &&
      this.normalizeStatus(user?.status) !== 'disabled'
    );
  }

  private buildAuthorizedSaveMessage(
    report: { created: number; reactivated: number; skipped: any[] },
    mode: 'manual' | 'bulk',
  ): string {
    const labels: string[] = [];

    if (report.created > 0) {
      labels.push(
        `${report.created} ${report.created === 1 ? 'usuario creado' : 'usuarios creados'}`,
      );
    }

    if (report.reactivated > 0) {
      labels.push(
        `${report.reactivated} ${report.reactivated === 1 ? 'usuario reactivado' : 'usuarios reactivados'}`,
      );
    }

    const summary =
      labels.length > 0
        ? `Éxito: ${labels.join(' y ')}.`
        : mode === 'manual'
          ? 'No se realizaron cambios.'
          : 'No se realizaron cambios.';

    if (!report.skipped.length) {
      return summary;
    }

    const skippedLines = report.skipped.map((issue) => {
      const rowPrefix = issue.row ? `Fila ${issue.row}: ` : '';

      if (issue.reason === 'duplicate_email') {
        return `${rowPrefix}el correo ${issue.email} ya existe.`;
      }

      if (issue.reason === 'duplicate_cedula') {
        return `${rowPrefix}la cédula ${issue.cedula || 'n/d'} ya existe.`;
      }

      if (issue.reason === 'duplicate_in_file_email') {
        return `${rowPrefix}el correo ${issue.email} está repetido en el archivo.`;
      }

      if (issue.reason === 'duplicate_in_file_cedula') {
        return `${rowPrefix}la cédula ${issue.cedula || 'n/d'} está repetida en el archivo.`;
      }

      return `${rowPrefix}faltan datos obligatorios.`;
    });

    const skippedTitle =
      report.created > 0 || report.reactivated > 0
        ? 'Observaciones:'
        : 'No se pudieron guardar registros:';

    return [summary, skippedTitle, ...skippedLines].join('\n');
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
