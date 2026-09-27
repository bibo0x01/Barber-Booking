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

export type PublicBarberProfile = {
    id: string;
    businessName: string;
    bio: string | null;
    isVerified: boolean;
};
