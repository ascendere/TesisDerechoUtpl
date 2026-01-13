import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AlertaService {
  private alertaSubject = new Subject<any>();
  alerta$ = this.alertaSubject.asObservable();

  mostrarAlerta(tipo: 'exito' | 'error' | 'info', titulo: string, mensaje: string) {
    this.alertaSubject.next({ tipo, titulo, mensaje });
  }
}
