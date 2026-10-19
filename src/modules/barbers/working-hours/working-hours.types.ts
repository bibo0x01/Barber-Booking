export type BarberWorkingHour = {
    id: string;
    barberId: string;
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
};

export type PublicBarberWorkingHour = {
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isActive: boolean;
};
