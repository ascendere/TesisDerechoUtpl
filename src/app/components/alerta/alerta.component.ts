import { Component, OnInit } from '@angular/core';
import{ AlertaService } from "../../services/alert.service";

@Component({
  selector: 'app-alertas',
  templateUrl: './alerta.component.html',
  styleUrls: ['./alerta.component.css']
})
export class AlertaComponent implements OnInit {
  visible = false;
  tipo: 'exito' | 'error' | 'info' = 'info';
  titulo = '';
  mensaje = '';

  constructor(private alertaService: AlertaService) {}

  ngOnInit(): void {
    this.alertaService.alerta$.subscribe(data => {
      this.tipo = data.tipo;
      this.titulo = data.titulo;
      this.mensaje = data.mensaje;
      this.visible = true;

      setTimeout(() => {
        this.visible = false;
      }, 4000); // Tiempo visible de la alerta
    });
  }

  cerrar() {
    this.visible = false;
  }
}
