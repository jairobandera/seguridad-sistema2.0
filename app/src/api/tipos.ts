// Tipos de la API (ver docs/protocolo.md)

export type Rol = "ADMIN" | "GUARDIA" | "CLIENTE";
export type RolCasa = "DUENO" | "FAMILIAR";
export type Severidad = "INFO" | "ALERTA" | "CRITICA";
export type EstadoAtencion = "PENDIENTE" | "EN_CURSO" | "RESUELTO" | "FALSA_ALARMA";
/** BARRIO: casa dentro de un barrio (con o sin guardia). INDIVIDUAL: casa suelta, sin guardia. */
export type Paquete = "BARRIO" | "INDIVIDUAL";

export interface CasaResumen {
  id: number;
  nombre: string | null;
  calle: string | null;
  numero: string | null;
  paquete: Paquete;
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

/** Un dispositivo de la casa ("Puerta principal", "Ventana cocina"...) con su estado en vivo. */
export interface DispositivoCasa {
  id: number;
  deviceId: string;
  nombre: string | null;
  online: boolean;
  puertaAbierta: boolean | null;
  rssi: number | null;
  ssid: string | null;
  /** % de la batería (null si no tiene batería conectada) */
  bateria: number | null;
  /** Armado parcial: quedó afuera de la alarma (no la dispara) */
  excluido: boolean;
  firmwareVersion: string | null;
  ultimaConexion: string | null;
}

export interface EstadoCasa {
  casaId: number;
  alarmaArmada: boolean;
  /** Alguno abierto */
  puertaAbierta: boolean;
  /** Todos conectados */
  online: boolean;
  dispositivosOffline: number;
  /** Armada dejando algún dispositivo afuera */
  armadoParcial: boolean;
  tieneGuardia: boolean;
  dispositivos: DispositivoCasa[];
}

export interface Casa {
  id: number;
  codigo: string;
  nombre: string | null;
  calle: string | null;
  numero: string | null;
  manzana: string | null;
  paquete: Paquete;
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
  /** Dato extra del evento (ej. % de batería en BATERIA_BAJA) */
  valor: string | null;
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
  dispositivosOffline: number;
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
  cantidadDispositivos: number;
  dispositivosOffline: number;
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
  /** Barrios que cubre (solo guardias) */
  barrioIds?: number[];
}

export interface Barrio {
  id: number;
  nombre: string;
  tieneGuardia: boolean;
  activo: boolean;
}

export interface ResumenCasas {
  casas: number;
  casasArmadas: number;
  dispositivos: number;
  dispositivosOffline: number;
}

/** Todos los sistemas que se brindan: barrios e individuales. */
export interface Sistemas {
  barrios: (Barrio & ResumenCasas & { guardias: { id: number; nombre: string }[] })[];
  individuales: ResumenCasas;
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
  bateria: number | null;
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
  paquete: Paquete;
  barrioId: number | null;
  barrio: string | null;
  tieneGuardia: boolean;
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
  conteos: { usuarios: number; casas: number; individuales: number; barrios: number; placas: number; placasOnline: number; pushTokens: number };
  version: string;
  uptimeSeg: number;
}
