// Tipos de la API (ver docs/protocolo.md)

export type Rol = "ADMIN" | "GUARDIA" | "CLIENTE";
export type RolCasa = "DUENO" | "FAMILIAR";
export type Severidad = "INFO" | "ALERTA" | "CRITICA";
export type EstadoAtencion = "PENDIENTE" | "EN_CURSO" | "RESUELTO" | "FALSA_ALARMA";

export interface CasaResumen {
  id: number;
  nombre: string | null;
  calle: string | null;
  numero: string | null;
  barrio: string | null;
  rolCasa: RolCasa;
}

export interface Usuario {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  rol: Rol;
  activo: boolean;
  debeCambiarPassword: boolean;
  casas: CasaResumen[];
}

export interface Sesion {
  accessToken: string;
  refreshToken: string;
  usuario: Usuario;
}

export interface DispositivoEstado {
  id: number;
  deviceId: string;
  nombre: string | null;
  online: boolean;
  firmwareVersion: string | null;
  ultimaConexion: string | null;
}

export interface EstadoCasa {
  casaId: number;
  alarmaArmada: boolean;
  puertaAbierta: boolean;
  online: boolean;
  rssi: number | null;
  ssid: string | null;
  dispositivo: DispositivoEstado | null;
}

export interface Casa {
  id: number;
  codigo: string;
  nombre: string | null;
  calle: string | null;
  numero: string | null;
  manzana: string | null;
  barrio: string | null;
  alarmaArmada: boolean;
  retardoEntradaSeg: number;
  rolCasa: RolCasa | null;
  estado: EstadoCasa | null;
}

export interface Evento {
  id: number;
  tipo: string;
  severidad: Severidad;
  fechaHora: string;
  alarmaArmada: boolean;
  casa: { id: number; nombre: string | null; calle: string | null; numero: string | null; manzana: string | null; barrio: string | null } | null;
  dispositivo: { deviceId: string; nombre: string | null } | null;
  usuario: { id: number; nombre: string } | null;
  estado: {
    estado: EstadoAtencion;
    guardia: { id: number; nombre: string } | null;
    nota: string | null;
    tomadoEn: string | null;
    resueltoEn: string | null;
  } | null;
}

export interface Pagina<T> {
  items: T[];
  siguiente: number | null;
}

export interface Contacto {
  id: number;
  nombre: string;
  telefono: string;
  relacion: string | null;
}

export interface Miembro {
  usuarioId: number;
  rol: RolCasa;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
}

// Guardia
export interface ResumenGuardia {
  pendientes: number;
  enCurso: number;
  casasArmadas: number;
  casasActivas: number;
  placasOffline: number;
  puertasAbiertas: number;
}

export interface CasaGuardia {
  id: number;
  codigo: string;
  nombre: string | null;
  calle: string | null;
  numero: string | null;
  manzana: string | null;
  barrio: string | null;
  alarmaArmada: boolean;
  dueno: { nombre: string; telefono: string | null } | null;
  tienePlaca: boolean;
  online: boolean;
  puertaAbierta: boolean;
  alertasAbiertas: number;
}

export interface CasaGuardiaDetalle {
  id: number;
  codigo: string;
  nombre: string | null;
  calle: string | null;
  numero: string | null;
  manzana: string | null;
  barrio: string | null;
  estado: EstadoCasa | null;
  miembros: { usuarioId: number; rol: RolCasa; nombre: string; telefono: string | null }[];
  contactos: { nombre: string; telefono: string; relacion: string | null }[];
  eventos: Evento[];
}

// Admin
export interface UsuarioAdmin {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string | null;
  rol: Rol;
  activo: boolean;
  debeCambiarPassword: boolean;
  membresias?: { rol: RolCasa; casaId: number }[];
}

export interface DispositivoAdmin {
  id: number;
  deviceId: string;
  nombre: string | null;
  casaId: number | null;
  online: boolean;
  puertaAbierta: boolean | null;
  wifiSsid: string | null;
  wifiRssi: number | null;
  firmwareVersion: string | null;
  ultimaConexion: string | null;
  vinculadoEn: string | null;
  casa?: { id: number; nombre: string | null; calle: string | null; numero: string | null; barrio: string | null } | null;
}

export interface CasaAdmin {
  id: number;
  codigo: string;
  nombre: string | null;
  calle: string | null;
  numero: string | null;
  manzana: string | null;
  barrio: string | null;
  alarmaArmada: boolean;
  retardoEntradaSeg: number;
  activa: boolean;
  miembros: (Miembro & { id: number })[];
  dispositivos: DispositivoAdmin[];
}

export interface EstadoSistema {
  db: boolean;
  mqtt: { activo: boolean; clientes: number };
  sms: boolean;
  conteos: { usuarios: number; casas: number; placas: number; placasOnline: number; pushTokens: number };
  version: string;
  uptimeSeg: number;
}
