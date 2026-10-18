import { SetMetadata } from "@nestjs/common";

/** Route metadata read by the global AuthGuard (auth/auth.ts): `public` skips authentication, `roles` restricts by role. */
export const Public = () => SetMetadata("public", true);
export const Roles = (...roles: string[]) => SetMetadata("roles", roles);
