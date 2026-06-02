import { FullSlug } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"

export const RobotsTxt: QuartzEmitterPlugin = () => ({
  name: "RobotsTxt",
  async *emit(ctx) {
    const baseUrl = ctx.cfg.configuration.baseUrl ?? ""
    const sitemap = baseUrl ? `\nSitemap: https://${baseUrl}/sitemap.xml\n` : "\n"
    const content = `User-agent: *\nAllow: /\n${sitemap}`
    yield write({
      ctx,
      content,
      slug: "robots" as FullSlug,
      ext: ".txt",
    })
  },
  async *partialEmit() {},
})
