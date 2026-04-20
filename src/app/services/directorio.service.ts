import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { finalize, map, switchMap, take } from 'rxjs/operators';
import { combineLatest, firstValueFrom, Observable, of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DirectorioService {
  constructor(
    private afs: AngularFirestore,
    private storage: AngularFireStorage,
  ) {}

  private isUserActive(user: any): boolean {
    return user?.isActive === true;
  }

  // Obtener materias con filtro opcional por nombre
  getSubjects(searchTerm?: string): Observable<any[]> {
    return this.afs
      .collection('subjects', (ref) => {
        let query = ref.orderBy('name');
        // Filtro para no traer todo si hay una búsqueda activa
        if (searchTerm)
          query = query
            .where('name', '>=', searchTerm)
            .where('name', '<=', searchTerm + '\uf8ff');
        return query;
      })
      .valueChanges({ idField: 'id' });
  }

  async createSubject(payload: {
    name: string;
    description?: string;
  }): Promise<void> {
    const name = `${payload?.name || ''}`.trim();
    const description = `${payload?.description || ''}`.trim();

    if (!name) {
      throw new Error('El nombre de la materia es obligatorio.');
    }

    const duplicated = await this.afs
      .collection('subjects', (ref) => ref.where('name', '==', name))
      .get()
      .toPromise();

    if (duplicated && !duplicated.empty) {
      throw new Error('Ya existe una materia registrada con ese nombre.');
    }

    await this.afs.collection('subjects').add({
      name,
      description,
      questions: [],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // Obtener solo usuarios con rol docente
  getTeachers(searchTerm?: string): Observable<any[]> {
    return this.afs
      .collection('users', (ref) =>
        ref.where('role', '==', 'docente').where('isActive', '==', true),
      )
      .snapshotChanges()
      .pipe(
        map((actions) =>
          actions.map((action) => ({
            id: action.payload.doc.id,
            ...(action.payload.doc.data() as any),
          })),
        ),
        map((users: any[]) => {
          const term = `${searchTerm || ''}`.toLowerCase().trim();

          let teachers = (users || []).filter((user: any) => {
            const role = `${user?.role || ''}`.toLowerCase().trim();
            return role === 'docente' && this.isUserActive(user);
          });

          if (term) {
            teachers = teachers.filter((teacher: any) => {
              const lastName =
                `${teacher?.lastName || teacher?.apellido || ''}`.toLowerCase();
              return lastName.includes(term);
            });
          }

          return teachers;
        }),
      );
  }

  // Obtener docentes elegibles para asignación de cursos (sin depender de description)
  getTeachersForCourseSelection(searchTerm?: string): Observable<any[]> {
    return this.afs
      .collection('users', (ref) =>
        ref.where('role', '==', 'docente').where('isActive', '==', true),
      )
      .snapshotChanges()
      .pipe(
        map((actions) =>
          actions.map((action) => ({
            id: action.payload.doc.id,
            ...(action.payload.doc.data() as any),
          })),
        ),
        map((users: any[]) => {
          const term = `${searchTerm || ''}`.toLowerCase().trim();

          let teachers = (users || []).filter((user: any) => {
            const role = `${user?.role || ''}`.toLowerCase().trim();
            return role === 'docente' && !!user?.id && this.isUserActive(user);
          });

          if (term) {
            teachers = teachers.filter((teacher: any) => {
              const firstName =
                `${teacher?.firstName || teacher?.nombre || ''}`.toLowerCase();
              const lastName =
                `${teacher?.lastName || teacher?.apellido || ''}`.toLowerCase();
              const email = `${teacher?.email || ''}`.toLowerCase();

              return (
                firstName.includes(term) ||
                lastName.includes(term) ||
                email.includes(term)
              );
            });
          }

          return teachers.sort((a: any, b: any) => {
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
        }),
      );
  }

  // Obtener usuarios autorizados para secretaría
  getAuthorizedUsers(): Observable<any[]> {
    return this.afs
      .collection('authorized', (ref) => ref.where('isActive', '==', true))
      .valueChanges({ idField: 'id' });
  }

  async deactivateAuthorizedUsers(emails: string[]): Promise<void> {
    const normalizedEmails = Array.from(
      new Set(
        (emails || [])
          .map((email) => `${email || ''}`.toLowerCase().trim())
          .filter((email) => !!email),
      ),
    );

    if (!normalizedEmails.length) {
      return;
    }

    const userDocsByEmail = await Promise.all(
      normalizedEmails.map(async (email) => {
        const snapshot = await this.afs
          .collection('users', (ref) => ref.where('email', '==', email))
          .get()
          .toPromise();

        return {
          email,
          docs: snapshot?.docs || [],
        };
      }),
    );

    const batch = this.afs.firestore.batch();

    normalizedEmails.forEach((email) => {
      const ref = this.afs.collection('authorized').doc(email).ref;
      batch.set(
        ref,
        {
          isActive: false,
          status: 'disabled',
          updatedAt: new Date(),
        },
        { merge: true },
      );
    });

    userDocsByEmail.forEach(({ docs }) => {
      docs.forEach((doc) => {
        batch.set(
          doc.ref,
          {
            isActive: false,
            updatedAt: new Date(),
          },
          { merge: true },
        );
      });
    });

    await batch.commit();
  }

  // Obtener ciclo académico activo (estatus === true)
  getActiveCycle(): Observable<any | null> {
    return this.afs
      .collection('cycle')
      .snapshotChanges()
      .pipe(
        map((actions) =>
          actions.map((action) => ({
            id: action.payload.doc.id,
            ...(action.payload.doc.data() as any),
          })),
        ),
        map((cycles: any[]) => {
          return (
            cycles.find((cycle) =>
              this.isCycleActive(cycle?.estatus ?? cycle?.status),
            ) || null
          );
        }),
      );
  }

  // Obtener cursos (clases) enriquecidos con docente y ciclo
  getCourses(searchTerm?: string): Observable<any[]> {
    return this.afs
      .collection('classes', (ref) => ref.where('isActive', '==', true))
      .snapshotChanges()
      .pipe(
        map((actions) =>
          actions.map((action) => ({
            id: action.payload.doc.id,
            ...(action.payload.doc.data() as any),
          })),
        ),
        switchMap((courses: any[]) => {
          if (!courses.length) {
            return of([]);
          }

          const coursesWithRelations$ = courses.map((course) =>
            combineLatest([
              this.getUserById(course.professorId),
              this.getCycleById(course.cycleId || course.cicleId),
            ]).pipe(
              map(([professor, cycle]) => ({
                ...course,
                professorName: professor
                  ? `${professor.firstName || ''} ${professor.lastName || ''}`.trim()
                  : 'Sin docente',
                professorEmail: professor?.email || '',
                cycleName: cycle?.name || 'Sin ciclo',
              })),
            ),
          );

          return combineLatest(coursesWithRelations$).pipe(
            map((enrichedCourses) => {
              const term = `${searchTerm || ''}`.toLowerCase().trim();

              const filteredCourses = !term
                ? enrichedCourses
                : enrichedCourses.filter((course) => {
                    const subjectName =
                      `${course.subjectName || ''}`.toLowerCase();
                    const parallel = `${course.parallel || ''}`.toLowerCase();
                    const type =
                      `${course.type || course.modality || ''}`.toLowerCase();
                    const professorName =
                      `${course.professorName || ''}`.toLowerCase();
                    const cycleName = `${course.cycleName || ''}`.toLowerCase();

                    return (
                      subjectName.includes(term) ||
                      parallel.includes(term) ||
                      type.includes(term) ||
                      professorName.includes(term) ||
                      cycleName.includes(term)
                    );
                  });

              return [...filteredCourses].sort((a, b) =>
                `${a?.subjectName || ''}`.localeCompare(
                  `${b?.subjectName || ''}`,
                ),
              );
            }),
          );
        }),
      );
  }

  async createCourse(payload: {
    subjectName: string;
    parallel: string;
    type: string;
    modality?: string;
    professorId?: string;
    cycleId: string;
    cicleId?: string;
  }): Promise<void> {
    const subjectName = `${payload?.subjectName || ''}`.trim();
    const parallel = `${payload?.parallel || ''}`.trim().toUpperCase();
    const type = `${payload?.type || ''}`.trim().toLowerCase();
    const modality = `${payload?.modality || type || ''}`.trim().toLowerCase();
    const professorId = `${payload?.professorId || ''}`.trim();
    const cycleId = `${payload?.cycleId || ''}`.trim();
    const cicleId = `${payload?.cicleId || cycleId}`.trim();

    if (!subjectName || !parallel || !type || !cycleId) {
      throw new Error('Faltan datos obligatorios para crear el curso.');
    }

    const duplicated = await this.afs
      .collection('classes', (ref) =>
        ref
          .where('subjectName', '==', subjectName)
          .where('parallel', '==', parallel)
          .where('cycleId', '==', cycleId)
          .where('isActive', '==', true),
      )
      .get()
      .toPromise();

    if (duplicated && !duplicated.empty) {
      throw new Error(
        'Ya existe un curso activo para esa materia, paralelo y ciclo.',
      );
    }

    await this.afs.collection('classes').add({
      subjectName,
      parallel,
      type,
      modality,
      professorId,
      cycleId,
      cicleId,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async deactivateCourse(courseId: string): Promise<void> {
    await this.deactivateCourses([courseId]);
  }

  async deactivateCourses(courseIds: string[]): Promise<void> {
    const normalizedCourseIds = Array.from(
      new Set(
        (courseIds || [])
          .map((courseId) => `${courseId || ''}`.trim())
          .filter(Boolean),
      ),
    );

    if (!normalizedCourseIds.length) {
      return;
    }

    const batch = this.afs.firestore.batch();

    normalizedCourseIds.forEach((courseId) => {
      const classRef = this.afs.collection('classes').doc(courseId).ref;
      batch.set(
        classRef,
        {
          isActive: false,
          updatedAt: new Date(),
        },
        { merge: true },
      );
    });

    await batch.commit();
  }

  // Lógica de actualización genérica para cualquier campo
  updateRecord(collection: string, id: string, data: any) {
    return this.afs
      .collection(collection)
      .doc(id)
      .update({
        ...data,
        updatedAt: new Date(), // Sincronizado con tus capturas
      });
  }

  async updateTeacherProfileByEmail(
    email: string,
    data: {
      degree?: string | null;
      description?: string;
      photoURL?: string;
    },
  ): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const payload = {
      ...data,
      updatedAt: new Date(),
    };

    const batch = this.afs.firestore.batch();

    const authorizedRef = this.afs
      .collection('authorized')
      .doc(normalizedEmail).ref;
    batch.set(authorizedRef, payload, { merge: true });

    const usersSnapshot = await this.afs
      .collection('users', (ref) =>
        ref
          .where('email', '==', normalizedEmail)
          .where('role', '==', 'docente'),
      )
      .get()
      .toPromise();

    if (usersSnapshot) {
      usersSnapshot.forEach((doc) => {
        batch.set(doc.ref, payload, { merge: true });
      });
    }

    await batch.commit();
  }

  async updateCourseAndSyncTheses(
    courseId: string,
    updates: {
      parallel?: string;
      type?: string;
      professorId?: string;
      subjectName?: string;
    },
  ): Promise<void> {
    const normalizedCourseId = `${courseId || ''}`.trim();

    if (!normalizedCourseId) {
      throw new Error('Curso inválido para actualización.');
    }

    const classDocRef = this.afs.collection('classes').doc(normalizedCourseId);
    const classSnap = await firstValueFrom(classDocRef.get());

    if (!classSnap.exists) {
      throw new Error('No se encontró el curso a actualizar.');
    }

    const currentClass = classSnap.data() as any;
    const nextSubjectName =
      `${updates.subjectName ?? currentClass.subjectName ?? ''}`.trim();
    const nextParallel =
      `${updates.parallel ?? currentClass.parallel ?? ''}`.trim();
    const nextType =
      `${updates.type ?? currentClass.type ?? currentClass.modality ?? ''}`.trim();
    const nextProfessorId =
      `${updates.professorId ?? currentClass.professorId ?? ''}`.trim();

    const professor = nextProfessorId
      ? await firstValueFrom(this.getUserById(nextProfessorId))
      : null;

    const professorName = professor
      ? `${professor.firstName || ''} ${professor.lastName || ''}`.trim() ||
        'Sin docente'
      : 'Sin docente';
    const professorEmail = professor?.email || '';

    const thesisSnapshot = await this.afs
      .collection('tesis', (ref) =>
        ref.where('classId', '==', normalizedCourseId),
      )
      .get()
      .toPromise();

    const batch = this.afs.firestore.batch();

    batch.set(
      classDocRef.ref,
      {
        subjectName: nextSubjectName,
        parallel: nextParallel,
        type: nextType,
        modality: nextType,
        professorId: nextProfessorId,
        updatedAt: new Date(),
      },
      { merge: true },
    );

    if (thesisSnapshot) {
      thesisSnapshot.forEach((thesisDoc) => {
        batch.set(
          thesisDoc.ref,
          {
            className: nextSubjectName,
            classParallel: nextParallel,
            professorId: nextProfessorId,
            professorName,
            professorEmail,
            updatedAt: new Date(),
          },
          { merge: true },
        );
      });
    }

    await batch.commit();
  }

  async uploadTeacherPhotoByEmail(email: string, file: File): Promise<string> {
    const normalizedEmail = email.toLowerCase().trim();
    const safeEmail = normalizedEmail.replace(/[^a-zA-Z0-9@._-]/g, '_');
    const safeName = file.name.replace(/\s+/g, '_');
    const filePath = `docentes/${safeEmail}_${Date.now()}_${safeName}`;
    const fileRef = this.storage.ref(filePath);

    await this.storage.upload(filePath, file);
    const photoURL = await firstValueFrom(fileRef.getDownloadURL());

    await this.updateTeacherProfileByEmail(normalizedEmail, { photoURL });
    return photoURL;
  }

  // Gestión de archivos en Storage
  uploadTeacherPhoto(teacherId: string, file: File) {
    const filePath = `docentes/${teacherId}`;
    const fileRef = this.storage.ref(filePath);
    const task = this.storage.upload(filePath, file);

    return task.snapshotChanges().pipe(
      finalize(() => {
        fileRef.getDownloadURL().subscribe((url) => {
          this.updateRecord('users', teacherId, { photoURL: url });
        });
      }),
    );
  }

  private getUserById(userId: string): Observable<any | null> {
    const normalizedId = `${userId || ''}`.trim();

    if (!normalizedId) {
      return of(null);
    }

    return this.afs
      .collection('users')
      .doc(normalizedId)
      .valueChanges()
      .pipe(
        take(1),
        map((user: any) => user || null),
      );
  }

  private getCycleById(cycleId: string): Observable<any | null> {
    const normalizedId = `${cycleId || ''}`.trim();

    if (!normalizedId) {
      return of(null);
    }

    return this.afs
      .collection('cycle')
      .doc(normalizedId)
      .valueChanges()
      .pipe(
        take(1),
        map((cycle: any) => cycle || null),
      );
  }

  private isCycleActive(value: any): boolean {
    return value === true;
  }
}
