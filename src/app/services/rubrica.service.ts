import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import firebase from 'firebase/compat/app';
import { Observable, map } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RubricaService {
  constructor(private afs: AngularFirestore) {}

  // Actualiza un campo específico dentro del objeto rubrica
  actualizarNotaCriterio(tesisId: string, campo: string, valor: number) {
    const path = `tesis/${tesisId}`;
    // Usamos notación de puntos para actualizar un mapa anidado
    return this.afs.doc(path).update({
      [`rubrica.${campo}`]: valor,
      'rubrica.ultimaModificacion':
        firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Actualiza solo un criterio sin tocar el resto de la tesis
  actualizarNotaIndividual(tesisId: string, criterio: string, valor: number) {
    return this.afs.doc(`tesis/${tesisId}`).update({
      [`rubrica.${criterio}`]: valor,
      'rubrica.fechaActualizacion':
        firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  guardarRubricaCompleta(tesisId: string, rubrica: any) {
    const rubricaCompleta: any = {
      ...rubrica,
      fechaActualizacion: firebase.firestore.FieldValue.serverTimestamp(),
    };
    return this.afs.doc(`tesis/${tesisId}`).update({
      rubrica: rubricaCompleta,
    });
  }

  // Stream de datos para el docente y el estudiante
  obtenerDatosTesis(tesisId: string): Observable<any> {
    return this.afs.doc(`tesis/${tesisId}`).valueChanges();
    // .pipe(map((tesis: any) => (tesis ? tesis.rubrica : null)));
  }
}
