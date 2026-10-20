import { randomBytes } from "node:crypto";

export const temporaryPassword = () => `Nexa-${randomBytes(9).toString("base64url")}`;
