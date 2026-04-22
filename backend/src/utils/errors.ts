export class AppError extends Error {
  constructor(
    public message: string,
    public status: number = 400,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(msg: string, code?: string) {
    return new AppError(msg, 400, code);
  }

  static notFound(msg: string, code?: string) {
    return new AppError(msg, 404, code);
  }

  static unauthorized(msg: string = 'Unauthorized') {
    return new AppError(msg, 401);
  }

  static internal(msg: string = 'Internal server error') {
    return new AppError(msg, 500);
  }
}
