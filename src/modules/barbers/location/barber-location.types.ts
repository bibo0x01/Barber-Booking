import { Prisma } from '@prisma/client';

export type BarberLocationCoordinates = {
    latitude: number;
    longitude: number;
    address: string | null;
};

export type DecimalCoordinate = Prisma.Decimal | number;

export const serializeLocationCoordinates = (location: {
    latitude: DecimalCoordinate;
    longitude: DecimalCoordinate;
    address: string | null;
}): BarberLocationCoordinates => ({
    latitude: typeof location.latitude === 'number' ? location.latitude : Number(location.latitude.toString()),
    longitude: typeof location.longitude === 'number' ? location.longitude : Number(location.longitude.toString()),
    address: location.address,
});
