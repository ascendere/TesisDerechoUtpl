export interface DatosBase {
  correo: string;
  nombre: string;
  apellido: string;
  cedula: string;
}

export interface DatosDocente extends DatosBase {
  asignatura: string;
  paralelo: string;
  modalidad: string;
  titulo: string;
}

export interface DatosEstudiante extends DatosBase {

}
export interface DatosEquipoEvaluador extends DatosBase {

}

export interface DatosDirectorTesis extends DatosBase{

}
