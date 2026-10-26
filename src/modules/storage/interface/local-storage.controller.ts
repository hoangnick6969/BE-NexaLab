import { Controller, ForbiddenException, Get, Param, Put, Req, Res } from "@nestjs/common";
import { Public } from "../../../common/decorators";
import { localStorage, parseByteRange, verifyLocalGrant } from "../infrastructure/storage";

export { parseByteRange } from "../infrastructure/storage";

/** Serves the local driver's signed URLs; never used when ASSET_STORAGE=r2. */
@Controller("storage/local")
export class LocalStorageController {
  @Public()
  @Put(":token")
  async put(@Param("token") token: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
    const grant = verifyLocalGrant(token);
    const local = localStorage();
    if (!local || !grant || !["put", "part"].includes(grant.op))
      throw new ForbiddenException({ code: "SIGNATURE_INVALID", message: "Liên kết tải lên không hợp lệ hoặc đã hết hạn" });
    if (grant.op === "part") {
      await local.writePart(grant.uploadId!, grant.part!, req);
      res.setHeader("ETag", `"local-${grant.part}"`);
      return { ok: true };
    }
    await local.writeObject(grant.key, req);
    return { ok: true };
  }
  @Public()
  @Get(":token")
  async get(@Param("token") token: string, @Req() req: any, @Res() res: any) {
    const grant = verifyLocalGrant(token);
    const local = localStorage();
    if (!local || !grant || grant.op !== "get")
      return res.status(403).json({ statusCode: 403, code: "SIGNATURE_INVALID", message: "Liên kết đã hết hạn" });
    const head = await local.head(grant.key);
    if (!head) return res.status(404).end();
    res.setHeader("Content-Type", grant.ct ?? "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    if (grant.name) res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(grant.name)}`);
    if (req.method === "HEAD") {
      res.setHeader("Content-Length", String(head.bytes));
      return res.end();
    }
    const range = parseByteRange(req.headers.range, head.bytes);
    if (range === "invalid") {
      res.setHeader("Content-Range", `bytes */${head.bytes}`);
      return res.status(416).end();
    }
    if (range) {
      const body = await local.readRange(grant.key, range.start, range.end);
      res.status(206);
      res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${head.bytes}`);
      res.setHeader("Content-Length", String(body.length));
      return res.end(body);
    }
    res.setHeader("Content-Length", String(head.bytes));
    (await local.stream(grant.key)).pipe(res);
  }
}
