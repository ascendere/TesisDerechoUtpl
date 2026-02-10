import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import * as XLSX from 'xlsx';
import { AcademicRecordService } from '../../services/academicRecord.service';
import { AuthService } from '../../services/auth.service';
import { LoginService } from '../../services/login.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-ciclo',
  templateUrl: './ciclo.component.html',
  styleUrls: ['./ciclo.component.css'],
})
export class CicloComponent implements OnInit {
  listaMaterias: any[] = [];
  tesisId: string | null = null;
  esSecretario: boolean = false;
  addingManual: boolean = false;
  newMateriaName: string = '';

  constructor(
    private recordService: AcademicRecordService,
    private loginService: LoginService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit() {
    // Obtener tesisId de los queryParams
    this.route.queryParams.subscribe((params) => {
      this.tesisId = params['tesisId'];
      console.log('Tesis ID:', this.tesisId);

      if (this.tesisId) {
        this.recordService.setTesisId(this.tesisId);
        this.obtenerDatos();
      } else {
        console.error('No se encontró el ID de la tesis.');
      }
    });

    // Verificar rol del usuario
    this.loginService.getCurrentUserRole().subscribe((role) => {
      this.esSecretario = role === 'secretario';
    });
  }

  verificarRol() {
    this.loginService.getCurrentUserRole().subscribe((role) => {
      this.esSecretario = role === 'secretario';
    });
  }

  obtenerStudentId() {
    // kept for compatibility; now main flow determines studentId in ngOnInit
  }

  obtenerDatos() {
    if (!this.tesisId) {
      console.error('TesisId no está disponible');
      return;
    }

    this.recordService.getRecord().subscribe(
      (data: any) => {
        this.listaMaterias = data;
      },
      (error: any) => {
        console.error('Error al obtener los datos:', error);
      },
    );
  }

  async guardarCambios(materia: any) {
    const payload = {
      id: materia.id || this.generarId(),
      nombre: (materia.nombre || '').toString().trim(),
      estado: materia.estado === 'Cumplido' ? 'Cumplido' : 'Pendiente',
      fechaCreacion: materia.fechaCreacion || new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
    };

    await this.recordService.saveRecords([payload]);
    materia.editando = false;
  }

  eliminar(materia: any) {
    if (confirm('¿Eliminar asignatura?')) {
      if (materia.id) {
        this.recordService
          .deleteSubject(materia.id)
          .then(() => {
            this.obtenerDatos();
          })
          .catch((err: any) => console.error('Error eliminando materia:', err));
      }
    }
  }

  eliminarMateria(materia: any, index?: number) {
    if (index !== undefined) {
      this.listaMaterias.splice(index, 1);
    } else {
      this.listaMaterias = this.listaMaterias.filter(
        (m) => m.id !== materia.id,
      );
    }

    if (materia.id) {
      this.recordService
        .deleteSubject(materia.id)
        .then(() => {
          this.obtenerDatos();
        })
        .catch((err: any) => {
          console.error('Error eliminando materia:', err);
        });
    }
  }

  async agregarMateriaManual() {
    const nombre = (this.newMateriaName || '').trim();
    if (!nombre) {
      alert('Ingrese el nombre de la asignatura');
      return;
    }

    const nuevaMateria = {
      id: this.generarId(),
      nombre: nombre,
      estado: 'Pendiente',
      fechaCreacion: new Date().toISOString(),
      fechaActualizacion: new Date().toISOString(),
      editando: false,
    };

    this.listaMaterias.push(nuevaMateria);
    // save only the allowed fields
    await this.recordService.saveRecords([
      {
        id: nuevaMateria.id,
        nombre: nuevaMateria.nombre,
        estado: nuevaMateria.estado,
        fechaCreacion: nuevaMateria.fechaCreacion,
        fechaActualizacion: nuevaMateria.fechaActualizacion,
      },
    ]);
    this.newMateriaName = '';
    this.addingManual = false;
  }

  cancelAgregar() {
    this.newMateriaName = '';
    this.addingManual = false;
  }

  confirmarEliminar(materia: any, index?: number) {
    const mensajeConfirmacion = `¿Está seguro de que desea eliminar la asignatura "${materia.nombre}"?`;
    if (confirm(mensajeConfirmacion)) {
      this.eliminarMateria(materia, index);
    }
  }

  cargarExcel(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    // Validar que sea un archivo Excel
    const validExcelTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/ms-excel',
    ];

    if (
      !validExcelTypes.includes(file.type) &&
      !file.name.endsWith('.xlsx') &&
      !file.name.endsWith('.xls')
    ) {
      alert('Por favor, cargue un archivo Excel válido (.xlsx o .xls)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      try {
        const bstr: string = e.target.result;
        const wb: XLSX.WorkBook = XLSX.read(bstr, { type: 'binary' });
        const wsname: string = wb.SheetNames[0];
        const ws: XLSX.WorkSheet = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          alert('El archivo está vacío. Por favor, agregue datos.');
          return;
        }

        // Validar que exista una columna llamada "materias" en los headers
        const firstRow = data[0] as any;
        const materiasColumnName = Object.keys(firstRow).find(
          (key) => key.toLowerCase() === 'materias',
        );

        if (!materiasColumnName) {
          alert(
            'El archivo debe contener una columna llamada "materias" en la primera fila.',
          );
          return;
        }

        // Validar que cada fila tenga el campo "materias" no vacío
        const invalidRows = data.filter(
          (item: any) => !item[materiasColumnName],
        );

        if (invalidRows.length > 0) {
          alert(
            `El archivo contiene ${invalidRows.length} fila(s) con la columna "materias" vacía. Por favor, verifique los datos.`,
          );
          return;
        }

        const materiasExcel = data.map((item: any) => {
          const estadoRaw = (item.estado || item.Estado || 'Pendiente')
            .toString()
            .trim();
          const estado = estadoRaw === 'Cumplido' ? 'Cumplido' : 'Pendiente';
          return {
            id: this.generarId(),
            nombre: (item[materiasColumnName] || '').toString().trim(),
            estado,
            fechaCreacion: new Date().toISOString(),
            fechaActualizacion: new Date().toISOString(),
            editando: false,
          };
        });

        this.listaMaterias.push(...materiasExcel);
        // save only the allowed fields
        this.recordService.saveRecords(
          materiasExcel.map((m) => ({
            id: m.id,
            nombre: m.nombre,
            estado: m.estado,
            fechaCreacion: m.fechaCreacion,
            fechaActualizacion: m.fechaActualizacion,
          })),
        );
        alert(`Se cargaron ${materiasExcel.length} materia(s) exitosamente.`);
      } catch (error) {
        console.error('Error procesando el archivo Excel:', error);
        alert(
          'Error al procesar el archivo Excel. Verifique que sea un archivo válido.',
        );
      }
    };

    reader.onerror = () => {
      alert('Error al leer el archivo. Por favor, intente nuevamente.');
    };

    reader.readAsBinaryString(file);
  }

  descargarPlantilla() {
    try {
      const wb = XLSX.utils.book_new();
      const data = [['materias'], ['Ejemplo 1'], ['Ejemplo 2']];
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_materias.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generando plantilla:', err);
      alert('No se pudo generar la plantilla.');
    }
  }

  private generarId(): string {
    return (
      'MAT_' +
      new Date().getTime() +
      '_' +
      Math.random().toString(36).substr(2, 9)
    );
  }
}
