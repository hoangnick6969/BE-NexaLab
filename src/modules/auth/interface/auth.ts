import {
  Inject,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Db } from "../../../db/db";
import { verify, sign } from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
export const hashToken = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("hex");
export const publicUser = (u: any) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  fullName: u.fullName,
  role: u.role,
  grade: u.grade,
  studentLevel: u.studentLevel,
  mustChangePassword: u.mustChangePassword,
});
export const access = (u: any, sessionId: string) =>
  sign({ sub: u.id, role: u.role, sid: sessionId }, process.env.JWT_SECRET!, {
    expiresIn: "15m",
    issuer: "nexalab",
  });
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private reflector: Reflector,
    @Inject(Db) private db: Db,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("public", [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest();
    try {
      req.user = verify(
        (req.headers.authorization ?? "").replace(/^Bearer /, ""),
        process.env.JWT_SECRET!,
        { issuer: "nexalab" },
      );
    } catch {
      throw new UnauthorizedException("Vui lòng đăng nhập lại");
    }
    if (typeof req.user.sid !== "string") throw new UnauthorizedException();
    const session = await this.db.session.findFirst({
      where: {
        id: req.user.sid,
        userId: req.user.sub,
        kind: "refresh",
        expiresAt: { gt: new Date() },
      },
      select: {
        user: {
          select: { role: true, status: true, mustChangePassword: true, grade: true },
        },
      },
    });
    if (!session)
      throw new UnauthorizedException("Phiên đã hết hạn hoặc bị thu hồi");
    // Fetch the session and its owner in one database round trip. This keeps
    // revocation/status checks authoritative while avoiding a second remote
    // query on every authenticated request.
    const user = session.user;
    if (user.status !== "active")
      throw new UnauthorizedException("Tài khoản đã bị khóa");
    req.user.role = user.role;
    // The access token carries no grade; grade-scoped reads (foundational progress) need it.
    req.user.grade = user.grade;
    if (
      user.mustChangePassword &&
      !["/auth/me", "/auth/password", "/auth/logout"].some((path) =>
        req.path.endsWith(path),
      )
    )
      throw new ForbiddenException({
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "Bạn cần đổi mật khẩu tạm trước khi tiếp tục",
      });
    const roles = this.reflector.getAllAndOverride<string[]>("roles", [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(req.user.role))
      throw new ForbiddenException("Không có quyền thực hiện");
    return true;
  }
}
