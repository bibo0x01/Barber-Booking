export type BarberService = {
    id: string;
    barberId: string;
    name: string;
    description: string | null;
    price: number;
    durationMinutes: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
};
