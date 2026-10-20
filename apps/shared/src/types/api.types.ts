/** Generic API response envelope used by EPI's frontend and backend. */
export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta?: PaginationMeta;
};

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

export function apiSuccess<T>(data: T, meta?: PaginationMeta): ApiSuccess<T> {
  return { success: true, data, ...(meta ? { meta } : {}) };
}

export function apiError(code: string, message: string, details?: unknown): ApiError {
  return { success: false, error: { code, message, details } };
}
