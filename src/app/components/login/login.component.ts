import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { LoginService } from '../../services/login.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  email: string = '';
  password: string = '';
  loginErrorMessage: string = '';

  constructor(
    private loginService: LoginService,
    private router: Router,
    private location: Location,
  ) {}

  goBack(): void {
    this.location.back();
  }

  login(): void {
    this.loginErrorMessage = '';

    this.loginService.login(this.email, this.password).subscribe(
      () => {
        this.loginErrorMessage = '';
        this.router.navigate(['/home']); // Redirect to simulations after login
      },
      (error) => {
        this.loginErrorMessage = 'Usuario o Contraseña incorrecta';

        if (!this.isInvalidCredentialsError(error)) {
          console.error('Login failed', error);
        }
      },
    );
  }

  clearLoginError(): void {
    this.loginErrorMessage = '';
  }

  private isInvalidCredentialsError(error: any): boolean {
    const invalidCredentialCodes = [
      'auth/invalid-login-credentials',
      'auth/wrong-password',
      'auth/user-not-found',
      'auth/invalid-credential',
    ];
    const errorCode = `${error?.code || error?.error?.code || ''}`;
    const errorMessage =
      `${error?.message || error?.error?.message || ''}`.toLowerCase();

    return (
      invalidCredentialCodes.some((code) => errorCode.includes(code)) ||
      errorMessage.includes('wrong-password') ||
      errorMessage.includes('user-not-found') ||
      errorMessage.includes('invalid-credential') ||
      errorMessage.includes('invalid-login-credentials')
    );
  }
}
