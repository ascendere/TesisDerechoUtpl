import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ConsultasService } from '../../services/consultas.service';
import { LoginService } from '../../services/login.service';
import { first, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent implements OnInit {
  constructor(
    private router: Router,
    private consultasService: ConsultasService,
    private authService: LoginService
  ) {}

  ngOnInit(): void {}

  iniciar(): void {
    this.authService
      .getUserId()
      .pipe(
        first(), // Obtener solo el primer valor del Observable
        switchMap((userId) => {
          if (!userId) {
            this.router.navigate(['/login']);
            console.error('Usuario no autenticado');
            return []; // Retorna un array vacío si el usuario no está autenticado
          }
          return this.consultasService.getTesisByUserId(userId);
        })
      )
      .subscribe(
        (tesisArray) => {
          if (tesisArray.length > 0) {
            // const tesisId = tesisArray[0].id; // Obtiene el ID del primer documento
            this.router.navigate(['/info']);
          } else {
            this.router.navigate(['/info']);
          }
        },
        (error) => {
          console.error('Error al verificar la tesis:', error);
        }
      );
  }
}
