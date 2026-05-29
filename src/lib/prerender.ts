import prerenderIsos from "../../config/prerender-isos.json"

export function getIsoPaths() {
  return (prerenderIsos as string[]).map((iso) => ({ params: { iso } }))
}
