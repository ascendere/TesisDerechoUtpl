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
    private authService: LoginService,
  ) {}

  ngOnInit(): void {}

  iniciar(): void {
    this.authService
      .getCurrentUser()
      .pipe(first())
      .subscribe((user) => {
        if (!user) {
          this.router.navigate(['/login']);
          return;
        }

        this.router.navigate(['/info']);
      });
  }
}
