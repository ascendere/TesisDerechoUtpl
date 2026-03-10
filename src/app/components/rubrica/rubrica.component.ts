import { Component } from '@angular/core';
import { OnInit } from '@angular/core';
import { Location } from '@angular/common';
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
    private location: Location,
  ) {}

  ngOnInit() {
    this.loginService.getCurrentUser().subscribe((user) => {
      if (user) {
        this.userRole = user.role;
      }
      this.esDirector = this.userRole === 'director';
    });
    this.route.queryParams.subscribe((params) => {
      this.tesisId = params['tesisId'] || '';
      if (!this.tesisId) {
        console.error('No se recibió tesisId en la ruta de rúbrica.');
        return;
      }
      this.cargarDatos();
    });
  }

  cargarDatos() {
    if (!this.tesisId) {
      return;
    }

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
    if (!this.tesisId) {
      alert('No se pudo guardar la rúbrica: tesis no identificada.');
      return;
    }

    this.rubricaService
      .guardarRubricaCompleta(this.tesisId, this.rubricaLocal)
      .then(() => {
        alert('Rúbrica actualizada');
        this.router.navigate(['/flujo'], {
          queryParams: { tesisId: this.tesisId },
        });
      })
      .catch((err) => console.error(err));
  }

  goBack() {
    this.location.back();
  }

  get fechaActualizacion(): Date | null {
    const rawFecha = this.rubricaLocal?.fechaActualizacion;

    if (!rawFecha) {
      return null;
    }

    if (typeof rawFecha.toDate === 'function') {
      return rawFecha.toDate();
    }

    if (rawFecha instanceof Date) {
      return rawFecha;
    }

    const parsedDate = new Date(rawFecha);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
  }

  get total(): number {
    return Object.keys(this.rubricaLocal)
      .filter((k) => typeof this.rubricaLocal[k] === 'number')
      .reduce((s, k) => s + this.rubricaLocal[k], 0);
  }
}
