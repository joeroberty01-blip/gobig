// Pure verification constants, safe to import from client components and validators.

export type DocumentType = "NATIONAL_ID" | "PASSPORT" | "BUSINESS_LICENSE" | "TIN_CERTIFICATE" | "PROFESSIONAL_CERTIFICATE" | "OTHER";
export const DOCUMENT_TYPES: readonly DocumentType[] = ["NATIONAL_ID", "PASSPORT", "BUSINESS_LICENSE", "TIN_CERTIFICATE", "PROFESSIONAL_CERTIFICATE", "OTHER"];
