import { Component, OnInit } from '@angular/core';
import { LoginService } from '../../services/login.service';
import { Router } from '@angular/router';
import User from '../../interfaces/user.interface';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit {
  loggedIn: boolean = false;
  user: User | null = null;
  menuOpen: boolean = false; // Control del menú en móviles
  botonOpen: boolean = false; // Control del dropdown de usuario

  constructor(private loginService: LoginService, private router: Router) {}

  ngOnInit(): void {
    this.loginService.isLoggedIn().subscribe((isLoggedIn) => {
      this.loggedIn = isLoggedIn;
    });

    this.loginService.getCurrentUser().subscribe((user) => {
      this.user = user;
    });
  }

  logout(): void {
    this.loginService.logout().subscribe(() => {
      this.router.navigate(['']);
    });
  }

  toggleMenu(): void {
    this.botonOpen = !this.botonOpen;
  }

  toggleNav(): void {
    this.menuOpen = !this.menuOpen;
  }
}
