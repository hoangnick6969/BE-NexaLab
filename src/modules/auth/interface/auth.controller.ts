import { readRemember, refreshCookieOptions, sessionExpiry } from "../application/session-policy";
import { BadRequestException, Body, Controller, Get, Inject, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import * as argon from "argon2";
import { z } from "zod";
import { access, hashToken, publicUser, token } from "./auth";
import { Public } from "../../../common/decorators";
import { FORGOT_MESSAGE, completePasswordReset, requestPasswordReset } from "../application/password-reset";
import { Db } from "../../../db/db";
import { smtpDeliver } from "../../mail/infrastructure/mail";
import { issueEmailVerification } from "../../parents/application/parent-links";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { email, password, text, username } from "../../../common/validation";
import { forgetSession, forgetUser } from "./session-cache";

@ApiTags("NexaLab")
@ApiBearerAuth()
@Controller()
export class AuthController {
  constructor(@Inject(Db) private db: Db, @Inject(RequestRateLimiter) private limiter: RequestRateLimiter) {}
  private async session(user: any, res: any, remember: boolean) {
    const refresh = token();
    const session = await this.db.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refresh),
        remember,
        expiresAt: sessionExpiry(remember),
      },
    });
    res.cookie("refresh", refresh, refreshCookieOptions(remember));
    return { user: publicUser(user), accessToken: access(user, session.id) };
  }
  @Public() @Post("auth/login") async login(
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.limiter.rate("login:" + req.ip);
    const b = z.object({ email, password: z.string().max(128) }).parse(body);
    const user = await this.db.user.findUnique({ where: { email: b.email } });
    if (
      !user ||
      user.role === "STUDENT" ||
      user.role === "ADMIN" ||
      user.status !== "active" ||
      !(await argon.verify(user.passwordHash, b.password))
    )
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Email hoặc mật khẩu không đúng" });
    return this.session(user, res, readRemember(body));
  }
  @Public() @Post("auth/admin/login") async adminLogin(
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.limiter.rate("admin-login:" + req.ip);
    const b = z.object({ email, password: z.string().max(128) }).parse(body);
    const user = await this.db.user.findUnique({ where: { email: b.email } });
    if (
      !user ||
      user.role !== "ADMIN" ||
      user.status !== "active" ||
      !(await argon.verify(user.passwordHash, b.password))
    )
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Email hoặc mật khẩu quản trị không đúng" });
    return this.session(user, res, readRemember(body));
  }
  @Public() @Post("auth/student/login") async studentLogin(
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.limiter.rate("student-login:" + req.ip);
    const b = z.object({ username, password: z.string().max(128) }).parse(body);
    const user = await this.db.user.findUnique({ where: { username: b.username } });
    if (
      !user ||
      user.role !== "STUDENT" ||
      user.status !== "active" ||
      !(await argon.verify(user.passwordHash, b.password))
    )
      throw new UnauthorizedException({ code: "INVALID_CREDENTIALS", message: "Tên đăng nhập hoặc mật khẩu không đúng" });
    if (
      user.mustChangePassword &&
      user.temporaryPasswordExpiresAt &&
      user.temporaryPasswordExpiresAt < new Date()
    )
      throw new UnauthorizedException({ code: "TEMPORARY_PASSWORD_EXPIRED", message: "Mật khẩu tạm đã hết hạn. Hãy nhờ giáo viên cấp lại." });
    return this.session(user, res, readRemember(body));
  }
  @Public() @Post("auth/register") async register(
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.limiter.rate("register:" + req.ip, 3);
    const b = z
      .object({
        email,
        password,
        fullName: text,
        role: z.literal("PARENT"),
        consent: z.literal(true),
      })
      .parse(body);
    const user = await this.db.user.create({
      data: {
        email: b.email,
        fullName: b.fullName,
        passwordHash: await argon.hash(b.password),
        role: "PARENT",
        consentAt: new Date(),
      },
    });
    // The verification link is mailed in the background; the parent can request a new one from the progress page.
    void issueEmailVerification(this.db, user, smtpDeliver).catch(() => console.error("NexaLab email-verification request failed"));
    return this.session(user, res, false);
  }
  @Public() @Post("auth/refresh") async refresh(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.limiter.rate("refresh:" + req.ip, 60);
    const hash = hashToken(req.cookies.refresh ?? "");
    const s = await this.db.session.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (
      !s ||
      s.kind !== "refresh" ||
      s.expiresAt < new Date() ||
      s.user.status !== "active"
    )
      throw new UnauthorizedException();
    const deleted = await this.db.session.deleteMany({ where: { id: s.id } });
    forgetSession(s.id);
    if (!deleted.count) throw new UnauthorizedException();
    return this.session(s.user, res, s.remember);
  }
  @Public() @Post("auth/logout") async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const tokenHash = hashToken(req.cookies.refresh ?? "");
    const ending = await this.db.session.findUnique({ where: { tokenHash }, select: { id: true } });
    await this.db.session.deleteMany({ where: { tokenHash } });
    if (ending) forgetSession(ending.id);
    res.clearCookie("refresh", { path: "/api/auth" });
    return { ok: true };
  }
  @Get("auth/me") async me(@Req() req: any) {
    return publicUser(
      await this.db.user.findUniqueOrThrow({ where: { id: req.user.sub } }),
    );
  }
  @Post("auth/password") async changePassword(
    @Req() req: any,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: any,
  ) {
    const b = z.object({ currentPassword: z.string(), password }).parse(body);
    const u = await this.db.user.findUniqueOrThrow({
      where: { id: req.user.sub },
    });
    if (!(await argon.verify(u.passwordHash, b.currentPassword)))
      throw new BadRequestException({ code: "CURRENT_PASSWORD_INCORRECT", message: "Mật khẩu cũ không đúng" });
    // The new session keeps the remember-me choice of the session that changed the password.
    const current = await this.db.session.findUnique({ where: { id: req.user.sid }, select: { remember: true } });
    const remember = current?.remember ?? false;
    await this.db.$transaction([
      this.db.user.update({
        where: { id: u.id },
        data: {
          passwordHash: await argon.hash(b.password),
          mustChangePassword: false,
          temporaryPasswordExpiresAt: null,
        },
      }),
      this.db.session.deleteMany({ where: { userId: u.id } }),
    ]);
    forgetUser(u.id);
    const refreshedUser = await this.db.user.findUniqueOrThrow({
      where: { id: u.id },
    });
    return this.session(refreshedUser, res, remember);
  }
  @Public() @Post("auth/forgot") async forgot(
    @Req() req: any,
    @Body() body: unknown,
  ) {
    this.limiter.rate("forgot:" + req.ip, 3);
    const b = z.object({ email }).parse(body);
    // C2-T4: answered before lookup or delivery finishes, so neither existence
    // nor delivery failure shows in the response or its timing.
    void requestPasswordReset(this.db, b.email, smtpDeliver).catch(() => console.error("NexaLab password-reset request failed"));
    return { message: FORGOT_MESSAGE };
  }
  @Public() @Post("auth/reset") async reset(
    @Body() body: unknown,
    @Req() req: any,
  ) {
    this.limiter.rate("reset:" + req.ip, 5);
    const b = z.object({ token: z.string().max(200), password }).parse(body);
    await completePasswordReset(this.db, b.token, b.password);
    return { ok: true };
  }
}
