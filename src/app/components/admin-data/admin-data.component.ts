import { Component, OnInit } from '@angular/core';
import { ConsultasService } from '../../services/consultas.service';
import { LoginService } from '../../services/login.service';
import { EmailService } from '../../services/email.service';
import { formatDate } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { AlertaService } from '../../services/alert.service';

@Component({
  selector: 'app-admin-data',
  templateUrl: './admin-data.component.html',
  styleUrls: ['./admin-data.component.css'],
})
export class AdminDataComponent implements OnInit {
  currentDate: string;
  director: any = {};
  usuarioActual: any = {};
  esSecretario: boolean = false;

  tesisId: string | null = null;
  directorName: string = '';
  selectedDateTime: string = '';
  fechaEnvioDirector: string | null = null;

  avanceDirectorAlCien: boolean = false;

  // Guardar estados de cada recuadro
  recuadros: any = {
    docente: { correo: '', pdfFile: null, fechaEnvio: null },
    director: { correo: '', pdfFile: null, fechaEnvio: null },
    equipoEvaluador: { correo: '', pdfFile: null, fechaEnvio: null },
    aprobacionDirector: { pdfFile: null, fechaEnvio: null },
    aprobacionEquipo: { correo: '', pdfFile: null, fechaEnvio: null },
    areaGraduacion: { correo: '', pdfFile: null, fechaEnvio: null },
    notificacionGrado: { pdfFile: null, fechaEnvio: null },
    expedienteGraduacion: { pdfFile: null, fechaEnvio: null },
  };

  professors: any[] = [];
  selectedDirector: any = null;
  selectedEvaluator: any = null;
  directorsList: any[] = [];
  evaluatorsList: any[] = [];
  private tesisDataCache: any = null;

  compareUsers = (a: any, b: any): boolean => {
    if (!a || !b) return a === b;
    const idA = `${a.id || ''}`.trim();
    const idB = `${b.id || ''}`.trim();
    if (idA && idB) return idA === idB;

    const emailA = `${a.email || ''}`.trim().toLowerCase();
    const emailB = `${b.email || ''}`.trim().toLowerCase();
    return !!emailA && emailA === emailB;
  };

  constructor(
    private consultasService: ConsultasService,
    private loginService: LoginService,
    private emailService: EmailService,
    private firestore: AngularFirestore,
    private storage: AngularFireStorage,
    private route: ActivatedRoute,
    private alertaService: AlertaService,
  ) {
    this.currentDate = formatDate(new Date(), 'yyyy-MM-dd', 'en');
  }

  ngOnInit() {
    this.loadAllProfessors();
    this.consultasService.getUserByRole('director').subscribe((list) => {
      this.directorsList = list;
      this.syncSelectedAssignments();
    });

    // Cargar evaluadores
    this.consultasService.getUserByRole('evaluador').subscribe((list) => {
      this.evaluatorsList = list;
      this.syncSelectedAssignments();
    });
    this.route.queryParams.subscribe((params) => {
      this.tesisId = params['tesisId'];
      if (this.tesisId) {
        this.loadTesisData();
        this.verificarAvanceDirector();
      }
    });

    this.loginService.getCurrentUser().subscribe((user) => {
      this.usuarioActual = user;
      this.esSecretario = user?.role === 'secretario';
    });
  }
  loadAllProfessors() {
    // Obtenemos todos los usuarios para el dropdown
    this.consultasService.getUserByRole('director').subscribe((directors) => {
      this.consultasService
        .getUserByRole('evaluador')
        .subscribe((evaluators) => {
          // Combinamos ambos para que el secretario tenga la lista completa
          this.professors = [...directors, ...evaluators];
        });
    });
  }
  // Método que se dispara al cambiar el Dropdown
  async onManualAssignmentChange(role: 'director' | 'evaluador') {
    const selectedProfessor =
      role === 'director' ? this.selectedDirector : this.selectedEvaluator;

    if (selectedProfessor && this.tesisId) {
      try {
        await this.consultasService.updateManualAssignment(
          this.tesisId,
          selectedProfessor,
          role,
        );
        this.alertaService.mostrarAlerta(
          'exito',
          'Asignación Actualizada',
          `Se ha asignado a ${selectedProfessor.firstName} correctamente.`,
        );

        if (role === 'director') {
          this.directorName = `${selectedProfessor.firstName} ${selectedProfessor.lastName}`;
          this.recuadros.director.correo = selectedProfessor.email || '';
          this.director = selectedProfessor;
          if (this.tesisDataCache) {
            this.tesisDataCache.directorId = selectedProfessor.id;
          }
        } else {
          this.recuadros.equipoEvaluador.correo = selectedProfessor.email || '';
          if (this.tesisDataCache) {
            this.tesisDataCache.evaluationTeam = [{ id: selectedProfessor.id }];
          }
        }
      } catch (error) {
        this.alertaService.mostrarAlerta(
          'error',
          'Error',
          'No se pudo actualizar la asignación.',
        );
      }
    }
  }

  loadTesisData() {
    this.firestore
      .collection('tesis')
      .doc(this.tesisId!)
      .valueChanges()
      .subscribe((data: any) => {
        if (data) {
          this.tesisDataCache = data;
          console.log('Datos de tesis obtenidos:', data);
          this.recuadros.director.correo = data.directorEmail || '';
          this.director = { email: data.directorEmail || '' };
          this.directorName = data.directorName || 'Nombre no disponible';
          this.recuadros.docente.correo = data.professorEmail || '';
          this.recuadros.equipoEvaluador.correo =
            data.evaluatorEmail || data.evaluationTeam?.[0]?.email || '';
          this.recuadros.aprobacionDirector.fechaEnvio =
            data.rubrica.fechaActualizacion;
          this.syncSelectedAssignments();
        }
      });
  }

  private syncSelectedAssignments() {
    if (!this.tesisDataCache) {
      return;
    }

    const directorId = `${this.tesisDataCache.directorId || ''}`.trim();
    const directorEmail =
      `${this.tesisDataCache.directorEmail || this.recuadros.director.correo || ''}`
        .trim()
        .toLowerCase();
    if (directorId && this.directorsList.length > 0) {
      this.selectedDirector =
        this.directorsList.find((prof) => prof.id === directorId) || null;
    } else if (directorEmail && this.directorsList.length > 0) {
      this.selectedDirector =
        this.directorsList.find(
          (prof) =>
            `${prof.email || ''}`.trim().toLowerCase() === directorEmail,
        ) || null;
    }

    const evaluadorId =
      `${this.tesisDataCache.evaluationTeam?.[0]?.id || ''}`.trim();
    const evaluadorEmail = `${
      this.tesisDataCache.evaluatorEmail ||
      this.tesisDataCache.evaluationTeam?.[0]?.email ||
      this.recuadros.equipoEvaluador.correo ||
      ''
    }`
      .trim()
      .toLowerCase();
    if (evaluadorId && this.evaluatorsList.length > 0) {
      this.selectedEvaluator =
        this.evaluatorsList.find((prof) => prof.id === evaluadorId) || null;
    } else if (evaluadorEmail && this.evaluatorsList.length > 0) {
      this.selectedEvaluator =
        this.evaluatorsList.find(
          (prof) =>
            `${prof.email || ''}`.trim().toLowerCase() === evaluadorEmail,
        ) || null;
    }
  }

  onFileSelected(event: any, recuadro: any) {
    const file: File = event.target.files[0];
    if (file) {
      // Guardamos el objeto File real, no el string Base64 todavía
      recuadro.pdfFile = file;
      console.log('Archivo seleccionado:', file.name);
    }
  }

  sendEmail(recuadro: any) {
    if (recuadro.correo && recuadro.pdfFile) {
      this.emailService
        .sendEmailWithAttachment(recuadro.correo, recuadro.pdfFile)
        .then(() => {
          recuadro.fechaEnvio = this.currentDate;
          alert('Correo enviado con éxito.');
        })
        .catch((error) => {
          console.error('Error al enviar el correo:', error);
          alert('Hubo un problema al enviar el correo.');
        });
    } else {
      alert('Por favor, complete todos los campos.');
    }
  }

  sendToDirector() {
    if (this.selectedDateTime) {
      const message = `El grado se realizará el ${this.selectedDateTime}.`;
      const directorEmail =
        this.selectedDirector?.email || this.recuadros.director.correo || '';

      if (!directorEmail) {
        this.alertaService.mostrarAlerta(
          'error',
          'Correo no disponible',
          'No existe un correo de director para enviar la notificación.',
        );
        return;
      }

      this.emailService
        .sendEmail(directorEmail, message)
        .then(() => {
          this.fechaEnvioDirector = this.currentDate;
          alert('Correo enviado al director con éxito.');
        })
        .catch((error) => {
          console.error('Error al enviar el correo al director:', error);
          alert('Hubo un problema al enviar el correo.');
        });
    } else {
      alert('Por favor, seleccione una fecha y hora.');
    }
  }

  verificarAvanceDirector() {
    this.firestore
      .collection('tesis')
      .doc(this.tesisId!)
      .collection('flujo', (ref) => ref.where('rol', '==', 'director'))
      .get()
      .subscribe((querySnap) => {
        if (querySnap.empty) {
          this.avanceDirectorAlCien = false;
          return;
        }

        const evidencias = querySnap.docs.map((doc) => doc.data() as any);
        const evidenciaMasReciente = evidencias.reduce((a, b) =>
          new Date(a.fechaRegistro) > new Date(b.fechaRegistro) ? a : b,
        );

        this.avanceDirectorAlCien = evidenciaMasReciente.porcentaje === 100;
      });
  }
}
