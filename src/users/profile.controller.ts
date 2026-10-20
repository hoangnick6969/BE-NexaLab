import { Body, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../common/decorators";
import { audit } from "../common/audit";
import { Db } from "../infra/db";
import { readTtl, storage, storageEnv, uploadTtl } from "../infra/storage";
import { mergePreferences, preferencesUpdateSchema, readPreferences } from "./preferences";
import { assertAvatarObject, assertOwnAvatarKey, avatarConfirmSchema, avatarUploadSchema, newAvatarKey, profileUpdateSchema, releasedAvatarKey } from "./avatar";

const profileSelect = {
  id: true,
  username: true,
  email: true,
  fullName: true,
  role: true,
  grade: true,
  emailVerifiedAt: true,
  createdAt: true,
  avatarKey: true,
  avatarUpdatedAt: true,
  preferences: true,
} as const;

/** Account profile and private avatar (acc-2, D-ACC-03). */
@ApiTags("Profile")
@ApiBearerAuth()
@Controller()
export class ProfileController {
  constructor(@Inject(Db) private db: Db) {}

  private async view(user: any) {
    const { avatarKey, preferences, ...rest } = user;
    return {
      ...rest,
      preferences: readPreferences(preferences),
      // Students' names are provisioned by their teacher; adults may rename themselves.
      canEditName: user.role !== "STUDENT",
      avatarUrl: avatarKey ? await storage().presignGet(avatarKey, readTtl()) : null,
    };
  }

  private async load(id: string) {
    const user = await this.db.user.findUnique({ where: { id }, select: profileSelect });
    if (!user) throw new NotFoundException();
    return user;
  }

  /** Replaces or clears the avatar and deletes the previous object after the row is updated. */
  private async setAvatar(actor: any, userId: string, key: string | null, action: string) {
    const before = await this.load(userId);
    const updated = await this.db.user.update({ where: { id: userId }, data: { avatarKey: key, avatarUpdatedAt: key ? new Date() : null }, select: profileSelect });
    if (before.avatarKey && before.avatarKey !== key) await storage().delete(before.avatarKey).catch(() => undefined);
    await audit(this.db, { actor, action, targetType: "User", targetId: userId });
    return updated;
  }

  @Get("me/profile")
  @ApiOperation({ summary: "Own profile; avatarUrl is a short-lived presigned URL" })
  async profile(@Req() req: any) {
    return this.view(await this.load(req.user.sub));
  }

  @Patch("me/profile")
  async updateProfile(@Req() req: any, @Body() body: unknown) {
    const b = profileUpdateSchema.parse(body);
    if (req.user.role === "STUDENT")
      throw new ForbiddenException({ code: "PROFILE_NAME_LOCKED", message: "Tên học sinh do giáo viên quản lý" });
    const updated = await this.db.user.update({ where: { id: req.user.sub }, data: { fullName: b.fullName }, select: profileSelect });
    await audit(this.db, { actor: req.user, action: "user.profile.update", targetType: "User", targetId: req.user.sub, after: { name: b.fullName } });
    return this.view(updated);
  }

  @Patch("me/preferences")
  @ApiOperation({ summary: "Merge UI preferences (theme, locale); every role, students included" })
  async updatePreferences(@Req() req: any, @Body() body: unknown) {
    const b = preferencesUpdateSchema.parse(body);
    const current = await this.db.user.findUnique({ where: { id: req.user.sub }, select: { preferences: true } });
    if (!current) throw new NotFoundException();
    const preferences = mergePreferences(current.preferences, b);
    await this.db.user.update({ where: { id: req.user.sub }, data: { preferences } });
    return { preferences };
  }

  @Post("me/avatar/upload-url")
  @ApiOperation({ summary: "Presigned PUT for a new avatar under the caller's private staging prefix" })
  async avatarUploadUrl(@Req() req: any, @Body() body: unknown) {
    const b = avatarUploadSchema.parse(body);
    const key = newAvatarKey(storageEnv(), req.user.sub, b.contentType);
    const ttl = uploadTtl();
    return { key, url: await storage().presignPut(key, b.contentType, ttl), headers: { "Content-Type": b.contentType }, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  @Post("me/avatar")
  @ApiOperation({ summary: "Confirm an uploaded avatar after server-side size and type checks; moves it out of staging" })
  async confirmAvatar(@Req() req: any, @Body() body: unknown) {
    const { key } = avatarConfirmSchema.parse(body);
    assertOwnAvatarKey(key, storageEnv(), req.user.sub);
    assertAvatarObject(await storage().head(key));
    const released = releasedAvatarKey(key, storageEnv(), req.user.sub);
    await storage().copy(key, released);
    await storage().delete(key).catch(() => undefined);
    return this.view(await this.setAvatar(req.user, req.user.sub, released, "user.avatar.update"));
  }

  @Delete("me/avatar")
  async removeOwnAvatar(@Req() req: any) {
    return this.view(await this.setAvatar(req.user, req.user.sub, null, "user.avatar.remove"));
  }

  @Roles("TEACHER")
  @Delete("classes/:classId/students/:studentId/avatar")
  @ApiOperation({ summary: "Owning teacher removes an inappropriate avatar of an approved class member" })
  async teacherRemoveAvatar(@Req() req: any, @Param("classId") classId: string, @Param("studentId") studentId: string) {
    const member = await this.db.enrollment.findFirst({ where: { classId, studentId, status: "approved", classroom: { teacherId: req.user.sub } } });
    if (!member) throw new ForbiddenException({ code: "CLASS_ACCESS_DENIED", message: "Không phải học sinh trong lớp của bạn" });
    await this.setAvatar(req.user, studentId, null, "user.avatar.moderate");
    return { removed: true };
  }

  @Roles("ADMIN")
  @Delete("admin/users/:id/avatar")
  async adminRemoveAvatar(@Req() req: any, @Param("id") id: string) {
    await this.setAvatar(req.user, id, null, "user.avatar.moderate");
    return { removed: true };
  }
}
