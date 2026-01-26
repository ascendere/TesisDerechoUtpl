import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireStorage } from '@angular/fire/compat/storage';
import { finalize, map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DirectorioService {
  constructor(
    private afs: AngularFirestore,
    private storage: AngularFireStorage,
  ) {}

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

  // Obtener solo usuarios con rol docente
  getTeachers(searchTerm?: string): Observable<any[]> {
    return this.afs
      .collection('users', (ref) => {
        let query = ref.where('role', '==', 'docente');
        if (searchTerm)
          query = query
            .where('lastName', '>=', searchTerm)
            .where('lastName', '<=', searchTerm + '\uf8ff');
        return query;
      })
      .valueChanges({ idField: 'id' });
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
}
