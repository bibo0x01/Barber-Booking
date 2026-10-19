export class ApiError extends Error {
    public readonly statusCode: number;
    public readonly errors: unknown[];
    public readonly exposeDetails: boolean;

    constructor(statusCode: number, message: string, errors: unknown[] = [], exposeDetails = true) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.errors = errors;
        this.exposeDetails = exposeDetails;
    }
}