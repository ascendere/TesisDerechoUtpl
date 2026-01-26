import { Component } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { Router } from '@angular/router';
@Component({
  selector: 'app-registro',
  templateUrl: './registro.component.html',
  styleUrls: ['./registro.component.css'],
})
export class RegistroComponent {
  email: string = '';
  cedula: string = '';
  password: string = '';
  confirmPassword: string = '';
  constructor(private authService: AuthService, private router: Router) {}

  async registrar() {
    // 1. Verificación de campos vacíos
    if (
      !this.email ||
      !this.cedula ||
      !this.password ||
      !this.confirmPassword
    ) {
      alert('Por favor completa todos los campos.');
      return;
    }

    // 2. Validación de coincidencia de contraseñas
    if (this.password !== this.confirmPassword) {
      alert('Las contraseñas no coinciden. Por favor verifica.');
      return;
    }

    // 3. Validación de longitud mínima (Recomendado por Firebase)
    if (this.password.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      // Llamamos al servicio que definimos anteriormente
      await this.authService.registrarYVincularPerfil(
        this.email,
        this.password,
        this.cedula
      );
      alert('¡Cuenta creada y vinculada exitosamente!');
      this.router.navigate(['/login']);
    } catch (error: any) {
      // Aquí se capturan errores de Firebase o si la cédula no existe en 'autorizados'
      alert('Error en el registro: ' + error.message);
    }
  }

  loginConOutlook() {
    console.log('Funcionalidad disponible en fase de producción.');
  }
}
