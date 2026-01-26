import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(
    private afAuth: AngularFireAuth,
    private afs: AngularFirestore,
  ) {}

  /**
   * Proceso de registro que vincula la autorización del Excel con la cuenta de Auth
   */
  async registrarYVincularPerfil(
    email: string,
    pass: string,
    cedulaManual: string,
  ) {
    // 1. Verificación en la lista blanca
    const authRef = this.afs.doc(`authorized/${email.toLowerCase().trim()}`);
    const authSnap = await firstValueFrom(authRef.get());

    if (!authSnap.exists) {
      throw new Error('No te encuentras en la lista de autorizados.');
    }

    const datosExcel = authSnap.data() as any;

    // 2. Validación de seguridad (Cédula)
    if (String(datosExcel.cedula).trim() !== String(cedulaManual).trim()) {
      throw new Error('La cédula no coincide con los registros oficiales.');
    }

    // 3. Creación en Firebase Auth
    const userCredential = await this.afAuth.createUserWithEmailAndPassword(
      email,
      pass,
    );
    const uid = userCredential.user?.uid;

    // 4. PREPARACIÓN DEL PERFIL (Limpiamos tempData para que no ensucie la tabla users)
    const { tempData, ...datosPersonales } = datosExcel;

    const userProfile = {
      id: uid,
      ...datosPersonales,
      createdAt: new Date(),
    };

    // Usamos un Batch para asegurar que se creen ambas cosas o ninguna
    const batch = this.afs.firestore.batch();

    // Referencia al perfil de usuario
    const userRef = this.afs.doc(`users/${uid}`).ref;
    batch.set(userRef, userProfile);

    // 5. LÓGICA ESPECÍFICA PARA DOCENTES
    if (datosPersonales.role === 'docente' && tempData) {
      // 1. Referencia a la materia (usamos el nombre como ID para simplificar o un slug)
      const subjectId = tempData.subjectName.toLowerCase().replace(/\s+/g, '-');
      const subjectRef = this.afs.doc(`subjects/${subjectId}`).ref;

      // 2. Creamos/Actualizamos la materia con su descripción
      batch.set(
        subjectRef,
        {
          name: tempData.subjectName,
          description: tempData.description || 'Sin descripción',
          updatedAt: new Date(),
        },
        { merge: true },
      );

      // 3. Creamos la clase vinculada
      const classRef = this.afs.collection('classes').doc().ref;
      batch.set(classRef, {
        id: classRef.id,
        subjectId: subjectId, // ID de la materia
        subjectName: tempData.subjectName, // Redundancia útil para búsquedas rápidas
        parallel: tempData.parallel,
        professorId: uid,
        cycleId: tempData.cycleId,
        type: tempData.modality || 'presencial',
        createdAt: new Date(),
      });
    }

    // 6. Marcar como registrado en la lista de autorizados (opcional, para auditoría)
    batch.update(authRef.ref, {
      status: 'registered',
      registeredAt: new Date(),
    });

    await batch.commit();
    return userProfile;
  }
}
