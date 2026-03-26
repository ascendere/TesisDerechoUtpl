import { Component, OnInit } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { LoginService } from '../../services/login.service'; // Importa el LoginService
import User from '../../interfaces/user.interface';
import { Observable } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { AlertaService } from '../../services/alert.service';
import { ConsultasService } from '../../services/consultas.service';

@Component({
  selector: 'app-flujo',
  templateUrl: './flujo.component.html',
  styleUrls: ['./flujo.component.css'],
})
export class FlujoComponent implements OnInit {
  evidencias: any[] = []; // Lista de evidencias que se mostrarán en la tabla
  mostrarDialogoAgregar: boolean = false; // Controla la visualización del modal
  usuarioLoggeado: User | null = null; // Información del usuario loggeado
  form: any = {}; // Formulario para agregar evidencias
  documento: File | null = null; // Archivo seleccionado para subir
  mostrarDialogoReunion: boolean = false; // Controla el modal de reuniones
  reunionForm: any = {}; // Formulario para la reunión
  reuniones: any[] = []; // ← Agregar esta línea
  fechaRegistroReunion: string | null = null;
  documentoReunion: File | null = null; // Archivo seleccionado para la reunión
  ultimoPorcentajeEstudiante: number = 0;
  ultimoPorcentajeDirector: number = 0;
  activeCycleId: string = '';
  activeCycleName: string = '';

  tesisId: string | null = null;

  isUploading: boolean = false;

  puedeGestionarEvidenciasYReuniones(): boolean {
    return (
      this.usuarioLoggeado?.role === 'director' ||
      this.usuarioLoggeado?.role === 'estudiante'
    );
  }

  // Tipos de evidencia disponibles
  tiposEvidencia: string[] = [
    'Preliminares',
    'Resumen',
    'Introducción',
    'Cap. I: Revisión / Marco teórico',
    'Cap. II: Metodología',
    'Cap. III: Resultados y discusión',
    'Conclusiones y Recomendaciones',
    'Referencias',
  ];
  constructor(
    private firestore: AngularFirestore,
    private storage: AngularFireStorage,
    private loginService: LoginService,
    private consultasService: ConsultasService,
    private route: ActivatedRoute, // Inyecta el LoginService
    private alertaService: AlertaService,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      this.tesisId = params['tesisId'];
      console.log('Tesis ID:', this.tesisId);

      if (this.tesisId) {
        // Verificación para evitar el uso de null
        this.loadActiveCycle();
        // Obtener el usuario loggeado al inicializar el componente
        this.loginService.getCurrentUser().subscribe((user) => {
          if (user) {
            this.usuarioLoggeado = user; // Almacena los datos del usuario loggeado
            this.cargarEvidencias(); // Cargar evidencias relacionadas al usuario
            this.cargarReuniones();
          } else {
            console.log('No hay usuario loggeado.');
          }
        });
      } else {
        console.error('No se encontró el ID de la tesis.');
      }
    });
  }

  private loadActiveCycle(): void {
    this.consultasService
      .getActiveCycle()
      .pipe()
      .subscribe({
        next: (cycle) => {
          this.activeCycleId = cycle?.id || '';
          this.activeCycleName = cycle?.name || '';
        },
        error: (error) => {
          this.activeCycleId = '';
          this.activeCycleName = '';
          console.error('Error al cargar ciclo activo:', error);
        },
      });
  }

  cargarEvidencias() {
    if (this.usuarioLoggeado && this.tesisId) {
      this.firestore
        .collection('tesis')
        .doc(this.tesisId)
        .collection('flujo')
        .valueChanges()
        .subscribe(
          (data: any[]) => {
            this.evidencias = data;
            console.log('Evidencias cargadas:', this.evidencias);
            this.obtenerUltimosPorcentajes(); // Asegurar que se recalculan los porcentajes
          },
          (error) => console.error('Error al cargar evidencias:', error),
        );
    }
  }

  obtenerUltimosPorcentajes() {
    if (!this.evidencias || this.evidencias.length === 0) {
      console.log('⚠️ No hay evidencias registradas.');
      this.ultimoPorcentajeEstudiante = 0;
      this.ultimoPorcentajeDirector = 0;
      return;
    }

    console.log('🔎 Filtrando evidencias...');

    // Filtrar evidencias de estudiantes
    const evidenciasEstudiante = this.evidencias.filter(
      (e) => e.rol === 'estudiante' && e.porcentaje != null,
    );
    this.ultimoPorcentajeEstudiante = evidenciasEstudiante.length
      ? Math.max(...evidenciasEstudiante.map((e) => Number(e.porcentaje) || 0))
      : 0;

    console.log(
      '🎓 Último porcentaje estudiante:',
      this.ultimoPorcentajeEstudiante,
    );

    // Filtrar evidencias de directores
    const evidenciasDirector = this.evidencias.filter(
      (e) => e.rol === 'director' && e.porcentaje != null,
    );
    this.ultimoPorcentajeDirector = evidenciasDirector.length
      ? Math.max(...evidenciasDirector.map((e) => Number(e.porcentaje) || 0))
      : 0;

    console.log(
      '📋 Último porcentaje director:',
      this.ultimoPorcentajeDirector,
    );
  }

  // Abre el modal para agregar nueva evidencia
  openAddDialog() {
    if (!this.puedeGestionarEvidenciasYReuniones()) {
      this.alertaService.mostrarAlerta(
        'error',
        'Permiso denegado',
        'Solo estudiantes y directores pueden agregar evidencias.',
      );
      return;
    }

    if (!this.activeCycleId) {
      this.alertaService.mostrarAlerta(
        'error',
        'Sin ciclo activo',
        'No existe un ciclo académico activo (estatus=true).',
      );
      return;
    }

    this.mostrarDialogoAgregar = true;
    this.form.fechaRegistro = new Date().toISOString().split('T')[0]; // Asigna la fecha actual en formato YYYY-MM-DD
    this.form.porcentaje = this.obtenerMinimoPorcentaje();
  }

  obtenerUltimoPorcentajeRolActual(): number {
    if (!this.usuarioLoggeado) {
      return 0;
    }

    return this.usuarioLoggeado.role === 'director'
      ? this.ultimoPorcentajeDirector
      : this.ultimoPorcentajeEstudiante;
  }

  obtenerMinimoPorcentaje(): number {
    const ultimoPorcentaje = this.obtenerUltimoPorcentajeRolActual();
    return ultimoPorcentaje >= 100 ? 100 : ultimoPorcentaje + 1;
  }

  puedeEditarPorcentaje(): boolean {
    return this.obtenerUltimoPorcentajeRolActual() < 100;
  }

  onPorcentajeKeydown(event: KeyboardEvent): void {
    if (!this.puedeEditarPorcentaje()) {
      return;
    }

    const teclasPermitidas = [
      'Backspace',
      'Delete',
      'Tab',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
    ];

    if (teclasPermitidas.includes(event.key)) {
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())
    ) {
      return;
    }

    if (!/^\d$/.test(event.key)) {
      event.preventDefault();
    }
  }

  onPorcentajeInput(event: Event): void {
    if (!this.puedeEditarPorcentaje()) {
      this.form.porcentaje = 100;
      return;
    }

    const input = event.target as HTMLInputElement;
    const soloDigitos = `${input.value || ''}`.replace(/\D/g, '');

    if (!soloDigitos) {
      this.form.porcentaje = null;
      return;
    }

    const valor = Math.min(100, Number(soloDigitos));
    this.form.porcentaje = Number.isNaN(valor) ? null : valor;
    input.value = this.form.porcentaje == null ? '' : `${this.form.porcentaje}`;
  }

  // Descargar la matriz de categorías
  descargarMatrizCategorias() {
    const url =
      'https://firebasestorage.googleapis.com/v0/b/tesisderechoutpl.appspot.com/o/PlantillaUpload%2FMatriz_categorias_para_un_proyecto_de_investigacion.docx?alt=media&token=c445f564-cfd2-4488-a1ce-5fbb1ed595a8';
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.download = 'Matriz_categorias_para_un_proyecto_de_investigacion.docx';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Cierra el modal sin guardar datos
  cerrarDialogo() {
    this.mostrarDialogoAgregar = false;
    this.form = {}; // Resetea el formulario
    this.documento = null; // Resetea el archivo
  }

  // Captura el archivo seleccionado
  onFileSelected(event: any) {
    this.documento = event.target.files[0];
    console.log('Archivo seleccionado exitosamente:', this.documento);
  }

  // Método para enviar el formulario de agregar nueva evidencia
  submit() {
    if (this.isUploading) return; // Evita múltiples envíos simultáneos

    if (!this.puedeGestionarEvidenciasYReuniones()) {
      this.alertaService.mostrarAlerta(
        'error',
        'Permiso denegado',
        'Solo estudiantes y directores pueden crear evidencias.',
      );
      return;
    }

    if (!this.activeCycleId) {
      this.alertaService.mostrarAlerta(
        'error',
        'Sin ciclo activo',
        'No existe un ciclo académico activo para registrar evidencias.',
      );
      return;
    }

    if (!this.documento || !this.tesisId || !this.usuarioLoggeado) {
      this.alertaService.mostrarAlerta(
        'error',
        'Campos incompletos',
        'Debes seleccionar un archivo y tener sesión iniciada para continuar.',
      );
      return;
    }
    if (
      !this.form.fechaRegistro ||
      !this.form.bimestre ||
      !this.form.tipoEvidencia ||
      !this.form.subcategoria ||
      this.form.porcentaje == null
    ) {
      this.alertaService.mostrarAlerta(
        'error',
        'Campos incompletos',
        'Por favor, completa todos los campos del formulario.',
      );
      return;
    }
    this.isUploading = true;

    const esEstudiante = this.usuarioLoggeado.role === 'estudiante';
    const esDirector = this.usuarioLoggeado.role === 'director';
    const porcentajeIngresado = Number(this.form.porcentaje);
    const ultimoPorcentajeActual = esDirector
      ? this.ultimoPorcentajeDirector
      : this.ultimoPorcentajeEstudiante;

    if (Number.isNaN(porcentajeIngresado)) {
      this.isUploading = false;
      this.alertaService.mostrarAlerta(
        'error',
        'Porcentaje inválido',
        'Ingresa un porcentaje válido para continuar.',
      );
      return;
    }

    if (porcentajeIngresado > 100) {
      this.isUploading = false;
      this.alertaService.mostrarAlerta(
        'error',
        'Porcentaje inválido',
        'El porcentaje no puede ser mayor a 100%.',
      );
      return;
    }

    if (ultimoPorcentajeActual >= 100 && porcentajeIngresado !== 100) {
      this.isUploading = false;
      this.alertaService.mostrarAlerta(
        'error',
        'Porcentaje bloqueado',
        'Cuando el avance ya llegó a 100%, las nuevas evidencias deben registrarse con 100%.',
      );
      return;
    }

    if (
      esEstudiante &&
      this.ultimoPorcentajeEstudiante < 100 &&
      porcentajeIngresado <= this.ultimoPorcentajeEstudiante
    ) {
      this.isUploading = false;
      this.alertaService.mostrarAlerta(
        'error',
        `El porcentaje debe ser mayor a ${this.ultimoPorcentajeEstudiante}%`,
        '',
      );
      return;
    }

    if (
      esDirector &&
      this.ultimoPorcentajeDirector < 100 &&
      porcentajeIngresado <= this.ultimoPorcentajeDirector
    ) {
      this.isUploading = false;
      this.alertaService.mostrarAlerta(
        'error',
        'Porcentaje insuficiente',
        `El porcentaje debe ser mayor a ${this.ultimoPorcentajeDirector}%`,
      );
      return;
    }

    const filePath = `flujo/${this.usuarioLoggeado.firstName}_${this.usuarioLoggeado.lastName}/${this.documento.name}`;
    const fileRef = this.storage.ref(filePath);
    const uploadTask = this.storage.upload(filePath, this.documento);

    uploadTask
      .then(() => {
        fileRef.getDownloadURL().subscribe({
          next: (downloadUrl) => {
            const nuevaEvidencia = {
              periodo: this.activeCycleName || 'Sin ciclo activo',
              bimestre: this.form.bimestre,
              tipoEvidencia: this.form.tipoEvidencia,
              subcategoria: this.form.subcategoria,
              fechaRegistro: new Date().toISOString(),
              evidenciaUrl: downloadUrl,
              porcentaje: porcentajeIngresado,
              usuarioNombre: this.usuarioLoggeado?.firstName,
              usuarioApellido: this.usuarioLoggeado?.lastName,
              usuarioId: this.usuarioLoggeado?.id,
              rol: this.usuarioLoggeado?.role,
            };

            this.firestore
              .collection('tesis')
              .doc(this.tesisId!)
              .collection('flujo')
              .add(nuevaEvidencia)
              .then(() => {
                if (esDirector) {
                  if (porcentajeIngresado >= 100) {
                    this.firestore
                      .collection('tesis')
                      .doc(this.tesisId!)
                      .update({ status: 'Completado' });
                  }
                  return this.firestore
                    .collection('tesis')
                    .doc(this.tesisId!)
                    .update({ progress: porcentajeIngresado });
                }
                return Promise.resolve();
              })
              .then(() => {
                this.alertaService.mostrarAlerta(
                  'exito',
                  'Evidencia guardada',
                  'La evidencia fue registrada exitosamente.',
                );
                this.cerrarDialogo();
                this.cargarEvidencias();

                this.isUploading = false;
              })
              .catch((error) => {
                this.isUploading = false;
                this.alertaService.mostrarAlerta(
                  'error',
                  'Error al guardar',
                  'No se pudo registrar la evidencia. Intenta nuevamente.',
                );
                console.error('Error al guardar evidencia:', error);
              });
          },
          error: (err) => {
            this.isUploading = false;
            this.alertaService.mostrarAlerta(
              'error',
              'Error al obtener URL del archivo',
              'Hubo un problema al obtener el enlace del documento subido.',
            );
            console.error('Error al obtener downloadURL:', err);
          },
        });
      })
      .catch((error) => {
        this.isUploading = false;
        this.alertaService.mostrarAlerta(
          'error',
          'Error al subir archivo',
          'No se pudo subir el archivo. Verifica tu conexión o intenta nuevamente.',
        );
        console.error('Error al subir archivo:', error);
      });
  }

  // Abrir el modal de reuniones y asignar la fecha de registro actual
  openReunionDialog() {
    if (!this.puedeGestionarEvidenciasYReuniones()) {
      this.alertaService.mostrarAlerta(
        'error',
        'Permiso denegado',
        'Solo estudiantes y directores pueden registrar reuniones.',
      );
      return;
    }

    if (!this.activeCycleId) {
      this.alertaService.mostrarAlerta(
        'error',
        'Sin ciclo activo',
        'No existe un ciclo académico activo (estatus=true).',
      );
      return;
    }

    this.fechaRegistroReunion = new Date().toISOString();
    this.mostrarDialogoReunion = true;
  }

  cerrarReunionDialog() {
    this.mostrarDialogoReunion = false;
    this.reunionForm = {};
  }

  cargarReuniones() {
    if (this.tesisId) {
      this.firestore
        .collection('tesis')
        .doc(this.tesisId)
        .collection('reuniones')
        .valueChanges({ idField: 'id' }) // Agregar el ID de Firestore
        .subscribe(
          (data: any[]) => {
            this.reuniones = data;
          },
          (error) => {
            this.alertaService.mostrarAlerta(
              'error',
              'Error al cargar reuniones',
              'Ocurrió un problema al intentar obtener las reuniones.',
            );
          },
        );
    }
  }

  actualizarAsistencia(reunion: any) {
    if (
      this.usuarioLoggeado?.firstName + ' ' + this.usuarioLoggeado?.lastName !==
      reunion.autor
    ) {
      this.alertaService.mostrarAlerta(
        'info',
        'Permiso denegado',
        'No tienes autorización para modificar la asistencia de esta reunión.',
      );
      return;
    }

    this.firestore
      .collection('tesis')
      .doc(this.tesisId!)
      .collection('reuniones')
      .doc(reunion.id)
      .update({ asistencia: reunion.asistencia })
      .then(() => console.log('✅ Asistencia actualizada'))
      .catch((error) =>
        this.alertaService.mostrarAlerta(
          'error',
          'Error al actualizar asistencia',
          'No se pudo guardar la asistencia. Intenta nuevamente.',
        ),
      );
  }

  onFileSelectedReunion(event: any) {
    this.documentoReunion = event.target.files[0];
    console.log(
      'Archivo de reunión seleccionado exitosamente:',
      this.documentoReunion,
    );
  }

  // Método para enviar el formulario de reunión
  submitReunion() {
    if (this.isUploading) return; // Evita múltiples envíos simultáneos

    if (!this.puedeGestionarEvidenciasYReuniones()) {
      this.alertaService.mostrarAlerta(
        'error',
        'Permiso denegado',
        'Solo estudiantes y directores pueden registrar reuniones.',
      );
      return;
    }

    if (!this.activeCycleId) {
      this.alertaService.mostrarAlerta(
        'error',
        'Sin ciclo activo',
        'No existe un ciclo académico activo para registrar reuniones.',
      );
      return;
    }

    this.isUploading = true;
    if (!this.tesisId) {
      this.isUploading = false;
      this.alertaService.mostrarAlerta(
        'error',
        'ID de tesis no encontrado',
        'No se encontró un ID válido de tesis para continuar.',
      );
      return;
    }
    if (!this.usuarioLoggeado) {
      this.isUploading = false;
      this.alertaService.mostrarAlerta(
        'error',
        'Sesión no iniciada',
        'Debes iniciar sesión para realizar esta acción.',
      );
      return;
    }
    if (!this.reunionForm.descripcion || !this.reunionForm.fechaReunion) {
      this.isUploading = false;
      this.alertaService.mostrarAlerta(
        'error',
        'Campos incompletos',
        'Por favor, completa todos los campos antes de continuar.',
      );
      return;
    }

    const nuevaReunion = {
      periodo: this.activeCycleName || 'Sin ciclo activo',
      fechaRegistro: this.fechaRegistroReunion,
      fechaReunion: this.reunionForm.fechaReunion,
      descripcion: this.reunionForm.descripcion,
      asistencia: 'Pendiente',
      autor: `${this.usuarioLoggeado.firstName} ${this.usuarioLoggeado.lastName}`,
      evidenciaUrl: '', // Inicialmente vacío
    };

    if (this.documentoReunion) {
      const filePath = `reuniones/${this.usuarioLoggeado.firstName}_${this.usuarioLoggeado.lastName}/${this.documentoReunion.name}`;
      const fileRef = this.storage.ref(filePath);
      const uploadTask = this.storage.upload(filePath, this.documentoReunion);

      uploadTask
        .then(() => {
          fileRef.getDownloadURL().subscribe((downloadUrl) => {
            nuevaReunion.evidenciaUrl = downloadUrl;

            this.firestore
              .collection('tesis')
              .doc(this.tesisId!)
              .collection('reuniones')
              .add(nuevaReunion)
              .then(() => {
                this.alertaService.mostrarAlerta(
                  'exito',
                  'Reunión guardada',
                  'La reunión fue registrada correctamente junto con la evidencia.',
                );
                this.cerrarReunionDialog();
                this.isUploading = false;
                this.cargarReuniones();
              })
              .catch((error) =>
                this.alertaService.mostrarAlerta(
                  'error',
                  'Error al guardar la reunión',
                  'No se pudo guardar la información de la reunión.' + error,
                ),
              );
          });
        })
        .catch((error) =>
          this.alertaService.mostrarAlerta(
            'error',
            'Error al subir archivo',
            'No se pudo subir el archivo. Intenta nuevamente.' + error,
          ),
        );
    } else {
      this.firestore
        .collection('tesis')
        .doc(this.tesisId!)
        .collection('reuniones')
        .add(nuevaReunion)
        .then(() => {
          this.alertaService.mostrarAlerta(
            'exito',
            'Reunión guardada',
            'La reunión fue registrada correctamente sin evidencia.',
          );
          this.cerrarReunionDialog();
          this.cargarReuniones();
          this.isUploading = false;
        })
        .catch((error) =>
          this.alertaService.mostrarAlerta(
            'error',
            'Error al guardar la reunión',
            'Ocurrió un problema al guardar la información. Intenta más tarde.',
          ),
        );
    }
  }
}
