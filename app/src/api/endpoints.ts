import { api, apiConEstado } from "./cliente";
import type {
  Casa,
  CasaAdmin,
  CasaGuardia,
  CasaGuardiaDetalle,
  Contacto,
  DispositivoAdmin,
  EstadoCasa,
  EstadoSistema,
  Evento,
  Miembro,
  Pagina,
  ResumenGuardia,
  Rol,
  RolCasa,
  Sesion,
  Usuario,
  UsuarioAdmin,
} from "./tipos";

const qs = (p: Record<string, string | number | undefined | null>) => {
  const s = Object.entries(p)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return s ? `?${s}` : "";
};

// ---------------------------------------------------------------- Auth
export const auth = {
  login: (email: string, password: string) =>
    api<Sesion>("/auth/login", { metodo: "POST", cuerpo: { email, password }, sinAuth: true }),
  logout: (refreshToken: string | null, pushToken: string | null) =>
    api<void>("/auth/logout", { metodo: "POST", cuerpo: { refreshToken, pushToken }, sinAuth: true }),
  cambiarPassword: (actual: string, nueva: string) =>
    api<Sesion>("/auth/cambiar-password", { metodo: "POST", cuerpo: { actual, nueva } }),
};

// ---------------------------------------------------------------- Yo
export const yo = {
  obtener: () => api<Usuario>("/api/me"),
  actualizar: (d: { nombre?: string; apellido?: string; telefono?: string | null }) =>
    api<Usuario>("/api/me", { metodo: "PUT", cuerpo: d }),
  registrarPush: (token: string, plataforma: string) =>
    api<void>("/api/push-tokens", { metodo: "POST", cuerpo: { token, plataforma } }),
  pruebaPush: () => api<{ enviados: number }>("/api/me/notificacion-prueba", { metodo: "POST" }),
};

// ---------------------------------------------------------------- Cliente
export const casas = {
  mias: () => api<Casa[]>("/api/casas/mias"),
  obtener: (id: number) => api<Casa>(`/api/casas/${id}`),
  alarma: (id: number, armada: boolean) =>
    api<{ estado: EstadoCasa; advertencia: string | null }>(`/api/casas/${id}/alarma`, { metodo: "PUT", cuerpo: { armada } }),
  eventos: (id: number, cursor?: number) => api<Pagina<Evento>>(`/api/casas/${id}/eventos${qs({ cursor, limit: 25 })}`),
  miembros: (id: number) => api<Miembro[]>(`/api/casas/${id}/miembros`),
  agregarMiembro: (id: number, email: string) => api<Miembro>(`/api/casas/${id}/miembros`, { metodo: "POST", cuerpo: { email } }),
  quitarMiembro: (id: number, usuarioId: number) => api<void>(`/api/casas/${id}/miembros/${usuarioId}`, { metodo: "DELETE" }),
  codigoVinculacion: (id: number) =>
    api<{ codigo: string; expiraEn: string }>(`/api/casas/${id}/codigo-vinculacion`, { metodo: "POST" }),
};

export const contactos = {
  listar: () => api<Contacto[]>("/api/contactos"),
  crear: (c: Omit<Contacto, "id">) => api<Contacto>("/api/contactos", { metodo: "POST", cuerpo: c }),
  editar: (id: number, c: Omit<Contacto, "id">) => api<Contacto>(`/api/contactos/${id}`, { metodo: "PUT", cuerpo: c }),
  borrar: (id: number) => api<void>(`/api/contactos/${id}`, { metodo: "DELETE" }),
};

export const placas = {
  tokenConfig: (id: number) => api<{ token: string; expiraEn: string }>(`/api/dispositivos/${id}/token-config`, { metodo: "POST" }),
  modoConfig: (id: number) =>
    apiConEstado<{ ok: boolean; mensaje?: string }>(`/api/dispositivos/${id}/modo-config`, { metodo: "POST" }),
  reset: (id: number) => apiConEstado<{ ok: boolean; mensaje?: string }>(`/api/dispositivos/${id}/reset`, { metodo: "POST" }),
  desvincular: (id: number) => api<void>(`/api/dispositivos/${id}/vinculo`, { metodo: "DELETE" }),
};

// ---------------------------------------------------------------- Guardia
export const guardia = {
  resumen: () => api<ResumenGuardia>("/api/guardia/resumen"),
  casas: () => api<CasaGuardia[]>("/api/guardia/casas"),
  casa: (id: number) => api<CasaGuardiaDetalle>(`/api/guardia/casas/${id}`),
  eventos: (p: { estado?: string; casaId?: number; cursor?: number } = {}) =>
    api<Pagina<Evento>>(`/api/guardia/eventos${qs({ ...p, limit: 30 })}`),
  tomar: (id: number) => api<Evento>(`/api/guardia/eventos/${id}/tomar`, { metodo: "POST" }),
  resolver: (id: number, resultado: "RESUELTO" | "FALSA_ALARMA", nota?: string) =>
    api<Evento>(`/api/guardia/eventos/${id}/resolver`, { metodo: "POST", cuerpo: { resultado, nota } }),
  resolverTodo: (casaId: number) => api<{ resueltos: number }>(`/api/guardia/casas/${casaId}/resolver-todo`, { metodo: "POST", cuerpo: {} }),
};

// ---------------------------------------------------------------- Admin
export interface DatosUsuario {
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string | null;
  rol: Rol;
  activo?: boolean;
}

export interface DatosCasa {
  nombre?: string | null;
  calle?: string | null;
  numero?: string | null;
  manzana?: string | null;
  barrio?: string | null;
  retardoEntradaSeg?: number;
  activa?: boolean;
}

export const admin = {
  usuarios: (p: { q?: string; rol?: Rol } = {}) => api<UsuarioAdmin[]>(`/api/admin/usuarios${qs(p)}`),
  crearUsuario: (d: DatosUsuario) =>
    api<{ usuario: UsuarioAdmin; passwordTemporal: string | null }>("/api/admin/usuarios", { metodo: "POST", cuerpo: d }),
  editarUsuario: (id: number, d: Partial<DatosUsuario>) => api<UsuarioAdmin>(`/api/admin/usuarios/${id}`, { metodo: "PUT", cuerpo: d }),
  resetPassword: (id: number) => api<{ passwordTemporal: string }>(`/api/admin/usuarios/${id}/reset-password`, { metodo: "POST" }),
  casas: (q?: string) => api<CasaAdmin[]>(`/api/admin/casas${qs({ q })}`),
  casa: (id: number) => api<CasaAdmin>(`/api/admin/casas/${id}`),
  crearCasa: (d: DatosCasa & { miembros?: { usuarioId: number; rol: RolCasa }[] }) =>
    api<CasaAdmin>("/api/admin/casas", { metodo: "POST", cuerpo: d }),
  editarCasa: (id: number, d: DatosCasa) => api<CasaAdmin>(`/api/admin/casas/${id}`, { metodo: "PUT", cuerpo: d }),
  miembros: (id: number, miembros: { usuarioId: number; rol: RolCasa }[]) =>
    api<CasaAdmin>(`/api/admin/casas/${id}/miembros`, { metodo: "PUT", cuerpo: { miembros } }),
  dispositivos: (estado?: string) => api<DispositivoAdmin[]>(`/api/admin/dispositivos${qs({ estado })}`),
  sistema: () => api<EstadoSistema>("/api/admin/sistema"),
};
