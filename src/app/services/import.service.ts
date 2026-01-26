import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { first, firstValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';

interface ImportRow {
  email?: string;
  role?: string;
  subject?: string;
  parallel?: string;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class ImportService {
  constructor(
    private afs: AngularFirestore,
    private afAuth: AngularFireAuth,
  ) {}

  async saveUsersToAuthorized(users: any[]): Promise<void> {
    const batch = this.afs.firestore.batch();

    users.forEach((user) => {
      // Usamos el email como ID del documento para evitar duplicados
      const docRef = this.afs.collection('authorized').doc(user.email).ref;

      // Al usar set(), si el correo ya existe, se sobrescribe con la nueva info
      batch.set(docRef, user);
    });

    return await batch.commit();
  }

  /* ======================================================
     1. GUARDA USUARIOS AUTORIZADOS (ACCESO)
     ====================================================== */
  async saveAuthorizedUsers(users: ImportRow[]): Promise<void> {
    const batch = this.afs.firestore.batch();

    users.forEach((u) => {
      const ref = this.afs.collection('authorized').doc(u.email).ref;

      batch.set(
        ref,
        {
          email: u.email,
          role: u.role,
          used: false,
          createdAt: new Date(),
        },
        { merge: true },
      );
    });

    await batch.commit();
  }

  async importTeachersAuthorized(payload: any[]): Promise<void> {
    const batch = this.afs.firestore.batch();

    for (const row of payload) {
      /* =====================================================
       1. COLECCIÓN DE AUTORIZADOS (LISTA BLANCA)
       ===================================================== */
      const authorizedRef = this.afs
        .collection('authorized')
        .doc(row.email).ref;

      // Estructura de datos para el docente autorizado
      const authData: any = {
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        role: row.role,
        cedula: row.cedula,
        degree: row.titulo,
        status: 'pending', // Indica que no ha completado su registro inicial
      };

      if (row.role === 'docente') {
        authData.pendingData = {
          subjectName: row.subjectName,
          parallel: row.parallel,
          modality: row.modality,
          cycleId: row.cycleId,
        };
      }

      batch.set(authorizedRef, authData, { merge: true });
    }

    await batch.commit();
  }
}
