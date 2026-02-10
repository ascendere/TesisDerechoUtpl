import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { map } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AcademicRecordService {
  private tesisId: string = '';

  constructor(private afs: AngularFirestore) {
    this.getTesisIdFromStorage();
  }

  private getTesisIdFromStorage(): void {
    const storedTesisId = localStorage.getItem('tesisId');
    if (storedTesisId) {
      this.tesisId = storedTesisId;
    }
  }

  setTesisId(tesisId: string): void {
    this.tesisId = tesisId;
    localStorage.setItem('tesisId', tesisId);
  }

  // Obtener materias (academicRecord es un array directo en el documento tesis/{tesisId})
  getRecord() {
    if (!this.tesisId) {
      console.error('tesisId no está establecido');
      return of([]);
    }

    return this.afs
      .doc(`tesis/${this.tesisId}`)
      .valueChanges()
      .pipe(
        map((doc: any) => {
          const arr =
            doc && Array.isArray(doc.academicRecord) ? doc.academicRecord : [];
          return arr.map((a: any) => ({ ...a, editando: false }));
        }),
      );
  }

  // Guardar o actualizar materias en el array academicRecord del documento tesis/{tesisId}
  async saveRecords(subjects: any[]) {
    if (!this.tesisId) {
      console.error('tesisId no está establecido');
      return;
    }

    const tesisDocRef = this.afs.firestore.doc(`tesis/${this.tesisId}`);

    return this.afs.firestore.runTransaction(async (tx) => {
      const tesisSnap = await tx.get(tesisDocRef as any);
      const data = tesisSnap.exists ? tesisSnap.data() : {};
      const arr: any[] = Array.isArray((data as any).academicRecord)
        ? [...(data as any).academicRecord]
        : [];

      subjects.forEach((subject) => {
        if (!subject.id) {
          subject.id = this.generateId();
        }

        const idx = arr.findIndex((s) => s.id === subject.id);
        const item = {
          id: subject.id,
          nombre: subject.nombre,
          estado: subject.estado || 'Pendiente',
          fechaActualizacion: new Date().toISOString(),
          fechaCreacion: subject.fechaCreacion || new Date().toISOString(),
        };

        if (idx >= 0) {
          // actualizar si existe
          arr[idx] = { ...arr[idx], ...item };
        } else {
          // agregar nuevo
          arr.push(item);
        }
      });

      tx.set(tesisDocRef as any, { academicRecord: arr }, { merge: true });
    });
  }

  // Eliminar materia por id del array academicRecord
  async deleteSubject(subjectId: string) {
    if (!this.tesisId) {
      console.error('tesisId no está establecido');
      return;
    }

    const tesisDocRef = this.afs.firestore.doc(`tesis/${this.tesisId}`);

    return this.afs.firestore.runTransaction(async (tx) => {
      const tesisSnap = await tx.get(tesisDocRef as any);
      if (!tesisSnap.exists) return;
      const data = tesisSnap.data() || {};
      const arr: any[] = Array.isArray((data as any).academicRecord)
        ? [...(data as any).academicRecord]
        : [];

      const newArr = arr.filter((s) => s.id !== subjectId);

      tx.set(tesisDocRef as any, { academicRecord: newArr }, { merge: true });
    });
  }

  private generateId(): string {
    return (
      'MAT_' +
      new Date().getTime() +
      '_' +
      Math.random().toString(36).substr(2, 9)
    );
  }
}
