export const hasMinimumProductionJwtSecretLength = (secret: string): boolean =>
    Buffer.byteLength(secret, 'utf8') >= 32;
