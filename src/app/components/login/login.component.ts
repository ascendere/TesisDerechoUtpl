import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { LoginService } from '../../services/login.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  email: string = '';
  password: string = '';

  constructor(private loginService: LoginService, private router: Router) { }

  login(): void {
    this.loginService.login(this.email, this.password).subscribe(
      () => {
        this.router.navigate(['/home']); // Redirect to simulations after login
      },
      error => {
        console.error('Login failed', error);
      }
    );
  }

}
