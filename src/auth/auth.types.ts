export interface SecuritySessionValidationResponse {
  valid: boolean;
  session: {
    id: string;
    expiresAt: string;
    restricted: boolean;
    lastSeenAt: string;
  } | null;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phoneNumber: string | null;
    emailVerifiedAt: string | null;
    phoneVerifiedAt: string | null;
    status: string;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    primaryEmail: string | null;
    primaryPhone: string | null;
    acceptedTermsAt: string | null;
  } | null;
  roles: string[];
  memberships: Array<{
    id: string;
    organizationId: string;
    role: string;
    status: string;
  }>;
}

export type SecurityAuthResult = SecuritySessionValidationResponse;
