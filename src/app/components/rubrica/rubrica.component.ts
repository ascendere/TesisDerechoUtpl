import { Component } from '@angular/core';
import { OnInit } from '@angular/core';
import { RubricaService } from '../../services/rubrica.service';
import { ActivatedRoute, Router } from '@angular/router';
import { ConsultasService } from '../../services/consultas.service';
import { LoginService } from '../../services/login.service';
@Component({
  selector: 'app-rubrica',
  templateUrl: './rubrica.component.html',
  styleUrls: ['./rubrica.component.css'],
})
export class RubricaComponent implements OnInit {
  tesisId: string = '';
  // Objeto local para no disparar escrituras constantes
  rubricaLocal: any = {};
  tesisData: any;
  userRole: string = '';
  esDirector: boolean = false;
  constructor(
    private route: ActivatedRoute,
    private rubricaService: RubricaService,
    private consultaService: ConsultasService,
    private router: Router,
    private loginService: LoginService,
  ) {}

  ngOnInit() {
    this.loginService.getCurrentUser().subscribe((user) => {
      if (user) {
        this.userRole = user.role;
      }
      this.esDirector = this.userRole === 'director';
    });
    this.route.queryParams.subscribe((params) => {
      this.tesisId = params['tesisId'];
      this.cargarDatos();
    });
  }

  cargarDatos() {
    this.rubricaService.obtenerDatosTesis(this.tesisId).subscribe((data) => {
      this.tesisData = data;
      console.log('Datos de tesis obtenidos:', this.tesisData);
      if (data && data.rubrica) {
        this.rubricaLocal = { ...data.rubrica };
      }
    });
  }

  // Solo valida localmente, NO guarda en Firebase todavía
  validarLocal(event: any, max: number, campo: string) {
    let valor = parseFloat(event.target.value) || 0;

    if (valor > max) {
      valor = max;
      event.target.value = max;
      alert(`El máximo es ${max}`);
    }

    this.rubricaLocal[campo] = valor;
  }

  // UNA SOLA ESCRITURA PARA TODO EL OBJETO
  guardarTodo() {
    this.rubricaService
      .guardarRubricaCompleta(this.tesisId, this.rubricaLocal)
      .then(() => alert('Rúbrica actualizada'))
      .catch((err) => console.error(err));
    this.router.navigate(['/flujo'], {
      queryParams: { tesisId: this.tesisId },
    });
  }

  get total(): number {
    return Object.keys(this.rubricaLocal)
      .filter((k) => typeof this.rubricaLocal[k] === 'number')
      .reduce((s, k) => s + this.rubricaLocal[k], 0);
  }
}
