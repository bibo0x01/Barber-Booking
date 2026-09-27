export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly errors: unknown[];

    constructor(statusCode: number, message: string, errors: unknown[] = []) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.errors = errors;
    }
}