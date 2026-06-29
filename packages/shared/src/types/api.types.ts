/** Envuelve toda respuesta exitosa de la API */
export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: PaginationMeta;
};

/** Envuelve toda respuesta de error de la API */
export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export type PaginationMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type PaginationQuery = {
  page?: number;
  pageSize?: number;
};

/** Helper para construir respuestas exitosas en el backend */
export function apiSuccess<T>(data: T, meta?: PaginationMeta): ApiSuccess<T> {
  return { success: true, data, ...(meta ? { meta } : {}) };
}

/** Helper para construir respuestas de error en el backend */
export function apiError(code: string, message: string, details?: unknown): ApiError {
  return { success: false, error: { code, message, details } };
}
