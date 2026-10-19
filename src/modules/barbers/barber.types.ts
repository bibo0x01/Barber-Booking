export type BarberProfile = {
    id: string;
    userId: string;
    businessName: string;
    bio: string | null;
    isVerified: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
};
