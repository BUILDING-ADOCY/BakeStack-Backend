import type { SecuritySessionValidationResponse } from '../../auth/auth.types';
import type { ProvisionedIdentity } from '../../auth/identity-provisioning.service';
import type { RequestContext } from '../context/request-context.interface';

declare module 'express-serve-static-core' {
  interface Request {
    context: RequestContext;
    identity?: SecuritySessionValidationResponse;
    provisionedIdentity?: ProvisionedIdentity;
  }
}
