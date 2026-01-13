import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ConsultasService } from '../../services/consultas.service';
import {LoginService} from "../../services/login.service"; // Asegúrate de importar tu servicio

@Component({
  selector: 'app-ciclo',
  templateUrl: './ciclo.component.html',
  styleUrls: ['./ciclo.component.css']
})
export class CicloComponent implements OnInit {
  tesisId: string | null = null;
  estadoMaterias: string | null = null;
  estadoBimestre: string | null = null;
  estadoFechas: string | null = null;
  estadoAprobacion1: string | null = null;
  estadoAprobacion2: string | null = null;




  materias = {
    practicum1: '',
    practicum2: '',
    gestion1: '',
    gestion2: '',
  };

  bimestres = {
    primerBimestre: null,
    segundoBimestre: null
  };

  fechas = {
    primerAvance: '',
    segundoAvance: '',
    aprobacion1: '',
    aprobacion2: ''
  };


  constructor(private route: ActivatedRoute, private consultasService: ConsultasService, private loginService: LoginService) {}

  userRole: string = ''; // Nuevo atributo para el rol del usuario
  isReadOnly: boolean = false; // Determina si la vista es solo lectura

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.tesisId = params['tesisId'];


      this.loginService.getCurrentUserRole().subscribe(role => {
        this.userRole = role;
        this.isReadOnly = role !== 'secretario'; // Solo el secretario puede editar
      });

      if (this.tesisId) {
        this.loadData();

      }
    });
  }

  loadData(): void {
    if (this.tesisId) {
      this.consultasService.getTesisById(this.tesisId).subscribe(data => {
        if (data.ciclo) {
          this.materias = data.ciclo.materias || {};
          this.bimestres = data.ciclo.bimestre || {};
          this.fechas = data.ciclo.fechas || {};

          // Cargar estados
          this.estadoMaterias = data.ciclo.estadoMaterias || 'Pendiente';
          this.estadoBimestre = data.ciclo.estadoBimestre || 'Pendiente';
          this.estadoFechas = data.ciclo.estadoFechas || 'Pendiente';
          this.estadoAprobacion1 = data.ciclo.estadoAprobacion1 || 'Pendiente';
          this.estadoAprobacion2 = data.ciclo.estadoAprobacion2 || 'Pendiente';
        }
      });
    }
  }



  guardarMaterias(): void {
    if (this.tesisId) {
      this.consultasService.updateTesis1(this.tesisId, {
        materias: this.materias,
        estadoMaterias: 'Validado'
      });
    }
  }

  guardarBimestres(): void {
    if (this.tesisId) {
      this.consultasService.updateTesis1(this.tesisId, {
        bimestre: this.bimestres,
        estadoBimestre: 'Validado'
      });
    }
  }

  guardarFechas(): void {
    if (this.tesisId) {
      const fechaAvances = {
        primerAvance: this.fechas.primerAvance,
        segundoAvance: this.fechas.segundoAvance
      };
      this.consultasService.updateTesis1(this.tesisId, {
        fechas: fechaAvances,
        estadoFechas: 'Validado'
      });
    }
  }

  guardarAprobaciones(): void {
    if (this.tesisId) {
      this.consultasService.updateTesis1(this.tesisId, {
        fechas: { ...this.fechas, aprobacion1: this.fechas.aprobacion1 },
        estadoAprobacion1: 'Validado'
      });
    }
  }

  guardarAprobaciones2(): void {
    if (this.tesisId) {
      this.consultasService.updateTesis1(this.tesisId, {
        fechas: { ...this.fechas, aprobacion2: this.fechas.aprobacion2 },
        estadoAprobacion2: 'Validado'
      });
    }
  }

}
