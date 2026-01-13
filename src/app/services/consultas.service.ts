import { Injectable } from '@angular/core';
import {
  AngularFirestore,
  AngularFirestoreCollection,
  DocumentData,
} from '@angular/fire/compat/firestore';
import { Observable, combineLatest, of, finalize } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import Class from '../interfaces/classes.interface';
import User from '../interfaces/user.interface';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import firebase from 'firebase/compat/app';

import { AngularFireAuth } from '@angular/fire/compat/auth';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { environment } from '../../environments/environment';
import DocumentReference = firebase.firestore.DocumentReference;

@Injectable({
  providedIn: 'root',
})
export class ConsultasService {
  private usersCollection: AngularFirestoreCollection<User>;
  constructor(
    private firestore: AngularFirestore,
    private storage: AngularFireStorage,
    private afAuth: AngularFireAuth
  ) {
    this.usersCollection = firestore.collection<User>('users');
  }

  // Método para obtener las clases por modalidad, con nombre del profesor
  getClassesByModality(modality: string): Observable<
    (Class & {
      professorName: string;
      professorEmail: string;
      professorId: string;
    })[]
  > {
    return this.firestore
      .collection<Class>('classes', (ref) => ref.where('type', '==', modality))
      .valueChanges()
      .pipe(
        switchMap((classes) => {
          // Para cada clase, busca el nombre del profesor correspondiente
          const classObservables = classes.map((classItem) =>
            this.firestore
              .collection<User>('users')
              .doc(classItem.userId)
              .valueChanges()
              .pipe(
                map((user) => ({
                  ...classItem,
                  professorName: user
                    ? `${user.firstName} ${user.lastName}`
                    : 'Desconocido',
                  professorEmail: user ? user.email : '',
                  professorId: user ? user.id : '',
                }))
              )
          );
          return classObservables.length
            ? combineLatest(classObservables)
            : of([]);
        })
      );
  }

  getClassById(classId: string): Observable<
    | (Class & {
        professorName: string;
        professorEmail: string;
        professorId: string;
      })
    | null
  > {
    return this.firestore
      .collection<Class>('classes')
      .doc(classId)
      .valueChanges()
      .pipe(
        switchMap((classData) => {
          if (!classData) {
            return of(null); // Si no se encuentra la clase, devuelve null
          }

          // Buscar el nombre del profesor asociado a la clase
          return this.firestore
            .collection<User>('users')
            .doc(classData.userId)
            .valueChanges()
            .pipe(
              map((user) => ({
                ...classData,
                professorName: user
                  ? `${user.firstName} ${user.lastName}`
                  : 'Desconocido',
                professorEmail: user ? user.email : '',
                professorId: user ? user.id : '',
              }))
            );
        })
      );
  }

  // Método para guardar datos personales como subcolección
  savePersonalData(userId: string, personalData: any): Promise<void> {
    // Crear una subcolección llamada 'personalData' dentro del documento del usuario
    return this.firestore
      .collection('tesis')
      .doc(userId)
      .collection('personalData')
      .add(personalData) // 'add' genera un ID único para cada documento en la subcolección
      .then(() => {
        console.log('Datos personales guardados correctamente.');
      })
      .catch((error) => {
        console.error('Error al guardar los datos personales: ', error);
        throw error;
      });
  }

  // Método para subir una imagen a Firebase Storage
  uploadImage(
    userId: string,
    file: File,
    folder: string
  ): Observable<string | null> {
    const filePath = `${folder}/${userId}_${file.name}`;
    const fileRef = this.storage.ref(filePath);
    const task = this.storage.upload(filePath, file);

    return new Observable<string | null>((observer) => {
      task
        .snapshotChanges()
        .pipe(
          finalize(() => {
            // Una vez finalizada la subida, obtenemos la URL de descarga
            fileRef.getDownloadURL().subscribe(
              (downloadURL) => {
                observer.next(downloadURL);
                observer.complete();
              },
              (error) => {
                observer.next(null); // En caso de error, devuelve `null` en lugar de undefined
                observer.complete();
              }
            );
          })
        )
        .subscribe();
    });
  }

  // Método para guardar un documento en la colección 'documents'
  saveDocument(documentData: any) {
    return this.firestore.collection('documents').add(documentData);
  }

  // Método para obtener documentos de un usuario por su userId
  getDocumentsByUser(userId: string): Observable<any[]> {
    return this.firestore
      .collection('documents', (ref) => ref.where('userId', '==', userId))
      .snapshotChanges()
      .pipe(
        map((actions) =>
          actions.map((a) => {
            const data = a.payload.doc.data() as object; // Aseguramos que 'data' sea un objeto
            const id = a.payload.doc.id;
            return { id, ...data };
          })
        )
      );
  }

  // Método para obtener los datos personales de un usuario por su userId
  getPersonalDataByUserId(userId: string): Observable<any> {
    return this.firestore.collection('personalData').doc(userId).valueChanges();
  }

  // Método para guardar un documento en la colección 'tesis'
  saveTesis(tesisData: any): Observable<string> {
    return new Observable<string>((observer) => {
      this.firestore
        .collection('tesis')
        .add(tesisData)
        .then((docRef) => {
          observer.next(docRef.id); // Retorna el ID del documento creado
          observer.complete();
        })
        .catch((error) => {
          observer.error(error);
        });
    });
  }

  getTesisData(tesisId: string): Observable<any> {
    return this.firestore
      .collection('tesis')
      .doc(tesisId)
      .valueChanges()
      .pipe(
        map((tesis: any) => (tesis ? tesis.personalData : null)) // Accede a personalData directamente
      );
  }

  updateTesis(tesisId: string, updateData: any): Observable<void> {
    return new Observable<void>((observer) => {
      this.firestore
        .collection('tesis')
        .doc(tesisId)
        .update(updateData)
        .then(() => {
          observer.next();
          observer.complete();
        })
        .catch((error) => {
          observer.error(error);
        });
    });
  }

  saveTesisData(thesisId: string, personalData: any): Promise<void> {
    const thesisRef = this.firestore.collection('tesis').doc(thesisId); // Obtiene la referencia de la tesis
    return thesisRef.set({ personalData }, { merge: true }); // Utiliza { merge: true } para actualizar la tesis existente
  }

  updateTesis1(tesisId: string, data: any): Promise<void> {
    console.log('Actualizando tesis con ID:', tesisId, 'con los datos:', data);

    // Crear un nuevo objeto con el campo "ciclo" que contiene los datos
    const updatedData = {
      ciclo: data,
    };

    return this.firestore
      .collection('tesis')
      .doc(tesisId)
      .set(updatedData, { merge: true })
      .then(() =>
        console.log('Datos actualizados correctamente en el atributo "ciclo"')
      )
      .catch((error) => console.error('Error al actualizar:', error));
  }

  // Método para obtener un documento de la colección 'tesis' por su ID
  getTesisById(tesisId: string): Observable<any> {
    return this.firestore.collection('tesis').doc(tesisId).valueChanges();
  }

  // Obtener usuarios por rol
  getUserByRole(role: string): Observable<any> {
    return this.firestore
      .collection('users', (ref) => ref.where('role', '==', role))
      .valueChanges();
  }

  // Método para guardar un documento en la subcolección 'documents' de una tesis específica
  saveDocumentInTesis(tesisId: string, documentData: any): Promise<void> {
    return this.firestore
      .collection('tesis') // Acceder a la colección 'tesis'
      .doc(tesisId) // Seleccionar la tesis correspondiente
      .collection('documents') // Subcolección 'documents'
      .add(documentData) // Agregar el documento
      .then(() => {
        console.log('Documento guardado correctamente en la tesis.');
      })
      .catch((error) => {
        console.error('Error al guardar el documento en la tesis:', error);
        throw error;
      });
  }

  // Método para obtener documentos desde la subcolección 'documents' dentro de una tesis específica
  getDocumentsByTesisId(tesisId: string): Observable<any[]> {
    return this.firestore
      .collection('tesis')
      .doc(tesisId)
      .collection('documents')
      .snapshotChanges()
      .pipe(
        map((actions) =>
          actions.map((a) => {
            const data = a.payload.doc.data() as object;
            const id = a.payload.doc.id;
            return { id, ...data };
          })
        )
      );
  }

  getPersonalDataFromTesis(tesisId: string): Observable<any> {
    return this.firestore
      .collection('tesis')
      .doc(tesisId)
      .valueChanges()
      .pipe(
        map((tesis: any) => (tesis ? tesis.personalData : null)) // Accede a personalData directamente
      );
  }

  getTesisByUserId(userId: string | null): Observable<any[]> {
    if (!userId) return of([]); // Retorna un array vacío si userId es null

    return this.firestore
      .collection('tesis', (ref) => ref.where('userId', '==', userId))
      .snapshotChanges()
      .pipe(
        map((actions) =>
          actions.map((a) => {
            const data = a.payload.doc.data() as any;
            const id = a.payload.doc.id;
            return { id, ...data };
          })
        )
      );
  }

  getAllTesis(): Observable<any[]> {
    return this.firestore
      .collection('tesis')
      .snapshotChanges()
      .pipe(
        map((actions) =>
          actions.map((a) => {
            const data = a.payload.doc.data() as any;
            const id = a.payload.doc.id;
            return { id, ...data };
          })
        )
      );
  }

  updateDocumentsStates(tesisId: string, documentos: any[]) {
    const batch = this.firestore.firestore.batch();
    const docsRef = this.firestore.collection(`tesis/${tesisId}/documents`);

    documentos.forEach((doc) => {
      const docRef = docsRef.doc(doc.id).ref;
      batch.update(docRef, doc);
    });

    return batch.commit();
  }

  async addUser(userData: Partial<User>): Promise<void> {
    // 1. Validación de datos
    if (
      !userData.email ||
      !userData.firstName ||
      !userData.lastName ||
      !userData.role
    ) {
      throw new Error('Faltan datos requeridos para el usuario.');
    }

    // 2. Crear una aplicación secundaria temporal
    // Usamos un nombre único como 'SecondaryApp' para no entrar en conflicto con la principal
    const secondaryApp = initializeApp(environment.firebase, 'SecondaryApp');
    const secondaryAuth = getAuth(secondaryApp);

    try {
      // 3. Crear el acceso en Firebase Auth sin afectar la sesión actual
      const credential = await createUserWithEmailAndPassword(
        secondaryAuth,
        userData.email,
        userData.email // Password temporal (puedes cambiarlo a una lógica más compleja)
      );

      const uid = credential.user.uid;

      // 4. Guardar los datos en la colección 'users' de Firestore
      await this.firestore
        .collection('users')
        .doc(uid)
        .set({
          ...userData,
          id: uid,
          createdAt: new Date(),
        });

      console.log(`Usuario ${userData.email} creado con UID: ${uid}`);

      // 5. CERRAR SESIÓN en la instancia secundaria y destruirla
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);
    } catch (error: any) {
      console.error(`Error procesando a ${userData.email}:`, error);
      // Intentar limpiar la app secundaria incluso si hay error
      await deleteApp(secondaryApp);
      throw error;
    }
  }

  getCycles() {
    return this.firestore.collection('cycle').valueChanges({ idField: 'id' });
  }

  async assignRandomStaff(
    thesisId: string,
    role: string,
    amount: number = 1,
    maxLoad: number = 3
  ): Promise<void> {
    try {
      // 1. Fetch all available staff with the specific role under the load limit
      const staffSnapshot = await this.firestore
        .collection('users', (ref) =>
          ref.where('role', '==', role).where('currentLoad', '<', maxLoad)
        )
        .get()
        .toPromise();

      if (!staffSnapshot || staffSnapshot.docs.length < amount) {
        throw new Error(`Not enough available staff for role: ${role}`);
      }

      // 2. Shuffle candidates and select the required amount
      const candidates = staffSnapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data() as any,
        ref: doc.ref,
      }));

      // Simple Durstenfeld shuffle
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }

      const selectedStaff = candidates.slice(0, amount);

      // 3. Use an Atomic Batch to update both Thesis and User documents
      const batch = this.firestore.firestore.batch();
      const thesisRef = this.firestore.collection('tesis').doc(thesisId).ref;

      if (role === 'director') {
        const director = selectedStaff[0];
        batch.update(thesisRef, {
          directorId: director.id,
          directorName: `${director.data.firstName} ${director.data.lastName}`,
        });
      } else {
        // For "Equipo Evaluador" (Array of members)
        const evaluationTeam = selectedStaff.map((s) => ({
          id: s.id,
          name: `${s.data.firstName} ${s.data.lastName}`,
        }));
        batch.update(thesisRef, { evaluationTeam });
      }

      // 4. Increment workload for each selected professor
      selectedStaff.forEach((staff) => {
        batch.update(staff.ref, {
          currentLoad: (staff.data.currentLoad || 0) + 1,
        });
      });

      await batch.commit();
      console.log(
        `Successfully assigned ${amount} ${role}(s) to thesis ${thesisId}`
      );
    } catch (error) {
      console.error('Error in assignRandomStaff:', error);
      throw error;
    }
  }

  /**
   * Checks if it's the student's first thesis
   */
  async isFirstThesis(userId: string): Promise<boolean> {
    const snapshot = await this.firestore
      .collection('tesis', (ref) => ref.where('userId', '==', userId))
      .get()
      .toPromise();
    return snapshot ? snapshot.empty : true;
  }

  /**
   * Atomic operation: Saves thesis, assigns staff randomly, and updates workload
   */
  async saveTesisWithRandomAssignment(tesisData: any): Promise<string> {
    const batch = this.firestore.firestore.batch();

    try {
      // 1. Consultas con logs de depuración
      const dirRef = this.firestore.collection('users', (ref) =>
        ref.where('role', '==', 'director').where('currentLoad', '<', 3)
      );
      const evRef = this.firestore.collection('users', (ref) =>
        ref.where('role', '==', 'evaluador').where('currentLoad', '<', 3)
      );

      const [dirSnap, evSnap] = await Promise.all([
        dirRef.get().toPromise(),
        evRef.get().toPromise(),
      ]);

      console.log('--- DEPURACIÓN DE ASIGNACIÓN ---');
      console.log('Directores encontrados:', dirSnap?.docs.length || 0);
      console.log('Evaluadores encontrados:', evSnap?.docs.length || 0);

      // 2. Validación detallada
      if (!dirSnap || dirSnap.empty) {
        throw new Error(
          'No se encontraron usuarios con role "director" y currentLoad < 3'
        );
      }
      if (!evSnap || evSnap.empty) {
        throw new Error(
          'No se encontraron usuarios con role "evaluador" y currentLoad < 3'
        );
      }

      // 3. Selección (Para pruebas tomamos el primero disponible)
      const randomDirDoc = dirSnap.docs[0];
      const randomEvDoc = evSnap.docs[0];

      const dirData = randomDirDoc.data() as any;
      const evData = randomEvDoc.data() as any;

      // 4. Preparar documento de tesis
      const tesisRef = this.firestore.collection('tesis').doc().ref;

      const finalData = {
        ...tesisData,
        directorId: randomDirDoc.id,
        directorName: `${dirData.firstName} ${dirData.lastName}`,
        directorEmail: dirData.email,
        evaluationTeam: [
          {
            id: randomEvDoc.id,
            name: `${evData.firstName} ${evData.lastName}`,
            email: evData.email,
          },
        ],
        assignmentMode: 'Automatic',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      batch.set(tesisRef, finalData);

      // 5. Incrementar carga (Usando FieldValue para evitar conflictos)
      batch.update(randomDirDoc.ref, {
        currentLoad: firebase.firestore.FieldValue.increment(1),
      });
      batch.update(randomEvDoc.ref, {
        currentLoad: firebase.firestore.FieldValue.increment(1),
      });

      await batch.commit();
      return tesisRef.id;
    } catch (error: any) {
      console.error('Error detallado en la asignación:', error);
      throw error; // Re-lanzamos para que el componente lo capture
    }
  }

  /**
   * Busca un usuario por correo y actualiza la tesis con sus datos completos.
   * No incrementa la carga (currentLoad) según lo solicitado.
   */
  async updateManualAssignment(
    thesisId: string,
    professor: any,
    role: 'director' | 'evaluador'
  ): Promise<void> {
    const fullName = `${professor.firstName} ${professor.lastName}`;
    let updateData: any = {};

    if (role === 'director') {
      updateData = {
        directorId: professor.id,
        directorName: fullName,
        directorEmail: professor.email,
      };
    } else {
      updateData = {
        evaluationTeam: [
          {
            id: professor.id,
            name: fullName,
            email: professor.email,
          },
        ],
      };
    }

    return this.firestore.collection('tesis').doc(thesisId).update(updateData);
  }
}
