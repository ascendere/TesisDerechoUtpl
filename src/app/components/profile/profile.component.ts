import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ConsultasService } from '../../services/consultas.service';
import { AlertaService } from '../../services/alert.service';
import { forkJoin, of } from 'rxjs';
import { take, switchMap, map } from 'rxjs/operators';
@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
})
export class ProfileComponent implements OnInit {
  professorPhoto: string = '';
  professorName: string = '';
  presentacion: string = '';
  subjectDescription: string = '';
  studentName: string = '';
  status: string = '';
  currentQuestionIndex: number = 0;
  questionsSubject: String[] = [];
  questions: string[] = ['¿Pregunta 1?', '¿Pregunta 2?', '¿Pregunta 3?'];
  buttonText: string = 'Siguiente';
  currentAnswer: string = ''; // Para almacenar la respuesta actual
  tesisId: string = ''; // Guardar el ID de la tesis

  constructor(
    private route: ActivatedRoute,
    private consultasService: ConsultasService,
    private router: Router,
    private alertaService: AlertaService,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      this.tesisId = params['tesisId']; // Guardar el ID de la tesis
      if (this.tesisId) {
        console.log('Tesis ID recibido:', this.tesisId);
        this.loadTesisDetails(this.tesisId);
      }
    });
  }

  loadTesisDetails(tesisId: string): void {
    this.consultasService
      .getTesisById(tesisId)
      .pipe(
        take(1), // Importante para reducir lecturas innecesarias
        switchMap((tesisData) => {
          if (!tesisData || !tesisData.classId) {
            throw new Error('No se encontró la clase vinculada a esta tesis.');
          }
          this.studentName = tesisData.studentName;
          this.status = tesisData.status;

          // PASO 1: Con el classId de la tesis, obtenemos los datos de la Clase
          return this.consultasService
            .getClassByIdForProfile(tesisData.classId)
            .pipe(
              take(1),
              map((classData) => ({ tesisData, classData })),
            );
        }),
        switchMap(({ tesisData, classData }) => {
          if (!classData)
            throw new Error('Información de la clase no disponible.');

          // PASO 2: Ahora tenemos subjectId y professorId. Hacemos consultas paralelas
          return forkJoin({
            subject: this.consultasService
              .getSubjectById(classData.subjectId)
              .pipe(take(1)),
            professor: this.consultasService
              .getUserById(classData.professorId)
              .pipe(take(1)),
          });
        }),
      )
      .subscribe({
        next: (data) => {
          if (data.subject) {
            // Asignamos descripción y nombre de la materia
            this.subjectDescription = `${data.subject.name}: ${data.subject.description}`;
            console.log(data.subject);
            this.questionsSubject = data.subject.questions || this.questions;
            console.log(this.questionsSubject);
          }
          console.log(data);
          if (data.professor) {
            // Asignamos nombre, título y descripción del profesor
            const titulo = data.professor.degree || 'Abg';
            const presentacion = data.professor.description || '';
            console.log(titulo);
            this.professorName = `${titulo}. ${data.professor.firstName} ${data.professor.lastName}`;
            this.presentacion = presentacion;
            this.professorPhoto = data.professor.photoURL || '';
          }
        },
        error: (err) => {
          console.error('Error al cargar detalles:', err);
          this.alertaService.mostrarAlerta(
            'error',
            'Error',
            'No se pudo cargar la información completa del perfil.',
          );
        },
      });
  }

  saveAnswer(): void {
    // Crear el nombre del campo de respuesta dinámico (ej. question1, question2)
    const answerField = `question${this.currentQuestionIndex + 1}`;

    // Guardar la respuesta en la base de datos
    const updateData = {
      [answerField]: this.currentAnswer, // Dinámicamente guarda cada respuesta
    };

    this.consultasService.updateTesis(this.tesisId, updateData).subscribe({
      next: () => {
        console.log(
          `Respuesta guardada en ${answerField}:`,
          this.currentAnswer,
        );
        this.alertaService.mostrarAlerta(
          'exito',
          'Respuesta guardada',
          `Tu respuesta a la pregunta ${this.currentQuestionIndex + 1} ha sido registrada correctamente.`,
        );

        this.currentAnswer = ''; // Limpiar el campo de respuesta
      },
      error: (error) => {
        console.error('Error al guardar la respuesta:', error);
        this.alertaService.mostrarAlerta(
          'error',
          'Error al guardar',
          'Ocurrió un problema al guardar tu respuesta. Intenta nuevamente.',
        );
      },
    });
  }

  nextQuestion(): void {
    // Guardar la respuesta antes de avanzar a la siguiente pregunta
    if (!this.currentAnswer.trim()) {
      this.alertaService.mostrarAlerta(
        'error',
        'Respuesta requerida',
        'Por favor, responde la pregunta antes de continuar.',
      );
      return;
    }
    this.saveAnswer();

    if (this.currentQuestionIndex < this.questionsSubject.length - 1) {
      this.currentQuestionIndex++;
    } else {
      this.buttonText = 'Finalizar';
      this.alertaService.mostrarAlerta(
        'exito',
        'Encuesta completada',
        'Gracias por responder. Serás redirigido al seguimiento.',
      );
      // Al finalizar, redirigir al componente /personal con el ID de la tesis
      setTimeout(() => {
        if (this.status !== 'Faltante') {
          this.router.navigate(['/info']);
        } else {
          this.router.navigate(['/personal'], {
            queryParams: { tesisId: this.tesisId },
          });
        }
      }, 1500);
    }
  }
}
