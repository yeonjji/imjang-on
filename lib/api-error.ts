export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  return Response.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
    { status: 500 },
  );
}
